import { Vector3 } from '../../common/Vector3'

export type PlayerOptions = {
  /** In m/s^2. */
  moveAccel: number
  /** In m/s^2. */
  gravity: number
  /** In m/s. */
  jumpVel: number
  /** In 1/s. F = kv. */
  frictionCoeff: number
  /** In m. */
  collisionRadius: number
  /** In m. Distance above the camera. */
  head: number
  /** In m. Distance below the camera. */
  feet: number
  /**
   * In m. Length to shrink player by when considering other axes (to avoid
   * colliding with block boundaries due to rounding issues).
   */
  wiggleRoom: number

  collisions: boolean
  flying: boolean

  isSolid: (block: Vector3) => boolean
}

export class Player {
  x = 0
  y = 0
  z = 16
  xv = 0
  yv = 0
  zv = 0

  options: PlayerOptions

  #keys: Record<string, boolean> = {}

  constructor ({ x, y, z, ...options }: PlayerOptions & Vector3) {
    this.x = x
    this.y = y
    this.z = z
    this.options = options
  }

  listen (element: Element): void {
    document.addEventListener('keydown', e => {
      if (e.target !== document && e.target !== document.body) {
        return
      }
      this.#keys[e.key.toLowerCase()] = true
      if (e.key === 'c') {
        this.options.collisions = !this.options.collisions
      }
      if (e.key === 'f') {
        this.options.flying = !this.options.flying
      }
      if (document.pointerLockElement === element) {
        e.preventDefault()
      }
    })
    document.addEventListener('keyup', e => {
      this.#keys[e.key.toLowerCase()] = false
    })
    // Prevent sticky keys when doing ctrl+shift+tab
    window.addEventListener('blur', () => {
      this.#keys = {}
    })
  }

  move (elapsed: number, yaw: number): void {
    const acceleration = {
      x: this.xv * this.options.frictionCoeff,
      z: this.zv * this.options.frictionCoeff
    }

    const direction = { x: 0, z: 0 }
    if (this.#keys.a || this.#keys.arrowleft) {
      direction.x -= 1
    }
    if (this.#keys.d || this.#keys.arrowright) {
      direction.x += 1
    }
    if (this.#keys.w || this.#keys.arrowup) {
      direction.z -= 1
    }
    if (this.#keys.s || this.#keys.arrowdown) {
      direction.z += 1
    }
    const moving = direction.x !== 0 || direction.z !== 0
    if (moving) {
      const factor =
        this.options.moveAccel / Math.hypot(direction.x, direction.z)
      // TODO: idk why yaw needs to be inverted
      acceleration.x +=
        factor * (Math.cos(-yaw) * direction.x - Math.sin(-yaw) * direction.z)
      acceleration.z +=
        factor * (Math.sin(-yaw) * direction.x + Math.cos(-yaw) * direction.z)
    }

    let yAccel = this.yv
    if (this.options.flying) {
      yAccel *= this.options.frictionCoeff
      if (this.#keys[' ']) {
        yAccel += this.options.moveAccel
      }
      if (this.#keys.shift) {
        yAccel -= this.options.moveAccel
      }
    } else {
      yAccel = this.options.gravity
      if (this.#keys[' ']) {
        const y = Math.floor(
          this.y - this.options.feet - this.options.wiggleRoom
        )
        checkGround: for (
          let x = Math.floor(
            this.x - this.options.collisionRadius + this.options.wiggleRoom
          );
          x <=
          Math.floor(
            this.x + this.options.collisionRadius - this.options.wiggleRoom
          );
          x++
        ) {
          for (
            let z = Math.floor(
              this.z - this.options.collisionRadius + this.options.wiggleRoom
            );
            z <=
            Math.floor(
              this.z + this.options.collisionRadius - this.options.wiggleRoom
            );
            z++
          ) {
            if (this.options.isSolid({ x, y, z })) {
              this.yv = this.options.jumpVel
              break checkGround
            }
          }
        }
      }
    }

    this.#moveAxis('x', acceleration.x, elapsed, moving)
    this.#moveAxis('z', acceleration.z, elapsed, moving)
    this.#moveAxis('y', yAccel, elapsed, this.#keys[' '] || this.#keys.shift)
  }

  #moveAxis (
    axis: 'x' | 'y' | 'z',
    acceleration: number,
    time: number,
    userMoving: boolean
  ): void {
    let endVel = this[`${axis}v`] + acceleration * time
    if (
      !userMoving &&
      Math.sign(this[`${axis}v`]) !== Math.sign(endVel) &&
      (this.options.flying || axis !== 'y')
    ) {
      // Friction has set velocity to 0
      endVel = 0
    }
    // displacement = average speed * time
    const avgSpeed = (this[`${axis}v`] + endVel) / 2
    let displacement = avgSpeed * time
    if (this.options.collisions) {
      /** Inclusive ranges. */
      const base: Record<'x' | 'y' | 'z', { min: number; max: number }> = {
        x: {
          min: Math.floor(
            this.x - this.options.collisionRadius + this.options.wiggleRoom
          ),
          max: Math.floor(
            this.x + this.options.collisionRadius - this.options.wiggleRoom
          )
        },
        y: {
          min: Math.floor(this.y - this.options.feet + this.options.wiggleRoom),
          max: Math.floor(this.y + this.options.head - this.options.wiggleRoom)
        },
        z: {
          min: Math.floor(
            this.z - this.options.collisionRadius + this.options.wiggleRoom
          ),
          max: Math.floor(
            this.z + this.options.collisionRadius - this.options.wiggleRoom
          )
        }
      }
      const offset =
        axis === 'y'
          ? displacement > 0
            ? this.options.head
            : this.options.feet
          : this.options.collisionRadius
      let block =
        displacement > 0
          ? Math.floor(this[axis] + offset)
          : Math.floor(this[axis] - offset)
      checkCollide: while (
        displacement > 0
          ? block <= this[axis] + offset + displacement
          : block >= Math.floor(this[axis] - offset + displacement)
      ) {
        const range = { ...base, [axis]: { min: block, max: block } }
        for (let x = range.x.min; x <= range.x.max; x++) {
          for (let y = range.y.min; y <= range.y.max; y++) {
            for (let z = range.z.min; z <= range.z.max; z++) {
              if (this.options.isSolid({ x, y, z })) {
                if (
                  (displacement > 0 && endVel > 0) ||
                  (displacement < 0 && endVel < 0)
                ) {
                  endVel = 0
                }
                displacement =
                  (displacement > 0
                    ? Math.max(block - offset, this[axis])
                    : Math.min(block + 1 + offset, this[axis])) - this[axis]
                break checkCollide
              }
            }
          }
        }
        if (displacement > 0) {
          block++
        } else {
          block--
        }
      }
    }
    this[axis] += displacement
    this[`${axis}v`] = endVel
  }
}
