export class Uniform {
  #device: GPUDevice
  #buffer: GPUBuffer
  #binding: number

  constructor (device: GPUDevice, binding: number, size: number) {
    this.#device = device
    this.#buffer = device.createBuffer({
      label: `uniform @binding(${binding})`,
      size,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    })
    this.#binding = binding
  }

  get entry (): GPUBindGroupEntry {
    return { binding: this.#binding, resource: { buffer: this.#buffer } }
  }

  data (data: BufferSource | SharedArrayBuffer, offset = 0): void {
    this.#device.queue.writeBuffer(this.#buffer, offset, data)
  }

  destroy (): void {
    this.#buffer.destroy()
  }
}
