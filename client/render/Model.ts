// https://learn.microsoft.com/en-us/minecraft/creator/reference/content/schemasreference/schemas/minecraftschema_geometry_1.12.0
// https://github.com/JannisX11/blockbench/blob/master/js/io/formats/bedrock.js#L592

import { mat4, Mat4 } from 'wgpu-matrix'
import { Vector3 } from '../../common/Vector3'
import { Context, loadTexture, Mesh, Texture } from './Context'
import { Group } from './Group'
import { Uniform } from './Uniform'

/** `number[]` part is to satisfy TypeScript JSON */
export type Vec3 = [x: number, y: number, z: number] | number[]

export type BedrockModel = {
  'minecraft:geometry': {
    description: {
      /**
       * Assumed width in texels of the texture that will be bound to this
       * geometry.
       *
       * Default: 16
       */
      texture_width: number
      /**
       * Assumed height in texels of the texture that will be bound to this
       * geometry.
       *
       * Default: 16
       */
      texture_height: number
      /**
       * Width of the visibility bounding box (in model space units).
       *
       * Default: 0
       */
      visible_bounds_width: number
      /**
       * Height of the visible bounding box (in model space units).
       *
       * Default: 0
       */
      visible_bounds_height: number
      /**
       * Offset of the visibility bounding box from the entity location point
       * (in model space units).
       *
       * Default: [0, 0, 0]. Note: Blockbench only supports the Y component.
       */
      visible_bounds_offset?: Vec3
    }
    /**
     * Bones define the 'skeleton' of the mob: the parts that can be animated,
     * and to which geometry and other bones are attached.
     */
    bones: {
      /**
       * Animation files refer to this bone via this identifier.
       */
      name: string
      /**
       * Bone that this bone is relative to.  If the parent bone moves, this
       * bone will move along with it.
       */
      parent?: string
      /**
       * The bone pivots around this point (in model space units).
       */
      pivot: Vec3
      /**
       * This is the initial rotation of the bone around the pivot,
       * pre-animation (in degrees, x-then-y-then-z order).
       */
      rotation?: Vec3
      /**
       * Mirrors the UV's of the unrotated cubes along the x axis, also causes
       * the east/west faces to get flipped.
       */
      mirror?: boolean
      /**
       * Grow this box by this additive amount in all directions (in model space
       * units).
       */
      inflate?: number
      /**
       * This is the list of cubes associated with this bone.
       */
      cubes?: {
        // Microsoft docs claim that origin, size, and uv are optional, but in
        // practice they seem to always be specified
        /**
         * This point declares the unrotated lower corner of cube (smallest
         * x/y/z value in model space units).
         */
        origin: Vec3
        /**
         * The cube extends this amount relative to its origin (in model space
         * units).
         */
        size: Vec3
        /**
         * The cube is rotated by this amount (in degrees, x-then-y-then-z
         * order) around the pivot.
         */
        rotation?: Vec3
        /**
         * If this field is specified, rotation of this cube occurs around this
         * point, otherwise its rotation is around the center of the box. Note
         * that in 1.12 this is flipped upside-down, but is fixed in 1.14.
         */
        pivot?: Vec3
        /**
         * Grow this box by this additive amount in all directions (in model
         * space units), this field overrides the bone's inflate field for this
         * cube only.
         *
         * Default: 0
         */
        inflate?: number
        /**
         * Mirrors this cube about the unrotated x axis (effectively flipping
         * the east / west faces), overriding the bone's 'mirror' setting for
         * this cube.
         */
        mirror?: boolean
        /**
         * Specifies the upper-left corner on the texture for the start of the
         * texture mapping for this box.
         */
        uv: [u: number, v: number] | number[]
      }[]
    }[]
  }[]
}

export type Cube = {
  group: Group<{}>
  /** Top left of cube texture mapping. In texture units. */
  uv: [u: number, v: number]
  /** Used for texture mapping. In texture units. */
  size: Vector3
}

export type Bone = {
  pivot: Vector3
  cubes: Cube[]
}

export class Model implements Mesh {
  #bones: Bone[]
  #allCubes

  #instanceCount = 0
  #instances: GPUBuffer | null = null

  constructor (
    context: Context,
    { sampler, texture }: Texture,
    textureWidth: number,
    textureHeight: number,
    bones: Bone[]
  ) {
    this.#bones = bones

    this.#allCubes = new Group(
      context.device,
      context.modelCommon.pipeline,
      1,
      {
        textureSize: new Uniform(context.device, 0, 4 * 2),
        sampler: { binding: 1, resource: sampler },
        texture: { binding: 2, resource: texture.createView() }
      }
    )
    this.#allCubes.uniforms.textureSize.data(
      new Float32Array([textureWidth, textureHeight])
    )
  }

  render (pass: GPURenderPassEncoder): void {
    pass.setBindGroup(1, this.#allCubes.group)
    for (const { cubes } of this.#bones) {
      for (const { group } of cubes) {
        pass.setBindGroup(2, group.group)
        pass.draw(6 * 6)
      }
    }
  }

  static async fromBedrockModel (
    context: Context,
    model: BedrockModel,
    texturePath: string
  ): Promise<Model[]> {
    const texture = await loadTexture(context.device, texturePath, false)
    return model['minecraft:geometry'].map(
      ({ description: { texture_width, texture_height }, bones }) =>
        new Model(
          context,
          texture,
          texture_width,
          texture_height,
          bones.map(({ pivot: [x, y, z], cubes = [] }): Bone => {
            return {
              pivot: { x, y, z },
              cubes: cubes.map(
                ({
                  origin,
                  size,
                  rotation = [0, 0, 0],
                  pivot = [0, 0, 0],
                  uv: [u, v]
                }): Cube => {
                  const transform = mat4.identity()
                  mat4.scale(transform, [1 / 16, 1 / 16, 1 / 16], transform)
                  mat4.translate(transform, pivot, transform)
                  mat4.rotateZ(
                    transform,
                    rotation[2] * (Math.PI / 180),
                    transform
                  )
                  mat4.rotateY(
                    transform,
                    rotation[1] * (Math.PI / 180),
                    transform
                  )
                  mat4.rotateX(
                    transform,
                    rotation[0] * (Math.PI / 180),
                    transform
                  )
                  mat4.translate(
                    transform,
                    [-pivot[0], -pivot[1], -pivot[2]],
                    transform
                  )
                  mat4.translate(transform, origin, transform)
                  mat4.scale(transform, size, transform)
                  const group = new Group(
                    context.device,
                    context.modelCommon.pipeline,
                    2,
                    {
                      cubeTransform: new Uniform(context.device, 0, 4 * 4 * 4),
                      uv: new Uniform(context.device, 1, 4 * 2),
                      cubeSize: new Uniform(context.device, 2, 4 * 3)
                    }
                  )
                  group.uniforms.cubeTransform.data(transform)
                  group.uniforms.uv.data(new Float32Array([u, v]))
                  group.uniforms.cubeSize.data(new Float32Array(size))
                  return {
                    group,
                    uv: [u, v],
                    size: { x: size[0], y: size[1], z: size[2] }
                  }
                }
              )
            }
          })
        )
    )
  }
}
