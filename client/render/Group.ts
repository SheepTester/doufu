import { Uniform } from './Uniform'

/**
 * Bind groups have shared resources across all invocations of the shaders (eg
 * uniforms, textures, but not attributes).
 */
export class Group<U extends Record<string, Uniform | GPUBindGroupEntry>> {
  group: GPUBindGroup
  pipeline: GPURenderPipeline
  uniforms: U

  constructor (
    device: GPUDevice,
    pipeline: GPURenderPipeline,
    groupId: number,
    uniforms: U
  ) {
    this.group = device.createBindGroup({
      label: `${pipeline.label}: @group(${groupId})`,
      layout: pipeline.getBindGroupLayout(groupId),
      entries: Object.values(uniforms).map(entry =>
        entry instanceof Uniform ? entry.entry : entry
      )
    })
    this.pipeline = pipeline
    this.uniforms = uniforms
  }
}
