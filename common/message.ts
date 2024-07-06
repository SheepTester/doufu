import { merge } from './buffer'
import { Vector3 } from './Vector3'
import { Block } from './world/Block'

export type ServerMessage =
  | { type: 'pong' }
  | { type: 'chunk-data'; chunks: SerializedChunk[] }
  | { type: 'block-update'; blocks: SerializedBlock[] }
export type ClientMessage =
  | { type: 'ping' }
  | { type: 'subscribe-chunks'; chunks: Vector3[] }
  | { type: 'block-update'; blocks: SerializedBlock[] }

export type SerializedChunk = {
  position: Vector3
  data: Uint8Array
}
export type SerializedBlock = {
  position: Vector3
  block: Block
}

// NOTE: Assumes everyone is using little-endian hardware.

export function encode (
  message: ServerMessage | ClientMessage
): ArrayBufferView {
  switch (message.type) {
    case 'ping':
    case 'pong': {
      return new Int32Array([0])
    }
    case 'subscribe-chunks': {
      return new Int32Array([
        1,
        ...message.chunks.flatMap(({ x, y, z }) => [x, y, z])
      ])
    }
    case 'chunk-data': {
      const chunks: number[] = []
      let offset = 32 + message.chunks.length * 16
      for (const {
        position: { x, y, z },
        data
      } of message.chunks) {
        chunks.push(x, y, z, offset)
        offset += data.length
      }
      return merge([
        new Int32Array([1, message.chunks.length, ...chunks]),
        ...message.chunks.map(({ data }) => data)
      ])
    }
    case 'block-update': {
      return new Int32Array([
        2,
        ...message.blocks.flatMap(({ position: { x, y, z }, block }) => [
          x,
          y,
          z,
          block
        ])
      ])
    }
    default: {
      throw new TypeError(`Unknown message type '${message['type']}'`)
    }
  }
}

export function decodeServer (buffer: ArrayBuffer): ServerMessage {
  const view = new DataView(buffer)
  switch (view.getInt32(0)) {
    case 0: {
      return { type: 'pong' }
    }
    case 1: {
      const chunkCount = view.getInt32(1)
      const chunks = Array.from({ length: chunkCount }, (_, i) => ({
        position: {
          x: view.getInt32(i * 16 + 32),
          y: view.getInt32(i * 16 + 32 + 4),
          z: view.getInt32(i * 16 + 32 + 8)
        },
        offset: view.getInt32(i * 16 + 32 + 12)
      }))
      return {
        type: 'chunk-data',
        chunks: chunks.map(({ position, offset }, i) => ({
          position,
          data: new Uint8Array(
            buffer,
            offset,
            (chunks[i]?.offset ?? buffer.byteLength) - offset
          )
        }))
      }
    }
    case 2: {
      const blocks: SerializedBlock[] = []
      for (let i = 4; i < buffer.byteLength; i += 16) {
        blocks.push({
          position: {
            x: view.getInt32(i),
            y: view.getInt32(i + 4),
            z: view.getInt32(i + 8)
          },
          block: view.getInt32(i + 12)
        })
      }
      return { type: 'block-update', blocks }
    }
    default: {
      throw new TypeError(`Invalid message tag ${view.getInt32(0)}`)
    }
  }
}

export function decodeClient (buffer: ArrayBuffer): ClientMessage {
  const view = new DataView(buffer)
  switch (view.getInt32(0)) {
    case 0: {
      return { type: 'ping' }
    }
    case 1: {
      const chunks: Vector3[] = []
      for (let i = 4; i < buffer.byteLength; i += 12) {
        chunks.push({
          x: view.getInt32(i),
          y: view.getInt32(i + 4),
          z: view.getInt32(i + 8)
        })
      }
      return { type: 'subscribe-chunks', chunks }
    }
    case 2: {
      const blocks: SerializedBlock[] = []
      for (let i = 4; i < buffer.byteLength; i += 16) {
        blocks.push({
          position: {
            x: view.getInt32(i),
            y: view.getInt32(i + 4),
            z: view.getInt32(i + 8)
          },
          block: view.getInt32(i + 12)
        })
      }
      return { type: 'block-update', blocks }
    }
    default: {
      throw new TypeError(`Invalid message tag ${view.getUint8(0)}`)
    }
  }
}
