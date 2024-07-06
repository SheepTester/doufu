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
