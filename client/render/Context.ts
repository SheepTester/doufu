import { Mat4, mat4 } from 'wgpu-matrix'
import atlasPath from '../asset/atlas.png'
import { Group } from './Group'
import mipmapCode from './mipmap.wgsl'
import { Model } from './Model'
import modelCode from './model-cube.wgsl'
import postprocessCode from './postprocess.wgsl'
import { Uniform } from './Uniform'
import voxelOutlineCode from './voxel-outline.wgsl'
import voxelCode from './voxel.wgsl'
import { ClientWorld } from './ClientWorld'

export interface Mesh {
  render(pass: GPURenderPassEncoder): void
}

export type Texture = {
  texture: GPUTexture
  sampler: GPUSampler
  width: number
  height: number
}

export type ContextOptions = {
  /** @param delta In nanoseconds. */
  onGpuTime: (delta: bigint) => void
}

type Modules = Record<
  'voxel' | 'outline' | 'model' | 'postprocess',
  GPUShaderModule
>
type Textures = Record<'blocks', Texture>

export async function createContext (
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

  const blockTexture = await loadTexture(device, atlasPath, {
    // 5 levels (inclusive) from 16x16 to 1x1 per block
    mipmapLevels: 5
  })
  const mipmapModule = await compile(device, mipmapCode, 'texture mipmapper')
  const mipmapPipeline = device.createRenderPipeline({
    label: 'mip level generator pipeline',
    layout: 'auto',
    vertex: { module: mipmapModule },
    fragment: {
      module: mipmapModule,
      targets: [{ format: blockTexture.texture.format }]
    }
  })
  const mipmapEncoder = device.createCommandEncoder({
    label: 'mipmap generator encoder'
  })
  const mipmapGroups: Group<{}>[] = []
  for (let i = 0; i < 4; i++) {
    const mipmapUniforms = new Group(device, mipmapPipeline, 0, {
      sampler: { binding: 0, resource: blockTexture.sampler },
      texture: {
        binding: 1,
        resource: blockTexture.texture.createView({
          baseMipLevel: i,
          mipLevelCount: 1
        })
      },
      outputSize: new Uniform(device, 2, 2 * 4)
    })
    mipmapUniforms.uniforms.outputSize.data(
      new Float32Array([
        blockTexture.width >> (i + 1),
        blockTexture.height >> (i + 1)
      ])
    )
    mipmapGroups.push(mipmapUniforms)
    const pass = mipmapEncoder.beginRenderPass({
      label: 'mipmap render pass',
      colorAttachments: [
        {
          view: blockTexture.texture.createView({
            baseMipLevel: i + 1,
            mipLevelCount: 1
          }),
          loadOp: 'clear',
          storeOp: 'store'
        }
      ]
    })
    pass.setPipeline(mipmapPipeline)
    pass.setBindGroup(0, mipmapUniforms.group)
    pass.draw(6)
    pass.end()
  }
  device.queue.submit([mipmapEncoder.finish()])
  for (const group of mipmapGroups) {
    group.destroy()
  }

  const modules: Modules = {
    voxel: await compile(device, voxelCode, 'voxel shader'),
    outline: await compile(device, voxelOutlineCode, 'voxel outline shader'),
    model: await compile(device, modelCode, 'entity model shader'),
    postprocess: await compile(
      device,
      postprocessCode,
      'post-processing shader'
    )
  }
  const textures: Textures = {
    blocks: blockTexture
  }

  await check()

  return new Context(device, format, modules, textures, options)
}

class ContextBase {
  device: GPUDevice
  format: GPUTextureFormat
  modules: Modules
  textures: Textures

  constructor (
    device: GPUDevice,
    format: GPUTextureFormat,
    modules: Modules,
    textures: Textures
  ) {
    this.device = device
    this.format = format
    this.modules = modules
    this.textures = textures
  }
}

export class Context extends ContextBase {
  world?: ClientWorld
  models: Model[] = []

  voxelOutlineEnabled = false
  #options: Partial<ContextOptions>

  #depthTexture: GPUTexture | null = null
  #screenTexture: GPUTexture | null = null

  #timestamp: TimestampCollector | null

