import {
  ClientMessage,
  SerializedChunk,
  ServerMessage
} from '../common/message'
import { Vector3 } from '../common/Vector3'
import { Block } from '../common/world/Block'
import { Chunk, SIZE } from '../common/world/Chunk'
import { World } from '../common/world/World'
import { ServerChunk } from './world/ServerChunk'

export interface Connection {
  id: number
  send(message: ServerMessage): void
}

export class Server {
  world = new World<ServerChunk>({
    createChunk: position => new ServerChunk(position)
  })

  constructor () {
    for (let x = -1; x <= 1; x++) {
      for (let z = -1; z <= 1; z++) {
        this.#generateChunk({ x, y: 0, z })
        if (x !== 0 || z !== 0) {
          this.world.register(new ServerChunk({ x, y: 1, z }))
        }
      }
    }

    const testChunk = new ServerChunk({ x: 0, y: 1, z: 0 })
    // Lone block (no AO)
    testChunk.set({ x: 1, y: 3, z: 6 }, Block.WHITE)
    // Corners touching (AO level 1)
    testChunk.set({ x: 1, y: 3, z: 3 }, Block.WHITE)
    testChunk.set({ x: 2, y: 4, z: 2 }, Block.WHITE)
    // Sides touching (AO level 1)
    testChunk.set({ x: 5, y: 3, z: 3 }, Block.WHITE)
    testChunk.set({ x: 5, y: 4, z: 2 }, Block.WHITE)
    // Side + corner touching (AO level 2)
    testChunk.set({ x: 9, y: 3, z: 3 }, Block.WHITE)
    testChunk.set({ x: 9, y: 4, z: 2 }, Block.WHITE)
    testChunk.set({ x: 10, y: 4, z: 2 }, Block.WHITE)
    // Two sides, no corner (AO level 3)
    testChunk.set({ x: 5, y: 3, z: 6 }, Block.WHITE)
    testChunk.set({ x: 5, y: 4, z: 7 }, Block.WHITE)
    testChunk.set({ x: 6, y: 4, z: 6 }, Block.WHITE)
    // Two sides, corner (AO level 3)
    testChunk.set({ x: 9, y: 3, z: 6 }, Block.WHITE)
    testChunk.set({ x: 9, y: 4, z: 7 }, Block.WHITE)
    testChunk.set({ x: 10, y: 4, z: 6 }, Block.WHITE)
    testChunk.set({ x: 10, y: 4, z: 7 }, Block.WHITE)
    this.world.register(testChunk)

    // Mark all chunks so far as generated
    for (const chunk of this.world.chunks()) {
      chunk.generated = true
    }
  }

  #generateChunk (position: Vector3): void {
    const chunk = new ServerChunk(position)
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        for (let z = 0; z < SIZE; z++) {
          // Decreasing probability as you go up
          if (Math.random() < (SIZE - y) / SIZE) {
            chunk.set(
              { x, y, z },
              (Math.floor(position.x / 2) + position.z) % 2 === 0
                ? Block.STONE
                : Block.GLASS
            )
          }
        }
      }
    }
    this.world.register(chunk)
  }

  handleOpen (conn: Connection): void {
    conn.send({ type: 'pong' })
  }

  handleMessage (conn: Connection, message: ClientMessage): void {
    switch (message.type) {
      case 'ping': {
        console.log('received ping')
        break
      }
      case 'subscribe-chunks': {
        const chunksWithData: SerializedChunk[] = []
        for (const position of message.chunks) {
          const chunk = this.world.ensure(position)
          chunk.subscribers.push(conn)
          if (chunk.generated) {
            chunksWithData.push({ position, data: chunk.data })
          }
        }
        if (chunksWithData.length > 0) {
          conn.send({ type: 'chunk-data', chunks: chunksWithData })
        }
        break
      }
    }
  }

  handleClose (connId: number): void {
    //
  }
}
