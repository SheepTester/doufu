import { SerializedChunk } from '../../common/message'
import { Vector3 } from '../../common/Vector3'

export type WorldGeneratorMessage = {
  type: 'chunk-data'
  chunk: SerializedChunk
}
export type WorldGeneratorRequest = {
  type: 'generate'
  position: Vector3
}
