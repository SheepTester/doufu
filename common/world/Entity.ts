import { Vector3 } from '../../common/Vector3'
import { isSolid } from '../../common/world/Block'
import { Chunk } from '../../common/world/Chunk'
import { World } from '../../common/world/World'

export type EntityOptions = {
  /** In m. */
  collisionRadius: number
  /** In m. */
  height: number
  /**
   * In m. Length to shrink player by when considering other axes (to avoid
   * colliding with block boundaries due to rounding issues).
   */
  wiggleRoom: number
}

export class Entity<W extends World<Chunk> = World<Chunk>> {
  world: W
  options: EntityOptions
  collisions = true

  x = 0
  y = 0
  z = 16
  xv = 0
  yv = 0
  zv = 0
  onGround = false

  constructor (world: W, { x, y, z, ...options }: EntityOptions & Vector3) {
    this.world = world
    this.options = options
    this.x = x
    this.y = y
    this.z = z
  }

  move (elapsed: number, acceleration: Vector3): void {
    this.#moveAxis('x', acceleration.x, elapsed)
    this.#moveAxis('z', acceleration.z, elapsed)
    this.#moveAxis('y', acceleration.y, elapsed)
    this.onGround = this.#testGround()
  }

  #moveAxis (axis: 'x' | 'y' | 'z', acceleration: number, time: number): void {
    let endVel = this[`${axis}v`] + acceleration * time
    if (
      acceleration === 0 &&
      Math.sign(this[`${axis}v`]) !== Math.sign(endVel)
    ) {
      // Friction has set velocity to 0
      endVel = 0
    }
    // displacement = average speed * time
    const avgSpeed = (this[`${axis}v`] + endVel) / 2
    let displacement = avgSpeed * time
    if (this.collisions) {
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
          min: Math.floor(this.y + this.options.wiggleRoom),
          max: Math.floor(
            this.y + this.options.height - this.options.wiggleRoom
          )
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
            ? this.options.height
            : 0
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
              if (isSolid(this.world.getBlock({ x, y, z }))) {
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

  #testGround (): boolean {
    const y = Math.floor(this.y - this.options.wiggleRoom)
    for (
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
        if (isSolid(this.world.getBlock({ x, y, z }))) {
          return true
        }
      }
    }
    return false
  }
}
