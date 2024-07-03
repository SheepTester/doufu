import { mat4 } from 'wgpu-matrix'
import { SIZE } from '../common/world/Chunk'
import './index.css'
import { MeshWorkerMessage } from './mesh/message'
import { Group } from './render/Group'
import { Uniform } from './render/Uniform'
import { handleError } from './debug/error'
import { Context } from './render/Context'

console.log(new Worker('./server/index.js'))

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

const meshWorker = new Worker('./client/mesh/index.js')
meshWorker.addEventListener('message', e => {
  const message: MeshWorkerMessage = e.data
  switch (message.type) {
    case 'mesh': {
      const vertices = renderer.device.createBuffer({
        label: `chunk (${message.position.x}, ${message.position.y}, ${message.position.z}) vertex buffer vertices`,
        size: message.data.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
      })
      renderer.device.queue.writeBuffer(vertices, 0, message.data)
      const chunkGroup = new Group(
        renderer.device,
        renderer.common.pipeline,
        1,
        { transform: new Uniform(renderer.device, 0, 4 * 4 * 4) }
      )
      chunkGroup.uniforms.transform.data(
        mat4.translation<Float32Array>([
          message.position.x * SIZE,
          message.position.y * SIZE,
          message.position.z * SIZE
        ])
      )
      renderer.meshes.push({
        render: pass => {
          pass.setBindGroup(1, chunkGroup.group)
          pass.setVertexBuffer(0, vertices)
          pass.draw(6, vertices.size / 8)
        }
      })
      break
    }
  }
})

let frameId: number | null = null
const paint = () => {
  renderer.render(context.getCurrentTexture(), mat4.identity()).catch(error => {
    if (frameId !== null) {
      cancelAnimationFrame(frameId)
      frameId = null
    }
    return Promise.reject(error)
  })
  frameId = requestAnimationFrame(paint)
}
