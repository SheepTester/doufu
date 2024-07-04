export type Vector3 = {
  x: number
  y: number
  z: number
}

export type Vector3Key = `${number},${number},${number}`

export function toKey ({ x, y, z }: Vector3): Vector3Key {
  return `${x},${y},${z}`
}
