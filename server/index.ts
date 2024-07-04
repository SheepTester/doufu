import { Connection as WorkerConnection } from '../client/net/Connection'
import {
  ClientMessage,
  SerializedChunk,
  ServerMessage
} from '../common/message'
import { Vector3 } from '../common/Vector3'
import { Block } from '../common/world/Block'
import { Chunk, SIZE } from '../common/world/Chunk'
import { World } from '../common/world/World'
import {
  WorldGeneratorMessage,
  WorldGeneratorRequest
} from './generate/message'
import { ServerChunk } from './world/ServerChunk'

export interface Connection {
  id: number
  send(message: ServerMessage): void
}

export class Server {
  world = new World<ServerChunk>({
    createChunk: position => new ServerChunk(position)
  })

  #generator = new WorkerConnection<
    WorldGeneratorMessage,
    WorldGeneratorRequest
  >(message => {
    switch (message.type) {
      case 'chunk-data': {
        const chunk = this.world.ensure(message.chunk.position)
        chunk.data = message.chunk.data
        chunk.generationState = 'generated'
        chunk.broadcastUpdate()
        break
      }
      default: {
        console.error('Unknown world generator response type', message)
      }
    }
  })

  constructor () {
    this.#generator.connectWorker('./generate/index.js')
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
          chunk.subscribers.add(conn)
          if (chunk.generationState === 'generated') {
            chunksWithData.push(chunk.serialize())
          } else if (chunk.generationState === 'ungenerated') {
            chunk.generationState = 'generating'
            this.#generator.send({ type: 'generate', position: chunk.position })
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
