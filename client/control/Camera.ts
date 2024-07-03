import { Mat4, mat4 } from 'wgpu-matrix'

export class Camera {
  /** Head shake direction (rotation about y-axis) */
  yaw = 0
  /** Nod direction (rotation about x-axis) */
  pitch = 0
  /** Tilt (rotate about z-axis) */
  roll = 0

  attach (element: HTMLElement) {
    element.addEventListener('click', () => {
      element.requestPointerLock()
    })
    element.addEventListener('mousemove', e => {
      if (document.pointerLockElement !== element) {
        return
      }
      this.yaw -= e.movementX / 500
      this.pitch -= e.movementY / 500
      if (this.pitch > Math.PI / 2) {
        this.pitch = Math.PI / 2
      } else if (this.pitch < -Math.PI / 2) {
        this.pitch = -Math.PI / 2
      }
    })
  }

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
}
