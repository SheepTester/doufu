export type Vector3 = {
  x: number
  y: number
  z: number
}

export const ZERO = { x: 0, y: 0, z: 0 }

export type Axis = keyof Vector3

export const axes = ['x', 'y', 'z'] as const

export type Vector3Key = `${number},${number},${number}`

export function toKey ({ x, y, z }: Vector3): Vector3Key {
  return `${x},${y},${z}`
}

export function fromArray ([x, y, z]: Iterable<number>): Vector3 {
  return { x, y, z }
}

export function toArray ({
  x,
  y,
  z
}: Vector3): [x: number, y: number, z: number] {
  return [x, y, z]
}

export function add (
  v: Vector3,
  { x = 0, y = 0, z = 0 }: Partial<Vector3>
): Vector3 {
  return { x: v.x + x, y: v.y + y, z: v.z + z }
}

export function scale ({ x, y, z }: Vector3, factor: number): Vector3 {
  return { x: x * factor, y: y * factor, z: z * factor }
}

export function map (
  { x, y, z }: Vector3,
  func: (component: number, axis: Axis) => number
): Vector3 {
  return { x: func(x, 'x'), y: func(y, 'y'), z: func(z, 'z') }
}

export function map2 (
  a: Vector3,
  b: Vector3,
  func: (a: number, b: number) => number
): Vector3 {
  return {
    x: func(a.x, b.x),
    y: func(a.y, b.y),
    z: func(a.z, b.z)
  }
}

export function map3 (
  a: Vector3,
  b: Vector3,
  c: Vector3,
  func: (a: number, b: number, c: number) => number
): Vector3 {
  return {
    x: func(a.x, b.x, c.x),
    y: func(a.y, b.y, c.y),
    z: func(a.z, b.z, c.z)
  }
}

export function map4 (
  a: Vector3,
  b: Vector3,
  c: Vector3,
  d: Vector3,
  func: (a: number, b: number, c: number, d: number) => number
): Vector3 {
  return {
    x: func(a.x, b.x, c.x, d.x),
    y: func(a.y, b.y, c.y, d.y),
    z: func(a.z, b.z, c.z, d.z)
  }
}

export function reduce<T> (
  { x, y, z }: Vector3,
  func: (x: number, y: number, z: number) => T
): T {
  return func(x, y, z)
}

export function length ({ x, y, z }: Vector3): number {
  return Math.hypot(x, y, z)
}

/** Returns a zero vector for a zero vector */
export function normalize ({ x, y, z }: Vector3): Vector3 {
  const length = Math.hypot(x, y, z)
  return length === 0 ? ZERO : { x: x / length, y: y / length, z: z / length }
}

export function sumComponents ({ x, y, z }: Vector3): number {
  return x + y + z
}

export function neighborIndex ({ x, y, z }: Vector3): number {
  return ((x + 1) * 3 + y + 1) * 3 + z + 1
}
export const MIDDLE = neighborIndex(ZERO)

const offsets = [-1, 0, 1]
export const neighbors = offsets.flatMap(x =>
  offsets.flatMap(y => offsets.map(z => ({ x, y, z })))
)
