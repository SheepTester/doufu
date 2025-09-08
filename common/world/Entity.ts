import { mat4 } from 'wgpu-matrix'
import { length, sub, transform, Vector3, ZERO } from '../../common/Vector3'
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

  collisions: boolean
}

export class Entity<W extends World<Chunk> = World<Chunk>> {
  world: W
  options: EntityOptions

  x = 0
  y = 0
  z = 16
  velocity = ZERO
  onGround = false

  constructor (world: W, { x, y, z, ...options }: EntityOptions & Vector3) {
    this.world = world
    this.options = options
    this.x = x
    this.y = y
    this.z = z
  }

  /**
   * @param elapsed in seconds
   */
  move (elapsed: number, acceleration: Vector3, friction: Vector3): void {
    let minMovement = Infinity
    let newPosition: Vector3 = this
    let newVelocity = ZERO
    for (const {
      transform: chunkTransform = mat4.identity(),
      isSolid
    } of this.world.realms()) {
      const inverse = mat4.inverse(chunkTransform)
      const position = transform(this, inverse, true)
      const velocity = transform(this.velocity, inverse, false)
      const accel = transform(acceleration, inverse, false)
      const frict = transform(friction, inverse, false)
      for (const axis of ['x', 'z', 'y'] as const) {
        moveAxis(
          position,
          velocity,
          axis,
          accel[axis],
          frict[axis],
          elapsed,
          this.options,
          isSolid
        )
      }
      const newPos = transform(position, chunkTransform, true)
      const movement = length(sub(this, newPos))
      if (movement < minMovement) {
        minMovement = movement
        newPosition = newPos
        newVelocity = transform(velocity, chunkTransform, false)
      }
    }
    Object.assign(this, newPosition)
    this.velocity = newVelocity

    this.onGround = false
    for (const {
      transform: chunkTransform = mat4.identity(),
      isSolid
    } of this.world.realms()) {
      if (
        testGround(
          transform(this, mat4.inverse<Float32Array>(chunkTransform), true),
          this.options,
          isSolid
        )
      ) {
        this.onGround = true
        break
      }
    }
  }
}

function moveAxis (
  position: Vector3,
  velocity: Vector3,
  axis: 'x' | 'y' | 'z',
  acceleration: number,
  friction: number,
  time: number,
  options: EntityOptions,
  isSolid: (block: Vector3) => boolean
): void {
  let endVel = velocity[axis] + (acceleration + friction) * time
  if (acceleration === 0 && Math.sign(velocity[axis]) !== Math.sign(endVel)) {
    // Friction has set velocity to 0
    endVel = 0
  }
  // displacement = average speed * time
  const avgSpeed = (velocity[axis] + endVel) / 2
  let displacement = avgSpeed * time
  if (options.collisions) {
    /** Inclusive ranges. */
    const base: Record<'x' | 'y' | 'z', { min: number; max: number }> = {
      x: {
        min: Math.floor(
          position.x - options.collisionRadius + options.wiggleRoom
        ),
        max: Math.floor(
          position.x + options.collisionRadius - options.wiggleRoom
        )
      },
      y: {
        min: Math.floor(position.y + options.wiggleRoom),
        max: Math.floor(position.y + options.height - options.wiggleRoom)
      },
      z: {
        min: Math.floor(
          position.z - options.collisionRadius + options.wiggleRoom
        ),
        max: Math.floor(
          position.z + options.collisionRadius - options.wiggleRoom
        )
      }
    }
    const offset =
      axis === 'y'
        ? displacement > 0
          ? options.height
          : 0
        : options.collisionRadius
    let block =
      displacement > 0
        ? Math.floor(position[axis] + offset)
        : Math.floor(position[axis] - offset)
    checkCollide: while (
      displacement > 0
        ? block <= position[axis] + offset + displacement
        : block >= Math.floor(position[axis] - offset + displacement)
    ) {
      const range = { ...base, [axis]: { min: block, max: block } }
      for (let x = range.x.min; x <= range.x.max; x++) {
        for (let y = range.y.min; y <= range.y.max; y++) {
          for (let z = range.z.min; z <= range.z.max; z++) {
            if (isSolid({ x, y, z })) {
              if (
                (displacement > 0 && endVel > 0) ||
                (displacement < 0 && endVel < 0)
              ) {
                endVel = 0
              }
              displacement =
                (displacement > 0
                  ? Math.max(block - offset, position[axis])
                  : Math.min(block + 1 + offset, position[axis])) -
                position[axis]
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
  position[axis] += displacement
  velocity[axis] = endVel
}

function testGround (
  position: Vector3,
  options: EntityOptions,
  isSolid: (block: Vector3) => boolean
): boolean {
  const y = Math.floor(position.y - options.wiggleRoom)
  for (
    let x = Math.floor(
      position.x - options.collisionRadius + options.wiggleRoom
    );
    x <= Math.floor(position.x + options.collisionRadius - options.wiggleRoom);
    x++
  ) {
    for (
      let z = Math.floor(
        position.z - options.collisionRadius + options.wiggleRoom
      );
      z <=
      Math.floor(position.z + options.collisionRadius - options.wiggleRoom);
      z++
    ) {
      if (isSolid({ x, y, z })) {
        return true
      }
    }
  }
  return false
}
