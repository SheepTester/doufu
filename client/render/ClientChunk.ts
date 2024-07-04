import { mat4 } from 'wgpu-matrix'
import { toKey, Vector3 } from '../../common/Vector3'
import { Chunk, SIZE } from '../../common/world/Chunk'
import { Context } from './Context'
import { Group } from './Group'
import { Uniform } from './Uniform'

const empty = new Uint8Array() // TEMP

export class ClientChunk extends Chunk {
  #context: Context
  #chunkGroup: Group<{ transform: Uniform }>
  #vertices: GPUBuffer | null = null

  constructor (context: Context, position: Vector3) {
    super(position, empty)
    this.#context = context
    this.#chunkGroup = new Group(context.device, context.common.pipeline, 1, {
      transform: new Uniform(context.device, 0, 4 * 4 * 4)
    })
    this.#chunkGroup.uniforms.transform.data(
      mat4.translation<Float32Array>([
        position.x * SIZE,
        position.y * SIZE,
        position.z * SIZE
      ])
    )
  }

  handleFaces (faces: Uint8Array): void {
    this.#vertices?.destroy()
    this.#vertices = this.#context.device.createBuffer({
      label: `chunk (${toKey(this.position)}) vertex buffer vertices`,
      size: faces.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    })
    this.#context.device.queue.writeBuffer(this.#vertices, 0, faces)
  }

  render (pass: GPURenderPassEncoder): void {
    if (this.#vertices) {
      pass.setBindGroup(1, this.#chunkGroup.group)
      pass.setVertexBuffer(0, this.#vertices)
      pass.draw(6, this.#vertices.size / 8)
    }
  }
}