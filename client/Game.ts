import { mat4, Mat4 } from 'wgpu-matrix'
import {
  ClientMessage,
  decodeServer,
  encode,
  ServerMessage
} from '../common/message'
import { length, map2, toArray, Vector3 } from '../common/Vector3'
import { SIZE } from '../common/world/Chunk'
import { Player } from './control/Player'
import { handleError } from './debug/error'
import { Connection } from './net/Connection'
import { ClientChunk } from './render/ClientChunk'
import { ClientWorld } from './render/ClientWorld'
import { Context, createContext } from './render/Context'

// TEMP
import pancakeGeo from './asset/pancake.geo.json'
import pancakeTexture from './asset/pancake.png'
import { fromBedrockModel } from './render/Model'

declare const USE_WS: string | boolean

export type GameOptions = {
  /**
   * Approximate radius to load new chunks in, in chunks. Checks if the middle
   * of the chunk is `loadRange * SIZE` blocks away from the player.
   *
   * Chunks `(loadRange + 1)` chunks away get unloaded.
   */
  loadRange: number
}

export async function init (options: GameOptions): Promise<Game> {
  if (!navigator.gpu) {
    throw new TypeError('Your browser does not support WebGPU.')
  }
  const canvas = document.getElementById('canvas')
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new TypeError('Failed to find the canvas element.')
  }
  const context = canvas.getContext('webgpu')
  if (!context) {
    throw new TypeError('Failed to get WebGPU canvas context.')
  }

  const format = navigator.gpu.getPreferredCanvasFormat()
  const renderer = await createContext(format)
  renderer.device.addEventListener('uncapturederror', e => {
    if (e instanceof GPUUncapturedErrorEvent) {
      handleError(e.error)
    }
  })
  context.configure({ device: renderer.device, format })

  renderer.models = await fromBedrockModel(renderer, pancakeGeo, pancakeTexture)

  return new Game(renderer, canvas, context, options)
}

export class Game {
  #options: GameOptions

  #context: Context
  #canvas: HTMLCanvasElement
  #canvasContext: GPUCanvasContext
  #server: Connection<ServerMessage, ClientMessage>

  #keys: Record<string, boolean> = {}

  #lastTime = Date.now()
  #frameId: number | null = null

  #world: ClientWorld
  #entities: Record<number, Mat4> = {}
  #player: Player

