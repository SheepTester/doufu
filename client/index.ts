import { mat4 } from 'wgpu-matrix'
import { SIZE } from '../common/world/Chunk'
import './index.css'
import { MeshWorkerMessage, MeshWorkerRequest } from './mesh/message'
import { Group } from './render/Group'
import { Uniform } from './render/Uniform'
import { handleError } from './debug/error'
import { Context } from './render/Context'
import { Camera } from './control/Camera'
import { Connection } from './net/Connection'
import { ClientMessage, ServerMessage } from '../common/message'
import { toKey, Vector3, Vector3Key } from '../common/Vector3'
import { World } from '../common/world/World'
import { ClientChunk } from './render/ClientChunk'

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
new ResizeObserver(([{ contentBoxSize }]) => {
  const [{ blockSize, inlineSize }] = contentBoxSize
  canvas.width = inlineSize
  canvas.height = blockSize
  renderer.resize(inlineSize, blockSize)
  if (frameId === null) {
    paint()
  }
}).observe(canvas)

const camera = new Camera()
camera.attach(canvas)

const server = new Connection<ServerMessage, ClientMessage>(message => {
  switch (message.type) {
    case 'pong': {
      server.send({ type: 'ping' })
      break
    }
    case 'chunk-data': {
      meshWorker.send(
        { type: 'chunk-data', chunks: message.chunks },
        message.chunks.map(chunk => chunk.data.buffer)
      )
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

const meshWorker = new Connection<MeshWorkerMessage, MeshWorkerRequest>(
  message => {
    switch (message.type) {
      case 'mesh': {
        const chunk = world.lookup(message.position)
        // If the chunk doesn't exist anymore, the chunk has been unloaded so we
        // can discard the face data
        if (chunk) {
          chunk.handleFaces(message.data)
          renderer.meshes = world.chunks()
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

/** In m/s^2. */
const MOVE_ACCEL = 50
/** In 1/s. F = kv. */
const FRICTION_COEFF = -5
/** In m. */
const player = {
  x: 0,
  xv: 0,
  y: SIZE + 1.5,
  yv: 0,
  z: 16,
  zv: 0
}

function moveAxis<Axis extends 'x' | 'y' | 'z'> (
  axis: Axis,
  acceleration: number,
  time: number,
  userMoving: boolean
): void {
  let endVel = player[`${axis}v`] + acceleration * time
  if (!userMoving && Math.sign(player[`${axis}v`]) !== Math.sign(endVel)) {
    // Friction has set velocity to 0
    endVel = 0
  }
  // displacement = average speed * time
  const avgSpeed = (player[`${axis}v`] + endVel) / 2
  let displacement = avgSpeed * time
  player[axis] += displacement
  player[`${axis}v`] = endVel
}

let lastTime = Date.now()
let frameId: number | null = null
const paint = () => {
  const now = Date.now()
  const elapsed = Math.min(now - lastTime, 100) / 1000
  lastTime = now

  // Move against direction of velocity
  const velocity = { x: player.xv, z: player.zv }
  const acceleration = {
    x: velocity.x * FRICTION_COEFF,
    z: velocity.z * FRICTION_COEFF
  }

  const direction = { x: 0, z: 0 }
  if (keys.a || keys.arrowleft) {
    direction.x -= 1
  }
  if (keys.d || keys.arrowright) {
    direction.x += 1
  }
  if (keys.w || keys.arrowup) {
    direction.z -= 1
  }
  if (keys.s || keys.arrowdown) {
    direction.z += 1
  }
  const moving = direction.x !== 0 || direction.z !== 0
  if (moving) {
    const factor = MOVE_ACCEL / Math.hypot(direction.x, direction.z)
    // TODO: idk why yaw needs to be inverted
    acceleration.x +=
      factor *
      (Math.cos(-camera.yaw) * direction.x -
        Math.sin(-camera.yaw) * direction.z)
    acceleration.z +=
      factor *
      (Math.sin(-camera.yaw) * direction.x +
        Math.cos(-camera.yaw) * direction.z)
  }
  let yAccel = player.yv
  yAccel *= FRICTION_COEFF
  if (keys[' ']) {
    yAccel += MOVE_ACCEL
  }
  if (keys.shift) {
    yAccel -= MOVE_ACCEL
  }

  moveAxis('x', acceleration.x, elapsed, moving)
  moveAxis('z', acceleration.z, elapsed, moving)
  moveAxis('y', yAccel, elapsed, keys[' '] || keys.shift)

  ensureSubscribed(
    Array.from({ length: 3 }, (_, i) =>
      Array.from({ length: 3 }, (_, j) =>
        Array.from({ length: 3 }, (_, k) => ({
          x: Math.floor(player.x / SIZE) + i - 1,
          y: Math.floor(player.y / SIZE) + j - 1,
          z: Math.floor(player.z / SIZE) + k - 1
        }))
      )
    ).flat(3)
  )

  renderer
    .render(
      context.getCurrentTexture(),
      mat4.inverse(
        camera.transform(
          mat4.translation<Float32Array>([player.x, player.y, player.z])
        )
      )
    )
    .catch(error => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId)
        frameId = null
      }
      return Promise.reject(error)
    })
  frameId = requestAnimationFrame(paint)
}
