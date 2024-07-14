import { Mat4 } from 'wgpu-matrix'
import { SerializedChunk } from '../message'
import { map, MIDDLE, neighborIndex, Vector3, ZERO } from '../Vector3'
import { Block } from './Block'

export const SIZE = 32

export type LoneId = { id: number; transform?: Mat4 }

export class Chunk {
  position: Vector3 | LoneId
  data: Uint8Array
  neighbors: (Chunk | null)[] = Array.from({ length: 27 }, () => null)

  constructor (
    position: Vector3 | LoneId,
    data = new Uint8Array(SIZE * SIZE * SIZE)
  ) {
    this.position = position
    this.data = data
    this.neighbors[MIDDLE] = this
  }

  /**
   * Gets the block at the given chunk-local coordinates. Does not perform any
   * bounds checks.
   */
  get = ({ x, y, z }: Vector3): Block => {
    return this.data[(x * SIZE + y) * SIZE + z]
  }

  /**
   * Sets the block at the given chunk-local coordinates. Does not perform any
   * bounds checks.
   */
  set ({ x, y, z }: Vector3, block: Block): void {
    this.data[(x * SIZE + y) * SIZE + z] = block
  }

  /**
   * Gets the block at the given chunk-local coordinates. For blocks outside the
   * chunk, the method will recursively search through adjacent chunks to find
   * it. If a chunk doesn't exist yet, this will return `null`.
   */
  getWithNeighbor = (position: Vector3): Block | null => {
    const block = map(position, coord =>
      coord < 0 ? coord + SIZE : coord >= SIZE ? coord - SIZE : coord
    )
    const chunk = map(position, coord =>
      coord < 0 ? -1 : coord >= SIZE ? 1 : 0
    )
    return this.neighbors[neighborIndex(chunk)]?.get(block) ?? null
  }

  /** Make the chunk consist entirely of `block` */
  fill (block: Block): void {
    this.data.fill(block)
  }

  serialize (): SerializedChunk {
    return { position: this.position, data: this.data }
  }
}
