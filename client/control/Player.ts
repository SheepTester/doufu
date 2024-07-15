import { mat4, Mat4 } from 'wgpu-matrix'
import { add, normalize, scale, Vector3 } from '../../common/Vector3'
import { Block } from '../../common/world/Block'
import { Entity, EntityOptions } from '../../common/world/Entity'
import { ClientWorld } from '../render/ClientWorld'
import { Camera } from './Camera'
import { RaycastResult } from './raycast'
import { defaultKeys, InputProvider, KeyInput } from './input'
import { WorldRaycastResult } from '../../common/world/World'

export type PlayerOptions = {
  /** In m/s. Applied when you walk on the ground. */
  moveVel: number
  /** In m/s^2. Applied when you try walking in the air. */
  moveAccelAir: number
  /** In m/s^2. Applied when you try walking in the air. */
  moveAccelFlying: number
  /** In m/s^2. */
  gravity: number
  /** In m/s. */
  jumpVel: number
  /** In m/s^2. Applied while walking on the ground. */
  frictionGround: number
  /** In 1/s. F = kv. Applied while falling. */
  frictionCoeffAir: number
  /** In 1/s. F = kv. Applied while flying. */
  frictionCoeffFlying: number
  /** In m. */
  eyeHeight: number
  /** In m. */
  reach: number

  collisions: boolean
  flying: boolean
}

export class Player extends Entity<ClientWorld> {
  camera = new Camera()
  input: InputProvider
  prevKeys: KeyInput = defaultKeys()
  playerOptions: PlayerOptions

  constructor (
    world: ClientWorld,
    input: InputProvider,
    options: PlayerOptions & EntityOptions & Vector3
  ) {
    super(world, options)
    this.input = input
    this.collisions = options.collisions
    this.playerOptions = options
  }

  doMovement (elapsed: number): void {
    this.camera.yaw += this.input.camera.yaw
    this.camera.pitch += this.input.camera.pitch
    this.camera.roll += this.input.camera.roll
    this.input.resetCamera()
    if (this.camera.pitch > Math.PI / 2) {
      this.camera.pitch = Math.PI / 2
    } else if (this.camera.pitch < -Math.PI / 2) {
      this.camera.pitch = -Math.PI / 2
    }

    if (this.input.keys.toggleCollisions && !this.prevKeys.toggleCollisions) {
      this.collisions = !this.collisions
    }
    if (this.input.keys.toggleFlight && !this.prevKeys.toggleFlight) {
      this.playerOptions.flying = !this.playerOptions.flying
    }

    const friction =
      this.playerOptions.flying || !this.onGround
        ? scale(
            {
              x: this.xv,
              y: this.playerOptions.flying ? this.yv : 0,
              z: this.zv
            },
            this.playerOptions.flying
              ? this.playerOptions.frictionCoeffFlying
              : this.playerOptions.frictionCoeffAir
          )
        : scale(
            normalize({
              x: -this.xv,
              y: -this.playerOptions.flying ? this.yv : 0,
              z: -this.zv
            }),
            this.playerOptions.frictionGround
          )
    const acceleration = { x: 0, y: 0, z: 0 }

    const direction = { x: 0, z: 0 }
    if (this.input.keys.left) {
      direction.x -= 1
    }
    if (this.input.keys.right) {
      direction.x += 1
    }
    if (this.input.keys.forward) {
      direction.z -= 1
    }
    if (this.input.keys.backward) {
      direction.z += 1
    }
    const moving = direction.x !== 0 || direction.z !== 0
    if (moving) {
      const factor =
        (this.playerOptions.flying
          ? this.playerOptions.moveAccelFlying
          : this.onGround
          ? this.playerOptions.moveVel
          : this.playerOptions.moveAccelAir) /
        Math.hypot(direction.x, direction.z)
      // TODO: idk why yaw needs to be inverted
      const movementX =
        factor *
        (Math.cos(-this.camera.yaw) * direction.x -
          Math.sin(-this.camera.yaw) * direction.z)
      const movementZ =
        factor *
        (Math.sin(-this.camera.yaw) * direction.x +
          Math.cos(-this.camera.yaw) * direction.z)
      // In Minecraft, it seems you change direction instantly when on the
      // ground
      if (!this.playerOptions.flying && this.onGround) {
        this.xv = movementX
        this.zv = movementZ
      } else {
        acceleration.x += movementX
        acceleration.z += movementZ
      }
    }

    if (this.playerOptions.flying) {
      if (this.input.keys.jump) {
        acceleration.y += this.playerOptions.moveAccelFlying
      }
      if (this.input.keys.sneak) {
        acceleration.y -= this.playerOptions.moveAccelFlying
      }
    } else {
      acceleration.y = this.playerOptions.gravity
      if (this.input.keys.jump && this.onGround) {
        this.yv = this.playerOptions.jumpVel
      }
    }

    this.move(elapsed, acceleration, friction)

    this.prevKeys = { ...this.input.keys }
  }

  raycast (): WorldRaycastResult | null {
    return this.world.raycast(
      add(this, { y: this.playerOptions.eyeHeight }),
      this.camera.getForward(),
      this.playerOptions.reach
    )
  }

  interact (): void {
    const result = this.raycast()
    if (!result) {
      return
    }
    if (this.input.keys.mine) {
      this.world.setBlock(
        result.block,
        this.input.keys.place ? Block.WHITE : Block.AIR,
        result.id,
        true
      )
    } else if (this.input.keys.place) {
      const target = add(result.block, result.normal)
      if (
        target.x < this.x + this.options.collisionRadius &&
        this.x - this.options.collisionRadius < target.x + 1 &&
        target.z < this.z + this.options.collisionRadius &&
        this.z - this.options.collisionRadius < target.z + 1 &&
        target.y < this.y + this.options.height &&
        this.y < target.y + 1
      ) {
        return
      }
      if (this.world.getBlock(target, result.id) === Block.AIR) {
        this.world.setBlock(target, Block.WHITE, result.id, true)
      }
    }
  }

  getTransform (): Mat4 {
    return this.camera.transform(
      mat4.translation<Float32Array>([
        this.x,
        this.y + this.playerOptions.eyeHeight,
        this.z
      ])
    )
  }
}
