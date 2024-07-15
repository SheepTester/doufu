import { Mat4, mat4 } from 'wgpu-matrix'
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
  scale,
  ZERO,
  sub,
  length,
  transform
} from '../Vector3'
import { Block, isSolid } from './Block'
import { Chunk, LoneId, SIZE } from './Chunk'

export type WorldRaycastResult = RaycastResult & {
  id?: number
  transform?: Mat4
}

export type WorldOptions<T> = {
  createChunk: (position: Vector3 | LoneId) => T
}
export class World<T extends Chunk> {
  options: WorldOptions<T>

  #chunkMap: Record<Vector3Key, T> = {}
  floating: Record<number, T> = {}

  constructor (options: WorldOptions<T>) {
    this.options = options
  }

  /**
   * If a chunk already exists at the given position, it's overwritten.
   */
  register (chunk: T): void {
    if ('id' in chunk.position) {
      this.floating[chunk.position.id] = chunk
      return
    }
    const key = toKey(chunk.position)
    if (this.#chunkMap[key] === chunk) {
      return
    }
    this.#chunkMap[key] = chunk
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
  lookup (position: Vector3 | LoneId): T | null {
    return (
      ('id' in position
        ? this.floating[position.id]
        : this.#chunkMap[toKey(position)]) ?? null
    )
  }

  /**
   * Gets a chunk by its chunk coordinates. If the chunk doesn't exist, it'll
   * create a new chunk and register it.
   */
  ensure (position: Vector3 | LoneId): T {
    const chunk =
      'id' in position
        ? this.floating[position.id]
        : this.#chunkMap[toKey(position)]
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
   * @param id The floating chunk ID.
   */
  getBlock (position: Vector3, id?: number): Block | null {
    const chunk = this.lookup(
      id !== undefined ? { id } : map(position, n => Math.floor(n / SIZE))
    )
    if (!chunk) {
      return null
    }
    return chunk.get(
      'id' in chunk.position
        ? position
        : map2(position, chunk.position, (block, chunk) => block - chunk * SIZE)
    )
  }

  #isSolid = (block: Vector3): boolean => {
    return isSolid(this.getBlock(block) ?? Block.AIR)
  }

  /**
   * Returns the chunk that the block was set in. Does nothing if the chunk
   * doesn't exist.
   *
   * Floating chunks do not perform bounds checks.
   *
   * @param id The floating chunk ID.
   */
  setBlock (
    position: Vector3,
    block: Block,
    id?: number
  ): { chunk?: T; chunkPos: Vector3; local: Vector3 } {
    if (id !== undefined) {
      const chunk = this.floating[id]
      chunk?.set(position, block)
      return { chunk, chunkPos: ZERO, local: position }
    }
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
    return [...Object.values(this.#chunkMap), ...Object.values(this.floating)]
  }

  raycast (
    from: Vector3,
    direction: Vector3,
    maxDistance?: number
  ): WorldRaycastResult | null {
    const result = raycast(this.#isSolid, from, direction, maxDistance).next()

    let closest: WorldRaycastResult | null = result.done ? null : result.value
    let closestDistance = result.done
      ? Infinity
      : length(sub(result.value.position, from))

    // Check floating chunks
    for (const chunk of Object.values(this.floating)) {
      if ('x' in chunk.position) {
        continue
      }
      const transformation = mat4.inverse(
        chunk.position.transform ?? mat4.identity<Float32Array>()
      )
      const transformedFrom = transform(from, transformation)
      const result = raycast(
        block => isSolid(chunk.getChecked(block)),
        transformedFrom,
        transform(direction, transformation, false),
        maxDistance
      ).next()
      if (!result.done) {
        const distance = length(sub(result.value.position, transformedFrom))
        if (distance < closestDistance) {
          closest = {
            ...result.value,
            id: chunk.position.id,
            transform: chunk.position.transform
          }
          closestDistance = distance
        }
      }
    }

    return closest
  }
}
