import { Vector3 } from './Vector3'

export type ServerMessage =
  | { type: 'pong' }
  | {
      type: 'chunk-data'
      chunks: SerializedChunk[]
    }
export type ClientMessage =
  | { type: 'ping' }
  | { type: 'subscribe-chunks'; chunks: Vector3[] }

export type SerializedChunk = {
  position: Vector3
  data: Uint8Array
}
