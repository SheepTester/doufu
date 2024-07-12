import { merge } from './buffer'
import { fromArray, toArray, Vector3 } from './Vector3'
import { Block } from './world/Block'

export type ServerMessage =
  | { type: 'pong' }
  | { type: 'chunk-data'; chunks: SerializedChunk[] }
  | { type: 'block-update'; blocks: SerializedBlock[] }
  | { type: 'entity-update'; entities: SerializedEntity[] }
export type ClientMessage =
  | { type: 'ping' }
  | { type: 'subscribe-chunks'; chunks: Vector3[] }
  | { type: 'block-update'; blocks: SerializedBlock[] }
  | { type: 'move'; position: Vector3; rotationY: number }

export type SerializedChunk = {
  position: Vector3
  data: Uint8Array
}
export type SerializedBlock = {
  position: Vector3
  block: Block
}
export type SerializedEntity = {
  id: number
  position: Vector3
  rotationY: number
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
      return new Int32Array([1, ...message.chunks.flatMap(toArray)])
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
    case 'move': {
      return merge([
        new Int32Array([3, 0]),
        new Float64Array([...toArray(message.position), message.rotationY])
      ])
    }
    case 'entity-update': {
      return merge([
        new Int32Array([3, message.entities.length]),
        ...message.entities.map(
          ({ id, position: { x, y, z }, rotationY }) =>
            new Float64Array([id, x, y, z, rotationY])
        )
      ])
    }
    default: {
      throw new TypeError(`Unknown message type '${message['type']}'`)
    }
  }
}

export function decodeServer (buffer: ArrayBuffer): ServerMessage {
  const view = new Int32Array(buffer, 0, Math.floor(buffer.byteLength / 4))
  const floatView = new Float64Array(
    buffer,
    0,
    Math.floor(buffer.byteLength / 8)
  )
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
            (chunks[i + 1]?.offset ?? buffer.byteLength) - offset
          )
        }))
      }
    }
    case 2: {
      const blocks: SerializedBlock[] = []
      for (let i = 1; i < view.length; i += 4) {
        blocks.push({
          position: fromArray(view.slice(i, i + 3)),
          block: view[i + 3]
        })
      }
      return { type: 'block-update', blocks }
    }
    case 3: {
      return {
        type: 'entity-update',
        entities: Array.from({ length: view[1] }, (_, i) => ({
          id: floatView[i * 5 + 1],
          position: {
            x: floatView[i * 5 + 1 + 1],
            y: floatView[i * 5 + 1 + 2],
            z: floatView[i * 5 + 1 + 3]
          },
          rotationY: floatView[i * 5 + 1 + 4]
        }))
      }
    }
    default: {
      console.error(buffer, new TextDecoder().decode(buffer))
      throw new TypeError(`Invalid server message tag ${view[0]}`)
    }
  }
}

export function decodeClient (buffer: ArrayBuffer): ClientMessage {
  const view = new Int32Array(buffer, 0, Math.floor(buffer.byteLength / 4))
  const floatView = new Float64Array(
    buffer,
    0,
    Math.floor(buffer.byteLength / 8)
  )
  switch (view[0]) {
    case 69: {
      return { type: 'ping' }
    }
    case 1: {
      const chunks: Vector3[] = []
      for (let i = 1; i < view.length; i += 3) {
        chunks.push(fromArray(view.slice(i, i + 3)))
      }
      return { type: 'subscribe-chunks', chunks }
    }
    case 2: {
      const blocks: SerializedBlock[] = []
      for (let i = 1; i < view.length; i += 4) {
        blocks.push({
          position: fromArray(view.slice(i, i + 3)),
          block: view[i + 3]
        })
      }
      return { type: 'block-update', blocks }
    }
    case 3: {
      return {
        type: 'move',
        position: fromArray(floatView.slice(1, 4)),
        rotationY: floatView[4]
      }
    }
    default: {
      console.error(buffer, new TextDecoder().decode(buffer))
      throw new TypeError(`Invalid client message tag ${view[0]}`)
    }
  }
}
