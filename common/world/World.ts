import { raycast, RaycastResult } from '../../client/control/raycast'
import { Vector3Key, toKey, Vector3, map, map2 } from '../Vector3'
import { Block, isSolid } from './Block'
import { Chunk, SIZE } from './Chunk'

export type WorldOptions<T> = {
  createChunk: (position: Vector3) => T
}
export class World<T extends Chunk> {
  options: WorldOptions<T>

  #chunkMap: Record<Vector3Key, T> = {}

  constructor (options: WorldOptions<T>) {
    this.options = options
  }

  /**
   * If a chunk already exists at the given position, it's overwritten.
   */
  register (chunk: T): void {
    this.#chunkMap[toKey(chunk.position)] = chunk
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const neighbor = this.lookup({
            x: chunk.position.x + dx,
            y: chunk.position.y + dy,
            z: chunk.position.z + dz
          })
          if (!neighbor) {
            continue
          }
          chunk.neighbors[((1 + dx) * 3 + 1 + dy) * 3 + 1 + dz] = neighbor
          neighbor.neighbors[((1 - dx) * 3 + 1 - dy) * 3 + 1 - dz] = chunk
        }
      }
    }
  }

  /** Gets a chunk by its chunk coordinates */
  lookup (v: Vector3): T | null {
    return this.#chunkMap[toKey(v)] ?? null
  }

  /**
   * Gets a chunk by its chunk coordinates. If the chunk doesn't exist, it'll
   * create a new chunk and register it.
   */
  ensure (v: Vector3): T {
    const chunk = this.#chunkMap[toKey(v)]
    if (chunk) {
      return chunk
    } else {
      const chunk = this.options.createChunk(v)
      this.register(chunk)
      return chunk
    }
  }

  /**
   * Looks up a block by its global coordinates. Returns `null` if the chunk
   * doesn't exist.
   */
  getBlock (position: Vector3): Block | null {
    const chunk = this.lookup(map(position, n => Math.floor(n / SIZE)))
    return (
      chunk?.get(
        map2(position, chunk.position, (block, chunk) => block - chunk * SIZE)
      ) ?? null
    )
  }

  #isSolid = (block: Vector3): boolean => {
    return isSolid(this.getBlock(block))
  }

  /**
   * Returns the chunk that the block was set in. Does nothing if the chunk
   * doesn't exist.
   */
  setBlock (
    position: Vector3,
    block: Block
  ): { chunk?: T; chunkPos: Vector3; local: Vector3 } {
    const chunkPos = map(position, n => Math.floor(n / SIZE))
    const local = map2(
      position,
      chunkPos,
      (block, chunk) => block - chunk * SIZE
    )
    const chunk = this.lookup(chunkPos) ?? undefined
    chunk?.set(local, block)
    return { chunk, chunkPos, local }
  }

  chunks (): T[] {
    return Object.values(this.#chunkMap)
  }

  raycast (
    from: Vector3,
    direction: Vector3,
    maxDistance?: number
  ): RaycastResult | null {
    const result = raycast(this.#isSolid, from, direction, maxDistance).next()
    if (result.done) {
      return null
    } else {
      return result.value
    }
  }
}
