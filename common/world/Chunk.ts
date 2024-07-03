import { Vector3 } from '../Vector3'
import { Block } from './Block'

export const SIZE = 32

export class Chunk {
  #data: Uint8Array = new Uint8Array(SIZE * SIZE * SIZE)
  position: Vector3
  neighbors: (Chunk | null)[] = Array.from({ length: 9 }, () => null)

  constructor (position: Vector3) {
    this.position = position
    this.neighbors[(1 * 3 + 1) * 3 + 1] = this
  }

  /**
   * Gets the block at the given chunk-local coordinates. Does not perform any
   * bounds checks.
   */
  get ({ x, y, z }: Vector3): Block {
    return this.#data[(x * SIZE + y) * SIZE + z]
  }

  /**
   * Sets the block at the given chunk-local coordinates. Does not perform any
   * bounds checks.
   */
  set ({ x, y, z }: Vector3, block: Block): void {
    this.#data[(x * SIZE + y) * SIZE + z] = block
  }

  /**
   * Gets the block at the given chunk-local coordinates. For blocks outside the
   * chunk, the method will recursively search through adjacent chunks to find
   * it.
   */
  getWithNeighbor ({ x, y, z }: Vector3): Block {
    const { coord: blockX, chunk: chunkX } = clampCoord(x)
    const { coord: blockY, chunk: chunkY } = clampCoord(y)
    const { coord: blockZ, chunk: chunkZ } = clampCoord(z)
    const index = (blockX * SIZE + blockY) * SIZE + blockZ
    const chunk = this.neighbors[(chunkX * 3 + chunkY) * 3 + chunkZ]
    return chunk ? chunk.#data[index] : Block.AIR
  }

  /** Make the chunk consist entirely of `block` */
  fill (block: Block): void {
    this.#data.fill(block)
  }
}

function clampCoord (coord: number): { coord: number; chunk: number } {
  if (coord < 0) {
    return { coord: coord + SIZE, chunk: 0 }
  } else if (coord >= SIZE) {
    return { coord: coord - SIZE, chunk: 2 }
  } else {
    return { coord, chunk: 1 }
  }
}
