import { SerializedBlock, SerializedChunk } from '../../common/message'
import { Vector3 } from '../../common/Vector3'
import { LoneId } from '../../common/world/Chunk'

export type MeshWorkerMessage =
  | {
      type: 'mesh'
      position: Vector3 | LoneId
      data: Uint8Array
    }
  | {
      type: 'mesh-time'
      /** In ms. */
      time: number
    }
export type MeshWorkerRequest =
  | { type: 'chunk-data'; chunks: SerializedChunk[] }
  | { type: 'block-update'; blocks: SerializedBlock[] }
  | { type: 'forget'; chunk: Vector3 }
