import shaderCode from './shader.wgsl'
import postprocessCode from './postprocess.wgsl'
import atlasPath from '../asset/atlas.png'
import { Group } from './Group'
import { Uniform } from './Uniform'
import { Mat4, mat4 } from 'wgpu-matrix'

type TODO = any

export interface Mesh {
  render(pass: GPURenderPassEncoder): void
}

export type ContextOptions = {
  /** @param delta In nanoseconds. */
  onGpuTime: (delta: bigint) => void
}

export class Context {
  device: GPUDevice
  meshes: Mesh[] = []

  #format: GPUTextureFormat
  common: Group<TODO>
  #commonPp: Group<TODO>
  #options: Partial<ContextOptions>

  #depthTexture: GPUTexture | null = null
  #screenTexture: GPUTexture | null = null

  #timestamp: TimestampCollector | null

  constructor (
    device: GPUDevice,
    format: GPUTextureFormat,
    common: Group<TODO>,
    commonPp: Group<TODO>,
    options: Partial<ContextOptions>
  ) {
    this.device = device
    this.#format = format
    this.common = common
    this.#commonPp = commonPp
    this.#options = options
    this.#timestamp = new TimestampCollector(device)
  }

  static async create (
    format: GPUTextureFormat,
    options: Partial<ContextOptions> = {}
  ): Promise<Context> {
    const adapter = await navigator.gpu.requestAdapter()
    if (!adapter) {
      throw new TypeError('Failed to obtain WebGPU adapter.')
    }
    const canTimestamp = adapter.features.has('timestamp-query')
    const device = await adapter.requestDevice({
      requiredFeatures: canTimestamp ? ['timestamp-query'] : []
    })
    device.lost.then(info => {
      console.warn('WebGPU device lost. :(', info.message, info)
    })

    const check = captureError(device, 'initialization')

    const module = device.createShaderModule({
      label: 'main shader',
      code: shaderCode
    })
    const { messages } = await module.getCompilationInfo()
    if (messages.some(message => message.type === 'error')) {
      console.log(messages)
      throw new SyntaxError('Shader failed to compile.')
    }

    // Pipeline is like WebGL program; contains the shaders
    const pipeline = device.createRenderPipeline({
      label: 'main pipeline',
      layout: 'auto',
      vertex: {
        module,
        entryPoint: 'vertex_main',
        buffers: [
          // vertex buffer
          {
            // Bytes between the start of each vertex datum
            arrayStride: 8,
            // Change attribute per instance rather than vertex
            stepMode: 'instance',
            attributes: [{ shaderLocation: 0, offset: 0, format: 'uint32x2' }]
          }
        ]
      },
      // targets[0] corresponds to @location(0) in fragment_main's return value
      fragment: {
        module,
        entryPoint: 'fragment_main',
        targets: [
          {
            format,
            blend: {
              color: {
                operation: 'add',
                srcFactor: 'src-alpha',
                dstFactor: 'one-minus-src-alpha'
              },
              alpha: {}
            }
          }
        ]
      },
      primitive: { cullMode: 'back' },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth24plus'
      }
    })

    const modulePp = device.createShaderModule({
      label: 'post-processing shader',
      code: postprocessCode
    })
    const { messages: messagesPp } = await modulePp.getCompilationInfo()
    if (messagesPp.some(message => message.type === 'error')) {
      console.log(messagesPp)
      throw new SyntaxError('Post-processing shader failed to compile.')
    }
    const pipelinePp = device.createRenderPipeline({
      label: 'post-processing pipeline',
      layout: 'auto',
      vertex: { module: modulePp, entryPoint: 'vertex_main' },
      fragment: {
        module: modulePp,
        entryPoint: 'fragment_main',
        targets: [{ format }]
      }
    })

    const source = await fetch(atlasPath)
      .then(r => r.blob())
      .then(blob => createImageBitmap(blob, { colorSpaceConversion: 'none' }))
    const texture = device.createTexture({
      label: 'texture',
      format: 'rgba8unorm',
      size: [source.width, source.height],
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT
    })
    device.queue.copyExternalImageToTexture(
      { source, flipY: true },
      { texture },
      { width: source.width, height: source.height }
    )
    const sampler = device.createSampler()

    const common = new Group(device, pipeline, 0, {
      perspective: new Uniform(device, 0, 4 * 4 * 4),
      camera: new Uniform(device, 1, 4 * 4 * 4),
      sampler: { binding: 2, resource: sampler },
      texture: { binding: 3, resource: texture.createView() },
      textureSize: new Uniform(device, 4, 4 * 2)
    })
    common.uniforms.textureSize.data(
      new Float32Array([source.width / 16, source.height / 16])
    )

    const commonPp = new Group(device, pipelinePp, 0, {
      canvasSize: new Uniform(device, 0, 4 * 2),
      sampler: { binding: 1, resource: sampler }
    })

    await check()

