import { Mat4 } from 'wgpu-matrix'
import { SerializedBlock, SerializedChunk } from '../message'
import {
  add,
  all,
  map,
  MIDDLE,
  neighborIndex,
  NEIGHBORS,
  scale,
  Vector3,
  ZERO
} from '../Vector3'
import { Block } from './Block'
import {
  ChunkFeatureChange,
  priorityMap,
  priorityOrder
} from '../../server/generate/priority'

export const SIZE = 32

export type LoneId = { id: number; transform?: Mat4 }

export class Chunk {
  position: Vector3 | LoneId
  data: Uint8Array<ArrayBuffer>
  neighbors: (Chunk | null)[] = NEIGHBORS.map(() => null)

  constructor (
    position: Vector3 | LoneId,
    data = new Uint8Array(SIZE * SIZE * SIZE)
  ) {
    this.position = position
    this.data = data
    this.neighbors[MIDDLE] = this
  }

  inside (position: Vector3): boolean {
    return all(position, coord => coord >= 0 && coord < SIZE)
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
   * @param defaultBlock Defaults to `Block.AIR`.
   */
  getChecked = (position: Vector3, defaultBlock = Block.AIR): Block => {
    return this.inside(position) ? this.get(position) : defaultBlock
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

  apply (changes: ChunkFeatureChange[], changed?: SerializedBlock[]): void {
    for (const { position, priority } of changes) {
      const block = this.get(position)
      if ((priorityMap[block] ?? 0) < priority) {
        const newBlock = priorityOrder[priority]
        this.set(position, newBlock)
        if (changed && 'x' in this.position) {
          changed.push({
            position: add(scale(this.position, SIZE), position),
            block: newBlock
          })
        }
      }
    }
  }

  serialize (): SerializedChunk {
    return { position: this.position, data: this.data }
  }
}
