import { SerializedBlock, SerializedChunk } from '../../common/message'
import { Vector3 } from '../../common/Vector3'

export type MeshWorkerMessage = {
  type: 'mesh'
  position: Vector3
  data: Uint8Array
}
export type MeshWorkerRequest =
  | { type: 'chunk-data'; chunks: SerializedChunk[] }
  | { type: 'block-update'; blocks: SerializedBlock[] }
