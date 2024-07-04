import { mat4 } from 'wgpu-matrix'
import { SIZE } from '../common/world/Chunk'
import './index.css'
import { MeshWorkerMessage, MeshWorkerRequest } from './mesh/message'
import { handleError } from './debug/error'
import { Context } from './render/Context'
import { Camera } from './control/Camera'
import { Connection } from './net/Connection'
import { ClientMessage, ServerMessage } from '../common/message'
import { Vector3 } from '../common/Vector3'
import { World } from '../common/world/World'
import { ClientChunk } from './render/ClientChunk'
import { Player } from './control/Player'
import { isSolid } from '../common/world/Block'

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
const renderer = await Context.create(format)
renderer.device.addEventListener('uncapturederror', e => {
  if (e instanceof GPUUncapturedErrorEvent) {
    handleError(e.error)
  }
})
context.configure({ device: renderer.device, format })
new ResizeObserver(([{ devicePixelContentBoxSize }]) => {
  const [{ blockSize, inlineSize }] = devicePixelContentBoxSize
  canvas.width = inlineSize
  canvas.height = blockSize
  renderer.resize(inlineSize, blockSize, window.devicePixelRatio)
  if (frameId === null) {
    paint()
  }
}).observe(canvas)

const server = new Connection<ServerMessage, ClientMessage>(message => {
  switch (message.type) {
    case 'pong': {
      server.send({ type: 'ping' })
      break
    }
    case 'chunk-data': {
      meshWorker.send({ type: 'chunk-data', chunks: message.chunks })
      for (const { position, data } of message.chunks) {
        const chunk = world.lookup(position)
        if (chunk) {
          chunk.data = data
        }
      }
      break
    }
    default: {
      console.error('Unknown server message type', message)
    }
  }
})
server.connectWorker('./server/worker.js')

const world = new World<ClientChunk>({
  createChunk: position => new ClientChunk(renderer, position)
})

/**
 * Subscribes to chunks at the given positions. If a chunk is already
 * subscribed, it does nothing.
 */
function ensureSubscribed (positions: Vector3[]) {
  const toSubscribe: Vector3[] = []
  for (const position of positions) {
    if (!world.lookup(position)) {
      world.register(new ClientChunk(renderer, position))
      toSubscribe.push(position)
    }
  }
  if (toSubscribe.length > 0) {
    server.send({ type: 'subscribe-chunks', chunks: toSubscribe })
  }
}

const player = new Player(world, {
  x: 0,
  y: SIZE + 1.5,
  z: 0,

  moveAccel: 50,
  gravity: -30,
  jumpVel: 10,
  frictionCoeff: -5,
  collisionRadius: 0.3,
  head: 0.2,
  feet: 1.4,
  wiggleRoom: 0.01,
  collisions: true,

  flying: false
})
player.listen(canvas)

const meshWorker = new Connection<MeshWorkerMessage, MeshWorkerRequest>(
  message => {
    switch (message.type) {
      case 'mesh': {
        const chunk = world.lookup(message.position)
        // If the chunk doesn't exist anymore, the chunk has been unloaded so we
        // can discard the face data
        if (chunk) {
          chunk.handleFaces(message.data)
          renderer.voxelMeshes = world.chunks()
        }
        break
      }
      default: {
        console.error('Unknown mesh builder response type', message)
      }
    }
  }
)
meshWorker.connectWorker('./client/mesh/index.js')

let keys: Record<string, boolean> = {}
document.addEventListener('keydown', e => {
  if (e.target !== document && e.target !== document.body) {
    return
  }
  keys[e.key.toLowerCase()] = true
  if (document.pointerLockElement === canvas) {
    e.preventDefault()
  }
})
document.addEventListener('keyup', e => {
  keys[e.key.toLowerCase()] = false
})
// Prevent sticky keys when doing ctrl+shift+tab
window.addEventListener('blur', () => {
  keys = {}
})

const RANGE = 3

let lastTime = Date.now()
let frameId: number | null = null
const paint = () => {
  const now = Date.now()
  const elapsed = Math.min(now - lastTime, 100) / 1000
  lastTime = now

  player.move(elapsed)

  ensureSubscribed(
    Array.from({ length: RANGE * 2 + 1 }, (_, i) =>
      Array.from({ length: RANGE * 2 + 1 }, (_, j) =>
        Array.from({ length: RANGE * 2 + 1 }, (_, k) => ({
          x: Math.floor(player.x / SIZE) + i - RANGE,
          y: Math.floor(player.y / SIZE) + j - RANGE,
          z: Math.floor(player.z / SIZE) + k - RANGE
        }))
      )
    )
      .flat(3)
      // Prioritize loading closest chunks first
      .sort(
        (a, b) =>
          Math.hypot(
            a.x - player.x / SIZE,
            a.y - player.y / SIZE,
            a.z - player.z / SIZE
          ) -
          Math.hypot(
            b.x - player.x / SIZE,
            b.y - player.y / SIZE,
            b.z - player.z / SIZE
          )
      )
  )

  renderer
    .render(context.getCurrentTexture(), mat4.inverse(player.getTransform()))
    .catch(error => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId)
        frameId = null
      }
      return Promise.reject(error)
    })
  frameId = requestAnimationFrame(paint)
}