  voxelCommon = new Group(
    this.device,
    this.device.createRenderPipeline({
      label: 'voxel pipeline',
      layout: 'auto',
      vertex: {
        module: this.modules.voxel,
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
        module: this.modules.voxel,
        entryPoint: 'fragment_main',
        targets: [
          {
            format: this.format
            // blend: {
            //   color: {
            //     operation: 'add',
            //     srcFactor: 'src-alpha',
            //     dstFactor: 'one-minus-src-alpha'
            //   },
            //   alpha: {}
            // }
          }
        ]
      },
      primitive: { cullMode: 'back' },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth24plus'
      }
    }),
    0,
    {
      perspective: new Uniform(this.device, 0, 4 * 4 * 4),
      camera: new Uniform(this.device, 1, 4 * 4 * 4),
      sampler: {
        binding: 2,
        resource: this.device.createSampler({ mipmapFilter: 'linear' })
      },
      texture: {
        binding: 3,
        resource: this.textures.blocks.texture.createView()
      },
      textureSize: new Uniform(this.device, 4, 4 * 2)
    }
  )
  outlineCommon = new Group(
    this.device,
    this.device.createRenderPipeline({
      label: 'voxel outline pipeline',
      layout: 'auto',
      vertex: { module: this.modules.outline, entryPoint: 'vertex_main' },
      fragment: {
        module: this.modules.outline,
        entryPoint: 'fragment_main',
        targets: [{ format: this.format }]
      },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth24plus'
      }
    }),
    0,
    {
      perspective: new Uniform(this.device, 0, 4 * 4 * 4),
      camera: new Uniform(this.device, 1, 4 * 4 * 4),
      transform: new Uniform(this.device, 2, 4 * 4 * 4),
      resolution: new Uniform(this.device, 3, 2 * 4)
    }
  )
  modelCommon = new Group(
    this.device,
    this.device.createRenderPipeline({
      label: 'entity model cube pipeline',
      layout: 'auto',
      vertex: {
        module: this.modules.model,
        entryPoint: 'vertex_main',
        buffers: [
          {
            arrayStride: 4 * 4 * 4,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x4' },
              { shaderLocation: 1, offset: 4 * 4, format: 'float32x4' },
              { shaderLocation: 2, offset: 4 * 4 * 2, format: 'float32x4' },
              { shaderLocation: 3, offset: 4 * 4 * 3, format: 'float32x4' }
            ]
          }
        ]
      },
      fragment: {
        module: this.modules.model,
        entryPoint: 'fragment_main',
        targets: [{ format: this.format }]
      },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth24plus'
      }
    }),
    0,
    {
      perspective: new Uniform(this.device, 0, 4 * 4 * 4),
      camera: new Uniform(this.device, 1, 4 * 4 * 4)
    }
  )
  #postprocessCommon = new Group(
    this.device,
    this.device.createRenderPipeline({
      label: 'post-processing pipeline',
      layout: 'auto',
      vertex: { module: this.modules.postprocess, entryPoint: 'vertex_main' },
      fragment: {
        module: this.modules.postprocess,
        entryPoint: 'fragment_main',
        targets: [{ format: this.format }]
      }
    }),
    0,
    {
      canvasSize: new Uniform(this.device, 0, 4 * 2),
      sampler: { binding: 1, resource: this.textures.blocks.sampler }
    }
  )

  constructor (
    device: GPUDevice,
    format: GPUTextureFormat,
    modules: Modules,
    textures: Textures,
    options: Partial<ContextOptions>
  ) {
    super(device, format, modules, textures)
    this.#options = options
    this.#timestamp = options.onGpuTime ? new TimestampCollector(device) : null

    this.voxelCommon.uniforms.textureSize.data(
      new Float32Array([
        this.textures.blocks.width / 16,
        this.textures.blocks.height / 16
      ])
    )
  }

  async render (canvasTexture: GPUTexture, cameraTransform: Mat4) {
    if (!this.#depthTexture || !this.#screenTexture) {
      throw new Error('Attempted render before resize() was called.')
    }

    const check = captureError(this.device, 'render')

    const camera = new Float32Array(cameraTransform)
    this.voxelCommon.uniforms.camera.data(camera)
    this.outlineCommon.uniforms.camera.data(camera)
    this.modelCommon.uniforms.camera.data(camera)

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
      const chunks = this.world?.chunks() ?? []
      if (chunks.length > 0) {
        pass.setPipeline(this.voxelCommon.pipeline)
        pass.setBindGroup(0, this.voxelCommon.group)
        for (const mesh of chunks) {
          mesh.render(pass)
        }
      }
      if (this.voxelOutlineEnabled) {
        pass.setPipeline(this.outlineCommon.pipeline)
        pass.setBindGroup(0, this.outlineCommon.group)
        pass.draw(6, 12)
      }
      if (this.models.length > 0) {
        pass.setPipeline(this.modelCommon.pipeline)
        pass.setBindGroup(0, this.modelCommon.group)
        for (const model of this.models) {
          model.render(pass)
        }
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
    this.outlineCommon.uniforms.perspective.data(perspective)
    this.outlineCommon.uniforms.resolution.data(
      new Float32Array([width / dpr, height / dpr])
    )
    this.modelCommon.uniforms.perspective.data(perspective)
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
      format: this.format,
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
      const delta = times[1] - times[0]
      this.#resultBuffer.unmap()
      return delta
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
    console.error(messages)
    throw new SyntaxError(
      `${label} failed to compile.\n\n${messages
        .map(message => message.message)
        .join('\n')}`
    )
  }
  return module
}

export type TextureOptions = {
  flipY: boolean
  mipmapLevels: number
}
export async function loadTexture (
  device: GPUDevice,
  image: string | ImageBitmap,
  { flipY = true, mipmapLevels }: Partial<TextureOptions> = {}
): Promise<Texture> {
  const source =
    typeof image === 'string'
      ? await fetch(image)
        .then(r => r.blob())
        .then(blob => createImageBitmap(blob, { colorSpaceConversion: 'none' }))
      : image
  const texture = device.createTexture({
    label: 'texture',
    format: 'rgba8unorm',
    mipLevelCount: mipmapLevels,
    size: [source.width, source.height],
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT
  })
  device.queue.copyExternalImageToTexture(
    { source, flipY },
    { texture },
    { width: source.width, height: source.height }
  )
  const sampler = device.createSampler()
  return { texture, sampler, width: source.width, height: source.height }
}
