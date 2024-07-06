import { raycast, RaycastResult } from '../../client/control/raycast'
import { Vector3Key, toKey, Vector3 } from '../Vector3'
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
  getBlock ({ x, y, z }: Vector3): Block | null {
    const chunk = this.lookup({
      x: Math.floor(x / SIZE),
      y: Math.floor(y / SIZE),
      z: Math.floor(z / SIZE)
    })
    return (
      chunk?.get({
        x: x - chunk.position.x * SIZE,
        y: y - chunk.position.y * SIZE,
        z: z - chunk.position.z * SIZE
      }) ?? null
    )
  }

  #isSolid = (block: Vector3): boolean => {
    return isSolid(this.getBlock(block))
  }

  /** Returns the chunk that the block was set in. */
  setBlock ({ x, y, z }: Vector3, block: Block): { chunk: T; local: Vector3 } {
    const chunkPos = {
      x: Math.floor(x / SIZE),
      y: Math.floor(y / SIZE),
      z: Math.floor(z / SIZE)
    }
    let chunk = this.lookup(chunkPos)
    if (!chunk) {
      chunk = this.options.createChunk(chunkPos)
      this.register(chunk)
    }
    const local = {
      x: x - chunk.position.x * SIZE,
      y: y - chunk.position.y * SIZE,
      z: z - chunk.position.z * SIZE
    }
    chunk.set(local, block)
    return { chunk, local }
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
