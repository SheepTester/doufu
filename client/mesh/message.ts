import { SerializedBlock, SerializedChunk } from '../../common/message'
import { Vector3 } from '../../common/Vector3'

export type MeshWorkerMessage =
  | {
      type: 'mesh'
      position: Vector3
      data: Uint8Array
    }
  | {
      type: 'lone-mesh'
      id: number
      data: Uint8Array
    }
  | {
      type: 'mesh-time'
      /** In ms. */
      time: number
    }
export type MeshWorkerRequest =
  | { type: 'chunk-data'; chunks: SerializedChunk[] }
  | { type: 'lone-chunk-data'; chunk: Uint8Array; id: number }
  | { type: 'block-update'; blocks: SerializedBlock[] }
  | { type: 'forget'; chunk: Vector3 }
