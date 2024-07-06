import { SerializedChunk } from '../../common/message'
import { Vector3 } from '../../common/Vector3'

export type WorldGenMessage = {
  type: 'chunk-data'
  chunk: SerializedChunk
}
export type WorldGenRequest = {
  type: 'generate'
  position: Vector3
}
