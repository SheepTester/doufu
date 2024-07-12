import { raycast, RaycastResult } from '../../client/control/raycast'
import {
  Vector3Key,
  toKey,
  Vector3,
  map,
  map2,
  neighbors,
  add,
  neighborIndex,
  scale
} from '../Vector3'
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
    for (const offset of neighbors) {
      const neighbor = this.lookup(add(chunk.position, offset))
      if (!neighbor) {
        continue
      }
      chunk.neighbors[neighborIndex(offset)] = neighbor
      neighbor.neighbors[neighborIndex(scale(offset, -1))] = chunk
    }
  }

  /** Gets a chunk by its chunk coordinates */
  lookup (position: Vector3): T | null {
    return this.#chunkMap[toKey(position)] ?? null
  }

  /**
   * Gets a chunk by its chunk coordinates. If the chunk doesn't exist, it'll
   * create a new chunk and register it.
   */
  ensure (position: Vector3): T {
    const chunk = this.#chunkMap[toKey(position)]
    if (chunk) {
      return chunk
    } else {
      const chunk = this.options.createChunk(position)
      this.register(chunk)
      return chunk
    }
  }

  /** Ensures that the chunk at the given position is deleted. */
  delete (position: Vector3): void {
    delete this.#chunkMap[toKey(position)]
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

  /**
   * @returns The array is not live, so it's safe to remove chunks while
   * iterating over `chunks()`.
   */
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
