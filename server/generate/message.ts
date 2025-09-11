import { SerializedChunk } from '../../common/message'
import { Vector3 } from '../../common/Vector3'
import { ChunkFeatureChange } from './priority'

export type ChunkChange = { position: Vector3; changes: ChunkFeatureChange[] }
export type WorldGenMessage =
  | {
      type: 'chunk-data'
      chunk: SerializedChunk
    }
  | {
      type: 'retcon-blocks'
      chunks: ChunkChange[]
    }
export type WorldGenRequest = {
  type: 'generate'
  position: Vector3
}
