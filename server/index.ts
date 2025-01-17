import { mat4 } from 'wgpu-matrix'
import { Connection as WorkerConnection } from '../client/net/Connection'
import {
  ClientMessage,
  SerializedBlock,
  SerializedChunk,
  ServerMessage
} from '../common/message'
import { Vector3 } from '../common/Vector3'
import { Block } from '../common/world/Block'
import { World } from '../common/world/World'
import { WorldGenMessage, WorldGenRequest } from './generate/message'
import { ServerChunk } from './world/ServerChunk'
import { SIZE } from '../common/world/Chunk'

export interface Connection {
  send(message: ServerMessage): void
}

type Player = {
  entityId: number
  position: Vector3
  rotationY: number
  subscribed: Set<ServerChunk>
}

export class Server {
  nextId = 0

  #world = new World<ServerChunk>({
    createChunk: position => new ServerChunk(position)
  })
  #players = new Map<Connection, Player>()

  #generator = new WorkerConnection<WorldGenMessage, WorldGenRequest>({
    onMessage: message => {
      switch (message.type) {
        case 'chunk-data': {
          const chunk = this.#world.ensure(message.chunk.position)
          if (chunk.generationState.type === 'generated') {
            throw new Error('Chunk was already generated.')
          }
          chunk.data = message.chunk.data
          for (const { position, block } of chunk.generationState.queue) {
            chunk.set(position, block)
          }
          chunk.generationState = { type: 'generated' }
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

    this.#world.register(
      new ServerChunk({
        id: 0,
        transform: mat4.translate<Float32Array>(
          mat4.axisRotation([1, 2, 3], Math.PI / 6),
          [16, 0, 0]
        )
      })
    )
    for (let x = 0; x < SIZE; x++) {
      for (let y = 0; y < SIZE; y++) {
        for (let z = 0; z < SIZE; z++) {
          if (Math.hypot(x - SIZE / 2, y - SIZE / 2, z - SIZE / 2) < 15) {
            this.#world.floating[0].set({ x, y, z }, Block.STONE)
          }
        }
      }
    }
    this.#world.floating[0].generationState = { type: 'generated' }
  }

  handleOpen (conn: Connection): void {
    conn.send({ type: 'pong' })
    this.#players.set(conn, {
      entityId: this.nextId++,
      position: { x: 0, y: 32, z: 0 },
      rotationY: 0,
      subscribed: new Set()
    })
  }

  handleMessage (conn: Connection, message: ClientMessage): void {
    const player = this.#players.get(conn)
    if (!player) {
      return
    }
    switch (message.type) {
      case 'ping': {
        console.log('received ping')
        let i = 0
        setInterval(() => {
          const block = i++ % 2 === 0 ? Block.WHITE : Block.AIR
          const { chunk } = this.#world.setBlock({ x: 1, y: 30, z: 1 }, block)
          if (chunk) {
            for (const subscriber of chunk?.subscribers) {
              subscriber.send({
                type: 'block-update',
                blocks: [{ position: { x: 1, y: 30, z: 1 }, block }]
              })
            }
          }
          conn.send({
            type: 'block-update',
            blocks: [{ position: { x: 1, y: 1, z: 1 }, block, id: 0 }]
          })
        }, 500)
        break
      }
      case 'subscribe-chunks': {
        const chunksWithData: SerializedChunk[] = []
        for (const position of message.chunks) {
          const chunk = this.#world.ensure(position)
          chunk.subscribers.add(conn)
          player.subscribed.add(chunk)
          if (
            chunk.generationState.type === 'generated' ||
            'id' in chunk.position
          ) {
            chunksWithData.push(chunk.serialize())
          } else if (chunk.generationState.type === 'ungenerated') {
            chunk.generationState.type = 'generating'
            this.#generator.send({ type: 'generate', position: chunk.position })
          }
        }
        if (chunksWithData.length > 0) {
          conn.send({ type: 'chunk-data', chunks: chunksWithData })
        }
        break
      }
      case 'unsubscribe-chunks': {
        for (const position of message.chunks) {
          const chunk = this.#world.lookup(position)
          if (chunk) {
            chunk.subscribers.delete(conn)
            player.subscribed.delete(chunk)
          }
        }
        break
      }
      case 'block-update': {
        const subscribers = new Map<Connection, SerializedBlock[]>()
        for (const { position, block, id } of message.blocks) {
          const {
            chunkPos,
            chunk = new ServerChunk(chunkPos),
            local
          } = this.#world.setBlock(position, block, id)
          if (
            chunk.generationState.type !== 'generated' &&
            'x' in chunk.position
          ) {
            chunk.generationState.queue.push({ position: local, block })
            if (chunk.generationState.type === 'ungenerated') {
              chunk.generationState.type = 'generating'
              this.#generator.send({
                type: 'generate',
                position: chunk.position
              })
              this.#world.register(chunk)
            }
            continue
          }
          for (const subscriber of chunk.subscribers) {
            if (subscriber === conn) {
              continue
            }
            let updates = subscribers.get(subscriber)
            if (!updates) {
              updates = []
              subscribers.set(subscriber, updates)
            }
            updates.push({ position, block, id })
          }
        }
        for (const [subscriber, blocks] of subscribers) {
          subscriber.send({ type: 'block-update', blocks })
        }
        break
      }
      case 'move': {
        player.position = message.position
        player.rotationY = message.rotationY
        for (const c of this.#players.keys()) {
          if (c !== conn) {
            c.send({
              type: 'entity-update',
              entities: [
                {
                  id: player.entityId,
                  position: player.position,
                  rotationY: player.rotationY
                }
              ]
            })
          }
        }
        break
      }
    }
  }

  handleClose (conn: Connection): void {
    const player = this.#players.get(conn)
    if (player) {
      for (const chunk of player.subscribed) {
        chunk.subscribers.delete(conn)
      }
    }
    this.#players.delete(conn)
  }
}
