import {
  ClientMessage,
  SerializedBlock,
  SerializedChunk,
  ServerMessage
} from '../../common/message'
import { Vector3 } from '../../common/Vector3'
import { Block } from '../../common/world/Block'
import { World } from '../../common/world/World'
import { submitSample } from '../debug/perf'
import { MeshWorkerMessage, MeshWorkerRequest } from '../mesh/message'
import { Connection } from '../net/Connection'
import { ClientChunk } from './ClientChunk'
import { Context } from './Context'

export class ClientWorld extends World<ClientChunk> {
  #server: Connection<ServerMessage, ClientMessage>
  #meshWorker = new Connection<MeshWorkerMessage, MeshWorkerRequest>({
    onMessage: message => {
      switch (message.type) {
        case 'mesh': {
          const chunk = this.lookup(message.position)
          // If the chunk doesn't exist anymore, the chunk has been unloaded so we
          // can discard the face data
          if (chunk) {
            chunk.handleFaces(message.data)
          }
          break
        }
        case 'mesh-time': {
          submitSample('mesh', message.time * 1e6)
          break
        }
        default: {
          console.error('Unknown mesh builder response type', message)
        }
      }
    }
  })

  constructor (
    context: Context,
    server: Connection<ServerMessage, ClientMessage>
  ) {
    super({
      createChunk: position => new ClientChunk(context, position)
    })
    this.#server = server
    this.#meshWorker.connectWorker('./client/mesh/index.js')
  }

  delete (chunk: Vector3): void {
    super.delete(chunk)
    this.#meshWorker.send({ type: 'forget', chunk })
  }

  setChunks (chunks: SerializedChunk[]): void {
    this.#meshWorker.send({ type: 'chunk-data', chunks })
    for (const { position, data } of chunks) {
      const chunk = this.lookup(position)
      if (chunk) {
        chunk.data = data
      }
    }
  }

  setBlock (position: Vector3, block: Block, broadcast = false) {
    this.#meshWorker.send({
      type: 'block-update',
      blocks: [{ position, block }]
    })
    if (broadcast) {
      this.#server.send({ type: 'block-update', blocks: [{ position, block }] })
    }
    return super.setBlock(position, block)
  }

  setBlocks (blocks: SerializedBlock[], broadcast: boolean): void {
    this.#meshWorker.send({ type: 'block-update', blocks })
    if (broadcast) {
      this.#server.send({ type: 'block-update', blocks })
    }
    for (const { position, block } of blocks) {
      super.setBlock(position, block)
    }
  }
}
