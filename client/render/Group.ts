import { Uniform } from './Uniform'

/**
 * Bind groups have shared resources across all invocations of the shaders (eg
 * uniforms, textures, but not attributes).
 */
export class Group<
  U extends Record<string, Uniform | Omit<GPUBindGroupEntry, 'binding'>>
> {
  group: GPUBindGroup
  pipeline: GPURenderPipeline
  uniforms: U

  /**
   * @param uniforms The order of the object properties matters! They're used to
   * determine the binding location of the uniform.
   */
  constructor (
    device: GPUDevice,
    pipeline: GPURenderPipeline,
    groupId: number,
    uniforms: U
  ) {
    this.group = device.createBindGroup({
      label: `${pipeline.label}: @group(${groupId})`,
      layout: pipeline.getBindGroupLayout(groupId),
      entries: Object.values(uniforms).map((entry, i) =>
        entry instanceof Uniform ? entry.entry(i) : { ...entry, binding: i }
      )
    })
    this.pipeline = pipeline
    this.uniforms = uniforms
  }

  /** Destroys all the `Uniform` buffers in the group. */
  destroy (): void {
    for (const entry of Object.values(this.uniforms)) {
      if (entry instanceof Uniform) {
        entry.destroy()
      }
    }
  }
}
