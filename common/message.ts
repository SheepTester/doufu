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
      return new Int32Array([69])
    }
    case 'subscribe-chunks': {
      return new Int32Array([
        1,
        ...message.chunks.flatMap(({ x, y, z }) => [x, y, z])
      ])
    }
    case 'chunk-data': {
      const chunks: number[] = []
      let offset = (2 + message.chunks.length * 4) * 4
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
  const view = new Int32Array(buffer, 0, Math.floor(buffer.byteLength / 4))
  switch (view[0]) {
    case 69: {
      return { type: 'pong' }
    }
    case 1: {
      const chunkCount = view[1]
      const chunks = Array.from({ length: chunkCount }, (_, i) => ({
        position: {
          x: view[i * 4 + 2],
          y: view[i * 4 + 2 + 1],
          z: view[i * 4 + 2 + 2]
        },
        offset: view[i * 4 + 2 + 3]
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
      for (let i = 1; i < view.length; i += 4) {
        blocks.push({
          position: {
            x: view[i],
            y: view[i + 1],
            z: view[i + 2]
          },
          block: view[i + 3]
        })
      }
      return { type: 'block-update', blocks }
    }
    default: {
      console.error(buffer, new TextDecoder().decode(buffer))
      throw new TypeError(`Invalid server message tag ${view[0]}`)
    }
  }
}

export function decodeClient (
  buffer: ArrayBuffer,
  byteOffset = 0,
  byteLength = buffer.byteLength - byteOffset
): ClientMessage {
  const view = new Int32Array(buffer, byteOffset, Math.floor(byteLength / 4))
  switch (view[0]) {
    case 69: {
      return { type: 'ping' }
    }
    case 1: {
      const chunks: Vector3[] = []
      for (let i = 1; i < view.length; i += 3) {
        chunks.push({
          x: view[i],
          y: view[i + 1],
          z: view[i + 2]
        })
      }
      return { type: 'subscribe-chunks', chunks }
    }
    case 2: {
      const blocks: SerializedBlock[] = []
      for (let i = 1; i < view.length; i += 4) {
        blocks.push({
          position: {
            x: view[i],
            y: view[i + 1],
            z: view[i + 2]
          },
          block: view[i + 3]
        })
      }
      return { type: 'block-update', blocks }
    }
    default: {
      console.error(buffer, new TextDecoder().decode(buffer))
      throw new TypeError(`Invalid client message tag ${view[0]}`)
    }
  }
}
