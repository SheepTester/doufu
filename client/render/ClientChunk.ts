import { mat4 } from 'wgpu-matrix'
import { scale, toArray, toKey, Vector3 } from '../../common/Vector3'
import { Chunk, LoneId, SIZE } from '../../common/world/Chunk'
import { Context, Mesh } from './Context'
import { Group } from './Group'
import { Uniform } from './Uniform'

export class ClientChunk extends Chunk implements Mesh {
  #context: Context
  #chunkGroup: Group<{ transform: Uniform }>
  #vertices: GPUBuffer | null = null

  constructor (
    context: Context,
    position: Vector3 | LoneId,
    data?: Uint8Array<ArrayBuffer>
  ) {
    super(position, data)
    this.#context = context
    this.#chunkGroup = new Group(
      context.device,
      context.voxelCommon.pipeline,
      1,
      { transform: new Uniform(context.device, 0, 4 * 4 * 4) }
    )
    if ('x' in position) {
      this.#chunkGroup.uniforms.transform.data(
        mat4.translation<Float32Array>(toArray(scale(position, SIZE)))
      )
    }
  }

  handleFaces (faces: Uint8Array): void {
    this.#vertices?.destroy()
    if (faces.length === 0) {
      this.#vertices = null
      return
    }
    this.#vertices = this.#context.device.createBuffer({
      label: `chunk (${
        'id' in this.position
          ? `floating ${this.position.id}`
          : toKey(this.position)
      }) vertex buffer vertices`,
      size: faces.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    })
    this.#context.device.queue.writeBuffer(this.#vertices, 0, faces.buffer)
  }

  render (pass: GPURenderPassEncoder): void {
    if (this.#vertices) {
      if ('id' in this.position) {
        this.#chunkGroup.uniforms.transform.data(
          this.position.transform ?? mat4.identity<Float32Array>()
        )
      }
      pass.setBindGroup(1, this.#chunkGroup.group)
      pass.setVertexBuffer(0, this.#vertices)
      pass.draw(6, this.#vertices.size / 8)
    }
  }

  /** Cleans up `Uniform` buffers held by this chunk. */
  destroy (): void {
    this.#chunkGroup.destroy()
    this.#vertices?.destroy()
  }
}
