import { Mat4, mat4 } from 'wgpu-matrix'
import atlasPath from '../asset/atlas.png'
import { Group } from './Group'
import postprocessCode from './postprocess.wgsl'
import { Uniform } from './Uniform'
import voxelOutlineCode from './voxel-outline.wgsl'
import voxelCode from './voxel.wgsl'

export interface Mesh {
  render(pass: GPURenderPassEncoder): void
}

export type ContextOptions = {
  /** @param delta In nanoseconds. */
  onGpuTime: (delta: bigint) => void
}

export class Context {
  device: GPUDevice
  voxelMeshes: Mesh[] = []

  #format: GPUTextureFormat
  voxelCommon
  #outlineCommon
  #postprocessCommon
  #options: Partial<ContextOptions>

  #depthTexture: GPUTexture | null = null
  #screenTexture: GPUTexture | null = null

  #timestamp: TimestampCollector | null

  constructor (
    device: GPUDevice,
    format: GPUTextureFormat,
    voxelCommon: Group<{ camera: Uniform; perspective: Uniform }>,
    outlineCommon: Group<{
      camera: Uniform
      perspective: Uniform
      transform: Uniform
      resolution: Uniform
    }>,
    postprocessCommon: Group<{ canvasSize: Uniform }>,
    options: Partial<ContextOptions>
  ) {
    this.device = device
    this.#format = format
    this.voxelCommon = voxelCommon
    this.#outlineCommon = outlineCommon
    this.#postprocessCommon = postprocessCommon
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

    const voxelModule = await compile(device, voxelCode, 'voxel shader')
    // Pipeline is like WebGL program; contains the shaders
    const voxelPipeline = device.createRenderPipeline({
      label: 'voxel pipeline',
      layout: 'auto',
      vertex: {
        module: voxelModule,
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
        module: voxelModule,
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

    const voxelCommon = new Group(device, voxelPipeline, 0, {
      perspective: new Uniform(device, 0, 4 * 4 * 4),
      camera: new Uniform(device, 1, 4 * 4 * 4),
      sampler: { binding: 2, resource: sampler },
      texture: { binding: 3, resource: texture.createView() },
      textureSize: new Uniform(device, 4, 4 * 2)
    })
    voxelCommon.uniforms.textureSize.data(
      new Float32Array([source.width / 16, source.height / 16])
    )

    const outlineModule = await compile(
      device,
      voxelOutlineCode,
      'voxel outline shader'
    )
    const outlinePipeline = device.createRenderPipeline({
      label: 'voxel outline pipeline',
      layout: 'auto',
      vertex: { module: outlineModule, entryPoint: 'vertex_main' },
      fragment: {
        module: outlineModule,
        entryPoint: 'fragment_main',
        targets: [{ format }]
      },
      primitive: { cullMode: 'back' },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth24plus'
      }
    })
    const outlineCommon = new Group(device, outlinePipeline, 0, {
      perspective: new Uniform(device, 0, 4 * 4 * 4),
      camera: new Uniform(device, 1, 4 * 4 * 4),
      transform: new Uniform(device, 2, 4 * 4 * 4),
      resolution: new Uniform(device, 3, 2 * 4)
    })
    outlineCommon.uniforms.transform.data(new Float32Array(mat4.identity()))

    const postprocessModule = await compile(
      device,
      postprocessCode,
      'post-processing shader'
    )
    const postprocessPipeline = device.createRenderPipeline({
      label: 'post-processing pipeline',
      layout: 'auto',
      vertex: { module: postprocessModule, entryPoint: 'vertex_main' },
      fragment: {
        module: postprocessModule,
        entryPoint: 'fragment_main',
        targets: [{ format }]
      }
    })
    const postprocessCommon = new Group(device, postprocessPipeline, 0, {
      canvasSize: new Uniform(device, 0, 4 * 2),
      sampler: { binding: 1, resource: sampler }
    })

    await check()

    return new Context(
      device,
      format,
      voxelCommon,
      outlineCommon,
      postprocessCommon,
      options
    )
  }

  async render (canvasTexture: GPUTexture, cameraTransform: Mat4) {
    if (!this.#depthTexture || !this.#screenTexture) {
      throw new Error('Attempted render before resize() was called.')
    }

    const check = captureError(this.device, 'render')

    const camera = new Float32Array(cameraTransform)
    this.voxelCommon.uniforms.camera.data(camera)
    this.#outlineCommon.uniforms.camera.data(camera)

    // Encodes commands
    const encoder = this.device.createCommandEncoder({
      label: 'encoder'
    })
    {
      // You can run multiple render passes
      const pass = encoder.beginRenderPass({
        label: 'voxel render pass',
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
      pass.setPipeline(this.voxelCommon.pipeline)
      pass.setBindGroup(0, this.voxelCommon.group)
      for (const mesh of this.voxelMeshes) {
        mesh.render(pass)
      }
      pass.setPipeline(this.#outlineCommon.pipeline)
      pass.setBindGroup(0, this.#outlineCommon.group)
      pass.draw(3, 12)
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
      pass.setPipeline(this.#postprocessCommon.pipeline)
      pass.setBindGroup(0, this.#postprocessCommon.group)
      pass.setBindGroup(
        1,
        new Group(this.device, this.#postprocessCommon.pipeline, 1, {
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

  resize (width: number, height: number, dpr: number): void {
    const perspective = new Float32Array(
      mat4.perspective(Math.PI / 2, width / height, 0.1, 1000)
    )
    this.voxelCommon.uniforms.perspective.data(perspective)
    this.#outlineCommon.uniforms.perspective.data(perspective)
    this.#outlineCommon.uniforms.resolution.data(
      new Float32Array([width / dpr, height / dpr])
    )
    this.#postprocessCommon.uniforms.canvasSize.data(
      new Float32Array([width, height])
    )

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

async function compile (
  device: GPUDevice,
  code: string,
  label: string
): Promise<GPUShaderModule> {
  const module = device.createShaderModule({ label, code })
  const { messages } = await module.getCompilationInfo()
  if (messages.some(message => message.type === 'error')) {
    console.log(messages)
    throw new SyntaxError(
      `${label} failed to compile.\n\n${messages
        .map(message => message.message)
        .join('\n')}`
    )
  }
  return module
}
