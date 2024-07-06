import { Connection as WorkerConnection } from '../client/net/Connection'
import {
  ClientMessage,
  SerializedBlock,
  SerializedChunk,
  ServerMessage
} from '../common/message'
import { Block } from '../common/world/Block'
import { World } from '../common/world/World'
import { WorldGenMessage, WorldGenRequest } from './generate/message'
import { ServerChunk } from './world/ServerChunk'

export interface Connection {
  send(message: ServerMessage): void
}

export class Server {
  world = new World<ServerChunk>({
    createChunk: position => new ServerChunk(position)
  })

  #generator = new WorkerConnection<WorldGenMessage, WorldGenRequest>({
    onMessage: message => {
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
        let i = 0
        setInterval(() => {
          const block = i++ % 2 === 0 ? Block.WHITE : Block.AIR
          const { chunk } = this.world.setBlock({ x: 1, y: 30, z: 1 }, block)
          for (const subscriber of chunk.subscribers) {
            subscriber.send({
              type: 'block-update',
              blocks: [{ position: { x: 1, y: 30, z: 1 }, block }]
            })
          }
        }, 500)
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
      case 'block-update': {
        const subscribers = new Map<Connection, SerializedBlock[]>()
        for (const { position, block } of message.blocks) {
          const { chunk } = this.world.setBlock(position, block)
          for (const subscriber of chunk.subscribers) {
            if (subscriber === conn) {
              continue
            }
            let updates = subscribers.get(subscriber)
            if (!updates) {
              updates = []
              subscribers.set(subscriber, updates)
            }
            updates.push({ position, block })
          }
        }
        for (const [subscriber, blocks] of subscribers) {
          subscriber.send({ type: 'block-update', blocks })
        }
        break
      }
    }
  }

  handleClose (conn: Connection): void {
    //
  }
}
