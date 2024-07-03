import { Vector3 } from '../Vector3'
import { Block } from './Block'
import { Chunk, SIZE } from './Chunk'

export type WorldOptions<T> = {
  createChunk: (position: Vector3) => T
}
export class World<T extends Chunk> {
  options: WorldOptions<T>

  #chunkMap: Record<`${number},${number},${number}`, T> = {}

  constructor (options: WorldOptions<T>) {
    this.options = options
  }

  register (chunk: T): void {
    this.#chunkMap[
      `${chunk.position.x},${chunk.position.y},${chunk.position.z}`
    ] = chunk
  }

  /** Gets a chunk by its chunk coordinates */
  lookup ({ x, y, z }: Vector3): T | null {
    return this.#chunkMap[`${x},${y},${z}`] ?? null
  }

  /**
   * Looks up a block by its global coordinates. If the chunk doesn't exist,
   * this returns `Block.AIR`.
   */
  getBlock ({ x, y, z }: Vector3): Block {
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
      }) ?? Block.AIR
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
