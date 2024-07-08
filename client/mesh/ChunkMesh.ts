import { Vector3 } from '../../common/Vector3'
import { getTexture, isOpaque } from '../../common/world/Block'
import { Chunk, neighborIndex, SIZE } from '../../common/world/Chunk'

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

const cacheBounds = [
  { min: 0, max: 1 },
  { min: 1, max: SIZE - 1 },
  { min: SIZE - 1, max: SIZE }
]

export class ChunkMesh extends Chunk {
  cache: {
    faces: number[]
    dirty: boolean
  }[] = Array.from({ length: 27 }, () => ({ faces: [], dirty: true }))

  markAllDirty () {
    for (const entry of this.cache) {
      entry.faces = []
      entry.dirty = true
    }
  }

  generateMesh (): Uint8Array {
    for (const [i, entry] of this.cache.entries()) {
      if (!entry.dirty) {
        continue
      }
      entry.faces = []
      const xBounds = cacheBounds[Math.floor(i / 9) % 3]
      const yBounds = cacheBounds[Math.floor(i / 3) % 3]
      const zBounds = cacheBounds[i % 3]
      const getNeighbor =
        i === neighborIndex(0, 0, 0) ? this.get : this.getWithNeighbor
      for (let x = xBounds.min; x < xBounds.max; x++) {
        for (let y = yBounds.min; y < yBounds.max; y++) {
          for (let z = zBounds.min; z < zBounds.max; z++) {
            const block = this.get({ x, y, z })
            const texture = getTexture(block)
            if (block === null || texture === null) {
              continue
            }
            for (const { face, normal } of directions) {
              const neighbor = getNeighbor({
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
                        getNeighbor({
                          x: x + (normal.x || (corner.x ? 1 : -1)),
                          y: y + (normal.y || (corner.y ? 1 : -1)),
                          z: z + (normal.z || (corner.z ? 1 : -1))
                        })
                      ) +
                      (normal.x === 0
                        ? +isOpaque(
                            getNeighbor({
                              x: x + (normal.x || (corner.x ? 1 : -1)),
                              y: y + normal.y,
                              z: z + normal.z
                            })
                          )
                        : 0) +
                      (normal.y === 0
                        ? +isOpaque(
                            getNeighbor({
                              x: x + normal.x,
                              y: y + (normal.y || (corner.y ? 1 : -1)),
                              z: z + normal.z
                            })
                          )
                        : 0) +
                      (normal.z === 0
                        ? +isOpaque(
                            getNeighbor({
                              x: x + normal.x,
                              y: y + normal.y,
                              z: z + (normal.z || (corner.z ? 1 : -1))
                            })
                          )
                        : 0)
                    ao |= opaques << (i * 2)
                  }
                }
                entry.faces.push(x, y, z, face, texture, ao, 0, 0)
              }
            }
          }
        }
      }
      entry.dirty = false
    }
    return new Uint8Array(this.cache.flatMap(({ faces }) => faces))
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

/**
 * Maps chunk neighbor index to the corresponding cache indices of the neighbor
 * that would need to be marked dirty if the chunk changed.
 */
export const neighborAffectedParts: number[][] = Array.from(
  { length: 27 },
  () => []
)
for (const x of [-1, 0, 1]) {
  for (const y of [-1, 0, 1]) {
    for (const z of [-1, 0, 1]) {
      const i = neighborIndex(x, y, z)
      switch (Math.abs(x) + Math.abs(y) + Math.abs(z)) {
        // Middle
        case 0: {
          continue
        }
        // Face
        case 1: {
          for (const a of [-1, 0, -1]) {
            for (const b of [-1, 0, -1]) {
              if (x) {
                neighborAffectedParts[i].push(neighborIndex(-x, a, b))
              } else if (y) {
                neighborAffectedParts[i].push(neighborIndex(a, -y, b))
              } else {
                neighborAffectedParts[i].push(neighborIndex(a, b, -z))
              }
            }
          }
        }
        // Edge
        case 2: {
          for (const a of [-1, 0, -1]) {
            neighborAffectedParts[i].push(
              neighborIndex(-x || a, -y || a, -z || a)
            )
          }
        }
        // Vertex
        case 3: {
          neighborAffectedParts[i].push(neighborIndex(-x, -y, -z))
          break
        }
      }
    }
  }
}
