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
  getVoxel: (x: number, y: number, z: number) => T,
  p: Vector3,
  d: Vector3,
  maxDistance = 64
): Generator<RaycastResult> {
  let t = 0
  let ix = Math.floor(p.x)
  let iy = Math.floor(p.y)
  let iz = Math.floor(p.z)
  const stepx = Math.sign(d.x)
  const stepy = Math.sign(d.y)
  const stepz = Math.sign(d.z)
  // d is already normalized
  const txDelta = Math.abs(1 / d.x)
  const tyDelta = Math.abs(1 / d.y)
  const tzDelta = Math.abs(1 / d.z)
  // location of nearest voxel boundary, in units of t
  let txMax =
    txDelta < Infinity
      ? txDelta * (stepx > 0 ? ix + 1 - p.x : p.x - ix)
      : Infinity
  let tyMax =
    tyDelta < Infinity
      ? tyDelta * (stepy > 0 ? iy + 1 - p.y : p.y - iy)
      : Infinity
  let tzMax =
    tzDelta < Infinity
      ? tzDelta * (stepz > 0 ? iz + 1 - p.z : p.z - iz)
      : Infinity
  let steppedIndex: 'x' | 'y' | 'z' | null = null

  // main loop along raycast vector
  while (t <= maxDistance) {
    // exit check
    const b = getVoxel(ix, iy, iz)
    if (b) {
      yield {
        block: { x: ix, y: iy, z: iz },
        position: { x: p.x + t * d.x, y: p.y + t * d.y, z: p.z + t * d.z },
        normal: {
          x: steppedIndex === 'x' ? -stepx : 0,
          y: steppedIndex === 'y' ? -stepy : 0,
          z: steppedIndex === 'z' ? -stepz : 0
        }
      }
    }

    // advance t to next nearest voxel boundary
    switch (Math.min(txMax, tyMax, tzMax)) {
      case txMax:
        ix += stepx
        t = txMax
        txMax += txDelta
        steppedIndex = 'x'
        break
      case tyMax:
        iy += stepy
        t = tyMax
        tyMax += tyDelta
        steppedIndex = 'y'
        break
      case tzMax:
        iz += stepz
        t = tzMax
        tzMax += tzDelta
        steppedIndex = 'z'
        break
      default:
        throw new Error('The minimum is none of these. ??')
    }
  }
}
