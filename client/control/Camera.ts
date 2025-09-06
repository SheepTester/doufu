import { Mat4, mat4, vec3 } from 'wgpu-matrix'
import { fromArray, Vector3 } from '../../common/Vector3'

export class Camera {
  /** Head shake direction (rotation about y-axis) */
  yaw = 0
  /** Nod direction (rotation about x-axis) */
  pitch = 0
  /** Tilt (rotate about z-axis) */
  roll = 0

  /**
   * Returns the camera's transformation matrix. Note that to get the view
   * matrix, you would need to invert this.
   *
   * @param mat A matrix to apply the transformations to. Same as the matrix
   * that is returned. Defaults to a new identity matrix.
   */
  transform (mat = mat4.identity()): Mat4 {
    mat4.rotateY(mat, this.yaw, mat)
    mat4.rotateX(mat, this.pitch, mat)
    mat4.rotateZ(mat, this.roll, mat)
    return mat
  }

  /** Normalized forward direction vector */
  getForward (): Vector3 {
    return fromArray(
      vec3.transformMat4Upper3x3<Float32Array>([0, 0, -1], this.transform())
    )
  }
}
