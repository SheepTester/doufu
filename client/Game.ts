import { mat4, Mat4, vec3 } from 'wgpu-matrix'
import {
  ClientMessage,
  decodeServer,
  encode,
  ServerMessage
} from '../common/message'
import {
  add,
  equal,
  fromArray,
  length,
  map2,
  toArray,
  transform,
  Vector3
} from '../common/Vector3'
import { SIZE } from '../common/world/Chunk'
import { Player } from './control/Player'
import { handleError } from './debug/error'
import { Connection } from './net/Connection'
import { ClientChunk } from './render/ClientChunk'
import { ClientWorld } from './render/ClientWorld'
import { Context, createContext, Line } from './render/Context'

// TEMP
import pancakeGeo from './asset/pancake.geo.json'
import pancakeTexture from './asset/pancake.png'
import { fromBedrockModel } from './render/Model'
import { UserInput } from './control/input'
import { submitSample } from './debug/perf'
import { WorldRaycastResult } from '../common/world/World'

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
  const renderer = await createContext(format, {
    onGpuTime: delta => submitSample('gpu', delta)
  })
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
  #input = new UserInput({
    w: 'forward',
    a: 'left',
    s: 'backward',
    d: 'right',
    arrowup: 'forward',
    arrowleft: 'left',
    arrowdown: 'backward',
    arrowright: 'right',
    ' ': 'jump',
    shift: 'sneak',
    mouse0: 'mine',
    mouse2: 'place',
    q: 'mine',
    r: 'place',
    c: 'toggleCollisions',
    f: 'toggleFlight',
    g: 'grapple'
  })

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
    this.#player = new Player(this.#world, this.#input, {
      x: 0.5,
      y: SIZE + 1.5,
      z: 0.5,

      moveVel: 6,
      frictionGround: 20,
      jumpVel: 10,
      gravity: -30,
      moveAccelAir: 25,
      frictionCoeffAir: -8,
      moveAccelFlying: 50,
      frictionCoeffFlying: -5,
      collisionRadius: 0.3,
      height: 1.6,
      eyeHeight: 1.4,
      wiggleRoom: 0.01,
      reach: (this.#options.loadRange + 0.5) * SIZE,

      collisions: true,
      flying: false
    })

    context.world = this.#world
  }

  start () {
    this.#input.listen(this.#canvas)

    new ResizeObserver(([{ devicePixelContentBoxSize }]) => {
      const [{ blockSize, inlineSize }] = devicePixelContentBoxSize
      this.#canvas.width = inlineSize
      this.#canvas.height = blockSize
      this.#context.resize(inlineSize, blockSize, window.devicePixelRatio)
      if (this.#frameId === null) {
        this.#paint()
      }
    }).observe(this.#canvas)

    if (USE_WS) {
      this.#server.connect(
        typeof USE_WS === 'string'
          ? USE_WS
          : window.location.origin.replace('http', 'ws') + '/ws'
      )
    } else {
      this.#server.connectWorker('./server/worker.js')
    }

    this.#world.ensure({ id: 0 })
    this.#server.send({ type: 'subscribe-chunks', chunks: [{ id: 0 }] })
  }

  stop () {
    if (this.#frameId !== null) {
      cancelAnimationFrame(this.#frameId)
      this.#frameId = null
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
      if ('id' in chunk.position) {
        continue
      }
      const distance = length(
        map2(
          chunk.position,
          this.#player,
          (chunk, player) => chunk + 0.5 - player / SIZE
        )
      )
      if (distance > this.#options.loadRange + 1) {
        chunk.destroy()
        this.#world.delete(chunk.position)
        toUnload.push(chunk.position)
      }
    }
    if (toUnload.length > 0) {
      this.#server.send({ type: 'unsubscribe-chunks', chunks: toUnload })
    }
  }

  #lastRaycastResult: WorldRaycastResult | null = null
  #lookAtEdgeLines: Line[] = []
  #hadGrappleLine = false

  #paint = () => {
    const start = performance.now()

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

    // this could probably be implemented better
    let shouldSetLines = this.#player.grapple !== null
    const grappleLine: Line[] = this.#player.grapple
      ? [
        {
          start: add(
            add(this.#player, { y: this.#player.playerOptions.eyeHeight }),
            this.#player.camera.getForward()
          ),
          end: this.#player.grapple,
          color: [255, 0, 255]
        }
      ]
      : []
    if (this.#player.grapple !== null) {
      if (!this.#hadGrappleLine) {
        this.#hadGrappleLine = true
      }
    } else if (this.#hadGrappleLine) {
      shouldSetLines = true
      this.#hadGrappleLine = false
    }

    const result = this.#player.raycast()
    if (result) {
      if (
        !this.#lastRaycastResult ||
        result.id !== this.#lastRaycastResult.id ||
        !equal(result.block, this.#lastRaycastResult.block)
      ) {
        const plusX = transform({ x: 1, y: 0, z: 0 }, result.transform, false)
        const plusY = transform({ x: 0, y: 1, z: 0 }, result.transform, false)
        const plusZ = transform({ x: 0, y: 0, z: 1 }, result.transform, false)
        const v = transform(result.block, result.transform)
        const vX = add(v, plusX)
        const vXY = add(vX, plusY)
        const vXYZ = add(vXY, plusZ)
        const vXZ = add(vX, plusZ)
        const vY = add(v, plusY)
        const vYZ = add(vY, plusZ)
        const vZ = add(v, plusZ)
        this.#lookAtEdgeLines = [
          { start: v, end: vX },
          { start: vX, end: vXY },
          { start: v, end: vY },
          { start: vY, end: vXY },
          { start: v, end: vZ },
          { start: vX, end: vXZ },
          { start: vXY, end: vXYZ },
          { start: vY, end: vYZ },
          { start: vZ, end: vXZ },
          { start: vXZ, end: vXYZ },
          { start: vZ, end: vYZ },
          { start: vYZ, end: vXYZ }
        ].map(({ start, end }) => ({ start, end, color: [255, 255, 0] }))
        shouldSetLines = true
        this.#lastRaycastResult = result
      }
    } else if (this.#lastRaycastResult !== null) {
      this.#lookAtEdgeLines = []
      shouldSetLines = true
      this.#lastRaycastResult = null
    } else if (grappleLine.length > 0) {
      // Grapple line probably changes every frame
    }
    if (shouldSetLines) {
      this.#context.setLines([...grappleLine, ...this.#lookAtEdgeLines])
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

    submitSample('frame', (performance.now() - start) * 1e6)
  }
}
