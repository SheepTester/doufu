import { Vector3 } from '../../common/Vector3'

export type RaycastResult = {
  block: Vector3
  position: Vector3
  /** May be [0, 0, 0] if the starting position is inside a block */
  normal: Vector3
}

/**
 * @param d Should be normalized.
 * @param maxDistance Defaults to 64.
 * @link https://github.com/fenomas/fast-voxel-raycast/blob/master/index.js
 */
export function * raycast<T> (
  getVoxel: (v: Vector3) => T,
  p: Vector3,
  d: Vector3,
  maxDistance = 64
): Generator<RaycastResult> {
  let t = 0
  const i = {
    x: Math.floor(p.x),
    y: Math.floor(p.y),
    z: Math.floor(p.z)
  }
  const step = {
    x: Math.sign(d.x),
    y: Math.sign(d.y),
    z: Math.sign(d.z)
  }
  // d is already normalized
  const tDelta = {
    x: Math.abs(1 / d.x),
    y: Math.abs(1 / d.y),
    z: Math.abs(1 / d.z)
  }
  // location of nearest voxel boundary, in units of t
  const tMax = {
    x:
      tDelta.x < Infinity
        ? tDelta.x * (step.x > 0 ? i.x + 1 - p.x : p.x - i.x)
        : Infinity,
    y:
      tDelta.y < Infinity
        ? tDelta.y * (step.y > 0 ? i.y + 1 - p.y : p.y - i.y)
        : Infinity,
    z:
      tDelta.z < Infinity
        ? tDelta.z * (step.z > 0 ? i.z + 1 - p.z : p.z - i.z)
        : Infinity
  }
  let steppedIndex: 'x' | 'y' | 'z' | null = null

  // main loop along raycast vector
  while (t <= maxDistance) {
    // exit check
    const b = getVoxel(i)
    if (b) {
      yield {
        block: i,
        position: { x: p.x + t * d.x, y: p.y + t * d.y, z: p.z + t * d.z },
        normal: {
          x: steppedIndex === 'x' ? -step.x : 0,
          y: steppedIndex === 'y' ? -step.y : 0,
          z: steppedIndex === 'z' ? -step.z : 0
        }
      }
    }

    // advance t to next nearest voxel boundary
    switch (Math.min(tMax.x, tMax.y, tMax.z)) {
      case tMax.x:
        i.x += step.x
        t = tMax.x
        tMax.x += tDelta.x
        steppedIndex = 'x'
        break
      case tMax.y:
        i.y += step.y
        t = tMax.y
        tMax.y += tDelta.y
        steppedIndex = 'y'
        break
      case tMax.z:
        i.z += step.z
        t = tMax.z
        tMax.z += tDelta.z
        steppedIndex = 'z'
        break
      default:
        throw new Error('The minimum is none of these. ??')
    }
  }
}
