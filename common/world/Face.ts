export const enum Face {
  BACK = 0,
  FRONT = 1,
  LEFT = 2,
  RIGHT = 3,
  BOTTOM = 4,
  TOP = 5
}

export const directions = [
  { face: Face.BACK, normal: { x: 0, y: 0, z: -1 } },
  { face: Face.FRONT, normal: { x: 0, y: 0, z: 1 } },
  { face: Face.LEFT, normal: { x: -1, y: 0, z: 0 } },
  { face: Face.RIGHT, normal: { x: 1, y: 0, z: 0 } },
  { face: Face.BOTTOM, normal: { x: 0, y: -1, z: 0 } },
  { face: Face.TOP, normal: { x: 0, y: 1, z: 0 } }
]
