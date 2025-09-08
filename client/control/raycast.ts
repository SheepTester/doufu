import {
  axes,
  Axis,
  map,
  map2,
  map4,
  reduce,
  Vector3
} from '../../common/Vector3'

export type RaycastResult = {
  /** Block position in realm coordinates */
  block: Vector3
  /** Intersection point on block face in realm coordinates */
  position: Vector3
  /**
   * Corresponds to the face of the block that the ray hit. May be [0, 0, 0] if
   * the starting position is inside a block.
   */
  normal: Vector3
}

/**
 * @param p Starting point in realm coordinates (e.g. global coordinates for
 * normal chunks, local coordinates for floating chunks).
 * @param d Direction unit vector.
 * @param maxDistance Defaults to 64.
 * @link https://github.com/fenomas/fast-voxel-raycast/blob/master/index.js
 */
export function * raycast (
  getVoxel: (v: Vector3) => boolean,
  p: Vector3,
  d: Vector3,
  maxDistance = 64
): Generator<RaycastResult> {
  let t = 0
  const i = map(p, Math.floor)
  const step = map(d, Math.sign)
  // d is already normalized
  const tDelta = map(d, d => Math.abs(1 / d))
  // location of nearest voxel boundary, in units of t
  const tMax = map4(tDelta, step, i, p, (tDelta, step, i, p) =>
    tDelta < Infinity ? tDelta * (step > 0 ? i + 1 - p : p - i) : Infinity
  )
  let steppedIndex: Axis | null = null

  // main loop along raycast vector
  while (t <= maxDistance) {
    // exit check
    const b = getVoxel(i)
    if (b) {
      yield {
        block: i,
        position: map2(p, d, (p, d) => p + t * d),
        normal: map(step, (step, axis) => (steppedIndex === axis ? -step : 0))
      }
    }

    // advance t to next nearest voxel boundary
    const min = reduce(tMax, Math.min)
    for (const axis of axes) {
      if (tMax[axis] === min) {
        i[axis] += step[axis]
        t = tMax[axis]
        tMax[axis] += tDelta[axis]
        steppedIndex = axis
        break
      }
    }
  }
}
