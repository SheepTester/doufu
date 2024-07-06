export function merge (
  buffers: (ArrayBufferView & ArrayLike<number>)[]
): Uint8Array {
  const merged = new Uint8Array(
    buffers.reduce((cum, curr) => cum + curr.byteLength, 0)
  )
  console.log(buffers.reduce((cum, curr) => cum + curr.byteLength, 0))
  let i = 0
  for (const buffer of buffers) {
    merged.set(
      new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength),
      i
    )
    i += buffer.byteLength
  }
  return merged
}
