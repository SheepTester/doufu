import { Vector3 } from '../Vector3'
import { Block } from './Block'
import { Chunk, SIZE } from './Chunk'

type ChunkKey = `${number},${number},${number}`

export type WorldOptions<T> = {
  createChunk: (position: Vector3) => T
}
export class World<T extends Chunk> {
  options: WorldOptions<T>

  #chunkMap: Record<ChunkKey, T> = {}

  constructor (options: WorldOptions<T>) {
    this.options = options
  }

  register (chunk: T): void {
    const id: ChunkKey = `${chunk.position.x},${chunk.position.y},${chunk.position.z}`
    if (this.#chunkMap[id]) {
      throw new RangeError(`A chunk already exists at ${id}`)
    }
    this.#chunkMap[id] = chunk
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
  lookup ({ x, y, z }: Vector3): T | null {
    return this.#chunkMap[`${x},${y},${z}`] ?? null
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

  setBlock ({ x, y, z }: Vector3, block: Block): void {
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
    chunk.set(
      {
        x: x - chunk.position.x * SIZE,
        y: y - chunk.position.y * SIZE,
        z: z - chunk.position.z * SIZE
      },
      block
    )
  }

  chunks (): T[] {
    return Object.values(this.#chunkMap)
  }
}