    return new Context(device, format, common, commonPp, options)
  }

  async render (canvasTexture: GPUTexture, cameraTransform: Mat4) {
    if (!this.#depthTexture || !this.#screenTexture) {
      throw new Error('Attempted render before resize() was called.')
    }

    const check = captureError(this.device, 'render')

    this.common.uniforms.camera.data(new Float32Array(cameraTransform))

    // Encodes commands
    const encoder = this.device.createCommandEncoder({
      label: 'encoder'
    })
    {
      // You can run multiple render passes
      const pass = encoder.beginRenderPass({
        label: 'render pass',
        colorAttachments: [
          {
            view: this.#screenTexture.createView(),
            clearValue: [0.75, 0.85, 1, 1],
            loadOp: 'clear',
            storeOp: 'store'
          }
        ],
        depthStencilAttachment: {
          view: this.#depthTexture.createView(),
          depthClearValue: 1.0,
          depthLoadOp: 'clear',
          depthStoreOp: 'store'
        },
        timestampWrites: this.#timestamp?.getTimestampWrites()
      })
      pass.setPipeline(this.common.pipeline)
      pass.setBindGroup(0, this.common.group)
      for (const mesh of this.meshes) {
        mesh.render(pass)
      }
      pass.end()

      this.#timestamp?.copyBuffer(encoder)
    }
    {
      const pass = encoder.beginRenderPass({
        label: 'post processing pass',
        colorAttachments: [
          {
            view: canvasTexture.createView(),
            clearValue: [1, 0, 1, 1],
            loadOp: 'clear',
            storeOp: 'store'
          }
        ]
      })
      pass.setPipeline(this.#commonPp.pipeline)
      pass.setBindGroup(0, this.#commonPp.group)
      pass.setBindGroup(
        1,
        new Group(this.device, this.#commonPp.pipeline, 1, {
          texture: { binding: 0, resource: this.#screenTexture.createView() }
        }).group
      )
      pass.draw(6)
      pass.end()
    }
    // finish() returns a command buffer
    this.device.queue.submit([encoder.finish()])

    this.#timestamp?.read().then(delta => {
      if (delta) {
        this.#options.onGpuTime?.(delta)
      }
    })

    await check()
  }

  resize (width: number, height: number): void {
    this.common.uniforms.perspective.data(
      new Float32Array(mat4.perspective(Math.PI / 2, width / height, 0.1, 1000))
    )
    this.#commonPp.uniforms.canvasSize.data(new Float32Array([width, height]))

    this.#depthTexture?.destroy()
    this.#depthTexture = this.device.createTexture({
      size: [width, height],
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT
    })

    this.#screenTexture?.destroy()
    this.#screenTexture = this.device.createTexture({
      size: [width, height],
      format: this.#format,
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT
    })
  }
}

function captureError (device: GPUDevice, stage: string): () => Promise<void> {
  device.pushErrorScope('internal')
  device.pushErrorScope('out-of-memory')
  device.pushErrorScope('validation')

  return async () => {
    const validationError = await device.popErrorScope()
    const memoryError = await device.popErrorScope()
    const internalError = await device.popErrorScope()
    if (validationError) {
      throw new TypeError(
        `WebGPU validation error during ${stage}.\n${validationError.message}`
      )
    }
    if (memoryError) {
      throw new TypeError(
        `WebGPU out of memory error during ${stage}.\n${memoryError.message}`
      )
    }
    if (internalError) {
      throw new TypeError(
        `WebGPU internal error during ${stage}.\n${internalError.message}`
      )
    }
  }
}

class TimestampCollector {
  #querySet: GPUQuerySet
  #resolveBuffer: GPUBuffer
  #resultBuffer: GPUBuffer

  constructor (device: GPUDevice) {
    this.#querySet = device.createQuerySet({
      type: 'timestamp',
      count: 2
    })
    this.#resolveBuffer = device.createBuffer({
      size: this.#querySet.count * 8,
      usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC
    })
    this.#resultBuffer = device.createBuffer({
      size: this.#resolveBuffer.size,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
    })
  }

  getTimestampWrites (): GPURenderPassTimestampWrites {
    return {
      querySet: this.#querySet,
      beginningOfPassWriteIndex: 0,
      endOfPassWriteIndex: 1
    }
  }

  copyBuffer (encoder: GPUCommandEncoder): void {
    encoder.resolveQuerySet(
      this.#querySet,
      0,
      this.#querySet.count,
      this.#resolveBuffer,
      0
    )
    if (this.#resultBuffer.mapState === 'unmapped') {
      encoder.copyBufferToBuffer(
        this.#resolveBuffer,
        0,
        this.#resultBuffer,
        0,
        this.#resultBuffer.size
      )
    }
  }

  async read (): Promise<bigint | null> {
    if (this.#resultBuffer.mapState === 'unmapped') {
      await this.#resultBuffer.mapAsync(GPUMapMode.READ)
      const times = new BigInt64Array(this.#resultBuffer.getMappedRange())
      this.#resultBuffer.unmap()
      return times[1] - times[0]
    } else {
      return null
    }
  }
}