  constructor (
    context: Context,
    canvas: HTMLCanvasElement,
    canvasContext: GPUCanvasContext,
    options: GameOptions
  ) {
    this.#context = context
    this.#canvas = canvas
    this.#canvasContext = canvasContext
    this.#options = options
    this.#server = new Connection<ServerMessage, ClientMessage>({
      onMessage: this.#handleMessage,
      encode,
      decode: decodeServer
    })
    this.#world = new ClientWorld(this.#context, this.#server)
    this.#player = new Player(this.#world, {
      x: 0.5,
      y: SIZE + 1.5,
      z: 0.5,

      moveAccel: 50,
      gravity: -30,
      jumpVel: 10,
      frictionCoeff: -5,
      collisionRadius: 0.3,
      height: 1.6,
      eyeHeight: 1.4,
      wiggleRoom: 0.01,
      reach: (this.#options.loadRange + 0.5) * SIZE,

      collisions: true,
      flying: false
    })
  }

  start () {
    this.#player.listen(this.#canvas)

    new ResizeObserver(([{ devicePixelContentBoxSize }]) => {
      const [{ blockSize, inlineSize }] = devicePixelContentBoxSize
      this.#canvas.width = inlineSize
      this.#canvas.height = blockSize
      this.#context.resize(inlineSize, blockSize, window.devicePixelRatio)
      if (this.#frameId === null) {
        this.#paint()
      }
    }).observe(this.#canvas)

    document.addEventListener('keydown', e => {
      if (e.target !== document && e.target !== document.body) {
        return
      }
      this.#keys[e.key.toLowerCase()] = true
      if (document.pointerLockElement === this.#canvas) {
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

    if (USE_WS) {
      this.#server.connect(
        typeof USE_WS === 'string'
          ? USE_WS
          : window.location.origin.replace('http', 'ws') + '/ws'
      )
    } else {
      this.#server.connectWorker('./server/worker.js')
    }
  }

  #handleMessage = (message: ServerMessage) => {
    switch (message.type) {
      case 'pong': {
        this.#server.send({ type: 'ping' })
        break
      }
      case 'chunk-data': {
        this.#world.setChunks(message.chunks)
        break
      }
      case 'block-update': {
        this.#world.setBlocks(message.blocks, false)
        break
      }
      case 'entity-update': {
        for (const { id, position, rotationY } of message.entities) {
          this.#entities[id] = mat4.rotateY(
            mat4.translation(toArray(position)),
            rotationY
          )
        }
        for (const model of this.#context.models) {
          model.setInstances(Object.values(this.#entities))
        }
        break
      }
      default: {
        console.error('Unknown server message type', message)
      }
    }
  }

  #updateSubscription () {
    const toSubscribe: { chunk: Vector3; distance: number }[] = []
    for (
      let x = Math.floor(this.#player.x / SIZE - this.#options.loadRange);
      x < Math.ceil(this.#player.x / SIZE + this.#options.loadRange);
      x++
    ) {
      for (
        let y = Math.floor(this.#player.y / SIZE - this.#options.loadRange);
        y < Math.ceil(this.#player.y / SIZE + this.#options.loadRange);
        y++
      ) {
        for (
          let z = Math.floor(this.#player.z / SIZE - this.#options.loadRange);
          z < Math.ceil(this.#player.z / SIZE + this.#options.loadRange);
          z++
        ) {
          const position = { x, y, z }
          // Whether the middle of the chunk is in the load range
          const distance = length(
            map2(
              position,
              this.#player,
              (chunk, player) => chunk + 0.5 - player / SIZE
            )
          )
          if (
            distance <= this.#options.loadRange &&
            !this.#world.lookup(position)
          ) {
            this.#world.register(new ClientChunk(this.#context, position))
            toSubscribe.push({ chunk: position, distance })
          }
        }
      }
    }
    if (toSubscribe.length > 0) {
      this.#server.send({
        type: 'subscribe-chunks',
        chunks: toSubscribe
          // Prioritize loading closest chunks first
          .sort((a, b) => a.distance - b.distance)
          .map(({ chunk }) => chunk)
      })
    }
    const toUnload: Vector3[] = []
    for (const chunk of this.#world.chunks()) {
      const distance = length(
        map2(
          chunk.position,
          this.#player,
          (chunk, player) => chunk + 0.5 - player / SIZE
        )
      )
      if (distance > this.#options.loadRange + 1) {
        this.#world.delete(chunk.position)
        toUnload.push(chunk.position)
      }
    }
    if (toUnload.length > 0) {
      this.#server.send({ type: 'unsubscribe-chunks', chunks: toUnload })
    }
  }

  #paint = () => {
    const now = Date.now()
    const elapsed = Math.min(now - this.#lastTime, 100) / 1000
    this.#lastTime = now

    this.#player.interact()
    this.#player.doMovement(elapsed)
    this.#server.send({
      type: 'move',
      position: { x: this.#player.x, y: this.#player.y, z: this.#player.z },
      rotationY: this.#player.camera.yaw
    })
    this.#updateSubscription()

    const result = this.#player.raycast()
    if (result) {
      this.#context.voxelOutlineEnabled = true
      this.#context.outlineCommon.uniforms.transform.data(
        new Float32Array(mat4.translation(toArray(result.block)))
      )
    } else {
      this.#context.voxelOutlineEnabled = false
    }

    this.#context
      .render(
        this.#canvasContext.getCurrentTexture(),
        mat4.inverse(this.#player.getTransform())
      )
      .catch(error => {
        if (this.#frameId !== null) {
          cancelAnimationFrame(this.#frameId)
          this.#frameId = null
        }
        return Promise.reject(error)
      })
    this.#frameId = requestAnimationFrame(this.#paint)
  }
}
