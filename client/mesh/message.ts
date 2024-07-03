import { Vector3 } from '../../common/Vector3'

export type MeshWorkerMessage = {
  type: 'mesh'
  position: Vector3
  data: Uint8Array
}
