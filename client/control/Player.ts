import { mat4, Mat4 } from 'wgpu-matrix'
import { add, normalize, scale, Vector3 } from '../../common/Vector3'
import { Block } from '../../common/world/Block'
import { Entity, EntityOptions } from '../../common/world/Entity'
import { ClientWorld } from '../render/ClientWorld'
import { Camera } from './Camera'
import { RaycastResult } from './raycast'

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
  playerOptions: PlayerOptions

  #keys: Record<string, boolean> = {}

  constructor (
    world: ClientWorld,
    options: PlayerOptions & EntityOptions & Vector3
  ) {
    super(world, options)
    this.collisions = options.collisions
    this.playerOptions = options
  }

  listen (element: HTMLElement): void {
    this.camera.attach(element)

    document.addEventListener('keydown', e => {
      if (e.target !== document && e.target !== document.body) {
        return
      }
      this.#keys[e.key.toLowerCase()] = true
      if (e.key === 'c') {
        this.collisions = !this.collisions
      }
      if (e.key === 'f') {
        this.playerOptions.flying = !this.playerOptions.flying
      }
      if (document.pointerLockElement === element) {
        e.preventDefault()
      }
    })
    document.addEventListener('keyup', e => {
      this.#keys[e.key.toLowerCase()] = false
    })
    element.addEventListener('pointerdown', e => {
      this.#keys[`mouse${e.button}`] = true
    })
    element.addEventListener('pointerup', e => {
      this.#keys[`mouse${e.button}`] = false
    })
    // Prevent sticky keys when doing ctrl+shift+tab
    window.addEventListener('blur', () => {
      this.#keys = {}
    })
  }

  doMovement (elapsed: number): void {
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
      if (this.#keys[' ']) {
        acceleration.y += this.playerOptions.moveAccelFlying
      }
      if (this.#keys.shift) {
        acceleration.y -= this.playerOptions.moveAccelFlying
      }
    } else {
      acceleration.y = this.playerOptions.gravity
      if (this.#keys[' '] && this.onGround) {
        this.yv = this.playerOptions.jumpVel
      }
    }

    this.move(elapsed, acceleration, friction)
  }

  raycast (): RaycastResult | null {
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
    if (this.#keys.mouse0 || this.#keys.q) {
      this.world.setBlock(
        result.block,
        this.#keys.mouse2 || this.#keys.r ? Block.WHITE : Block.AIR,
        true
      )
    } else if (this.#keys.mouse2 || this.#keys.r) {
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
      if (this.world.getBlock(target) === Block.AIR) {
        this.world.setBlock(target, Block.WHITE, true)
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
