export class Uniform {
  #device: GPUDevice
  #buffer: GPUBuffer

  constructor (device: GPUDevice, size: number) {
    this.#device = device
    this.#buffer = device.createBuffer({
      size,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    })
  }

  entry (index: number): GPUBindGroupEntry {
    return { binding: index, resource: { buffer: this.#buffer } }
  }

  data (data: ArrayBufferView, offset = 0): void {
    this.#device.queue.writeBuffer(this.#buffer, offset, data.buffer)
  }

  destroy (): void {
    this.#buffer.destroy()
  }
}
