import { Mat4, mat4 } from 'wgpu-matrix'
import { SIZE } from '../common/world/Chunk'
import './index.css'
import { handleError } from './debug/error'
import { Context } from './render/Context'
import { Connection } from './net/Connection'
import {
  ClientMessage,
  decodeServer,
  encode,
  ServerMessage
} from '../common/message'
import { Vector3 } from '../common/Vector3'
import { ClientChunk } from './render/ClientChunk'
import { Player } from './control/Player'
import { ClientWorld } from './render/ClientWorld'

declare const USE_WS: string | boolean

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

const entities: Record<number, Mat4> = {}
const server = new Connection<ServerMessage, ClientMessage>({
  onMessage: message => {
    switch (message.type) {
      case 'pong': {
        server.send({ type: 'ping' })
        break
      }
      case 'chunk-data': {
        world.setChunks(message.chunks)
        break
      }
      case 'block-update': {
        world.setBlocks(message.blocks, false)
        break
      }
      case 'entity-update': {
        for (const {
          id,
          position: { x, y, z },
          rotationY
        } of message.entities) {
          entities[id] = mat4.rotateY(mat4.translation([x, y, z]), rotationY)
        }
        for (const model of renderer.models) {
          model.setInstances(Object.values(entities))
        }
        break
      }
      default: {
        console.error('Unknown server message type', message)
      }
    }
  },
  encode,
  decode: decodeServer
})
if (USE_WS) {
  server.connect(
    typeof USE_WS === 'string'
      ? USE_WS
      : window.location.origin.replace('http', 'ws') + '/ws'
  )
} else {
  server.connectWorker('./server/worker.js')
}

const world = new ClientWorld(renderer, server)

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

const RANGE = 3
const player = new Player(world, {
  x: 0,
  y: SIZE + 1.5,
  z: 0,

  moveAccel: 50,
  gravity: -30,
  jumpVel: 10,
  frictionCoeff: -5,
  collisionRadius: 0.3,
  height: 1.6,
  eyeHeight: 1.4,
  wiggleRoom: 0.01,
  reach: (RANGE + 1) * Math.SQRT2 * SIZE,

  collisions: true,
  flying: false
})
player.listen(canvas)

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

let lastTime = Date.now()
let frameId: number | null = null
const paint = () => {
  const now = Date.now()
  const elapsed = Math.min(now - lastTime, 100) / 1000
  lastTime = now

  player.interact()
  player.doMovement(elapsed)
  server.send({
    type: 'move',
    position: { x: player.x, y: player.y, z: player.z },
    rotationY: player.camera.yaw
  })

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

  const result = player.raycast()
  if (result) {
    renderer.voxelOutlineEnabled = true
    renderer.outlineCommon.uniforms.transform.data(
      new Float32Array(
        mat4.translation([result.block.x, result.block.y, result.block.z])
      )
    )
  } else {
    renderer.voxelOutlineEnabled = false
  }

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

import pancakeGeo from './asset/pancake.geo.json'
import pancakeTexture from './asset/pancake.png'
import { Model } from './render/Model'
renderer.models = await Model.fromBedrockModel(
  renderer,
  pancakeGeo,
  pancakeTexture
)
for (const model of renderer.models) {
  model.setInstances([mat4.translation([1, 32, 1])])
}
