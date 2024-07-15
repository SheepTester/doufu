import {
  add,
  map,
  map3,
  MIDDLE,
  neighborIndex,
  neighbors,
  scale,
  sumComponents,
  Vector3
} from '../../common/Vector3'
import {
  Block,
  getTexture,
  isOpaque,
  showAdjacentFaces
} from '../../common/world/Block'
import { Chunk, LoneId, SIZE } from '../../common/world/Chunk'
import { directions } from '../../common/world/Face'

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

  /**
   * Whether the chunk will be rendered like an entity and should be treated as
   * if surrounded by air (i.e. its outer faces are visible, even without
   * neighbors)
   */
  #lone: boolean

  #isEntirelyAir = false
  #isEntirelyOpaque = false

  constructor (position: Vector3 | LoneId, data?: Uint8Array) {
    super(position, data)
    this.#lone = 'id' in position
  }

  /**
   * Recomputes whether the chunk is entirely air or entirely opaque. This way
   * it doesn't need to be recomputed when the chunk gets remeshed due to a
   * neighbor updating.
   */
  handleDataUpdate () {
    this.#isEntirelyAir = this.data.every(block => block === Block.AIR)
    this.#isEntirelyOpaque = this.data.every(block => isOpaque(block))
  }

  markAllDirty () {
    for (const entry of this.cache) {
      entry.faces = []
      entry.dirty = true
    }
  }

  /**
   * Assumes that at least one part of the chunk is dirty, i.e. a block has
   * changed.
   */
  generateMesh (): Uint8Array {
    // Skip if chunk is entirely air
    if (this.#isEntirelyAir) {
      return new Uint8Array()
    }
    for (const [i, entry] of this.cache.entries()) {
      if (!entry.dirty) {
        continue
      }
      entry.faces = []
      // Skip the middle part if the chunk is entirely opaque.
      if (i === MIDDLE && this.#isEntirelyOpaque) {
        continue
      }
      const xBounds = cacheBounds[Math.floor(i / 9) % 3]
      const yBounds = cacheBounds[Math.floor(i / 3) % 3]
      const zBounds = cacheBounds[i % 3]
      const getNeighbor =
        i === MIDDLE
          ? this.get
          : this.#lone
          ? this.getChecked
          : this.getWithNeighbor
      for (let x = xBounds.min; x < xBounds.max; x++) {
        for (let y = yBounds.min; y < yBounds.max; y++) {
          for (let z = zBounds.min; z < zBounds.max; z++) {
            const position = { x, y, z }
            const block = this.get(position)
            if (block === null || block === Block.AIR) {
              continue
            }
            for (const { face, normal } of directions) {
              const texture = getTexture(block, face)
              if (texture === null) {
                continue
              }
              const neighbor = getNeighbor(add(position, normal))
              if (
                neighbor !== null &&
                !isOpaque(neighbor) &&
                (block !== neighbor || showAdjacentFaces(block))
              ) {
                let ao = 0
                // Only apply AO on opaque blocks
                if (isOpaque(block)) {
                  // For each corner (yeah the indices are confusing)
                  for (const [i, index] of [0, 1, 4, 3].entries()) {
                    const corner = getFaceVertex(face, index)
                    const opaques =
                      +isOpaque(
                        getNeighbor(
                          map3(
                            position,
                            normal,
                            corner,
                            (p, n, c) => p + (n || (c ? 1 : -1))
                          )
                        )
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
for (const neighbor of neighbors) {
  const i = neighborIndex(neighbor)
  switch (sumComponents(map(neighbor, Math.abs))) {
    // Middle
    case 0: {
      continue
    }
    // Face
    case 1: {
      for (const a of [-1, 0, -1]) {
        for (const b of [-1, 0, -1]) {
          if (neighbor.x) {
            neighborAffectedParts[i].push(
              neighborIndex({ x: -neighbor.x, y: a, z: b })
            )
          } else if (neighbor.y) {
            neighborAffectedParts[i].push(
              neighborIndex({ x: a, y: -neighbor.y, z: b })
            )
          } else {
            neighborAffectedParts[i].push(
              neighborIndex({ x: a, y: b, z: -neighbor.z })
            )
          }
        }
      }
    }
    // Edge
    case 2: {
      for (const a of [-1, 0, -1]) {
        neighborAffectedParts[i].push(
          neighborIndex(map(neighbor, n => -n || a))
        )
      }
    }
    // Vertex
    case 3: {
      neighborAffectedParts[i].push(neighborIndex(scale(neighbor, -1)))
      break
    }
  }
}
