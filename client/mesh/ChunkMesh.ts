import { Vector3 } from '../../common/Vector3'
import { Block, getTexture, isOpaque } from '../../common/world/Block'
import { Chunk, SIZE } from '../../common/world/Chunk'

const enum FaceDirection {
  BACK = 0,
  FRONT = 1,
  LEFT = 2,
  RIGHT = 3,
  BOTTOM = 4,
  TOP = 5
}

const directions = [
  { face: FaceDirection.BACK, normal: { x: 0, y: 0, z: -1 } },
  { face: FaceDirection.FRONT, normal: { x: 0, y: 0, z: 1 } },
  { face: FaceDirection.LEFT, normal: { x: -1, y: 0, z: 0 } },
  { face: FaceDirection.RIGHT, normal: { x: 1, y: 0, z: 0 } },
  { face: FaceDirection.BOTTOM, normal: { x: 0, y: -1, z: 0 } },
  { face: FaceDirection.TOP, normal: { x: 0, y: 1, z: 0 } }
]

export class ChunkMesh extends Chunk {
  generateMesh (): Uint8Array {
    const faces: number[] = []
    for (let x = 0; x < SIZE; x++) {
      for (let y = 0; y < SIZE; y++) {
        for (let z = 0; z < SIZE; z++) {
          const block = this.get({ x, y, z })
          const texture = getTexture(block)
          if (block === null || texture === null) {
            continue
          }
          for (const { face, normal } of directions) {
            const neighbor = this.getWithNeighbor({
              x: x + normal.x,
              y: y + normal.y,
              z: z + normal.z
            })
            if (
              neighbor !== null &&
              !isOpaque(neighbor) &&
              block !== neighbor
            ) {
              let ao = 0
              // Only apply AO on opaque blocks
              if (isOpaque(block)) {
                // For each corner (yeah the indices are confusing)
                for (const [i, index] of [0, 1, 4, 3].entries()) {
                  const corner = getFaceVertex(face, index)
                  const opaques =
                    +isOpaque(
                      this.getWithNeighbor({
                        x: x + (normal.x || (corner.x ? 1 : -1)),
                        y: y + (normal.y || (corner.y ? 1 : -1)),
                        z: z + (normal.z || (corner.z ? 1 : -1))
                      })
                    ) +
                    (normal.x === 0
                      ? +isOpaque(
                          this.getWithNeighbor({
                            x: x + (normal.x || (corner.x ? 1 : -1)),
                            y: y + normal.y,
                            z: z + normal.z
                          })
                        )
                      : 0) +
                    (normal.y === 0
                      ? +isOpaque(
                          this.getWithNeighbor({
                            x: x + normal.x,
                            y: y + (normal.y || (corner.y ? 1 : -1)),
                            z: z + normal.z
                          })
                        )
                      : 0) +
                    (normal.z === 0
                      ? +isOpaque(
                          this.getWithNeighbor({
                            x: x + normal.x,
                            y: y + normal.y,
                            z: z + (normal.z || (corner.z ? 1 : -1))
                          })
                        )
                      : 0)
                  ao |= opaques << (i * 2)
                }
              }
              faces.push(x, y, z, face, texture, ao, 0, 0)
            }
          }
        }
      }
    }
    return new Uint8Array(faces)
  }
}

const squareVertices: { x: number; y: number }[] = [
  { x: 0.0, y: 0.0 },
  { x: 0.0, y: 1.0 },
  { x: 1.0, y: 1.0 },
  { x: 1.0, y: 1.0 },
  { x: 1.0, y: 0.0 },
  { x: 0.0, y: 0.0 }
]
function getFaceVertex (face: number, index: number): Vector3 {
  const squareVertex = squareVertices[index]
  const flipped =
    face & 1 // Rotate ("flip") around center of cube
      ? { x: 1.0 - squareVertex.x, y: squareVertex.y, z: 1.0 }
      : { x: squareVertex.x, y: squareVertex.y, z: 0.0 }
  const rotated =
    face & 4 // 10x: bottom/top
      ? { x: flipped.x, y: flipped.z, z: 1.0 - flipped.y }
      : face & 2 // 01x: left/right
      ? { x: flipped.z, y: flipped.y, z: 1.0 - flipped.x } // 00x: back/front
      : flipped
  return rotated
}
