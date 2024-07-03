// TEMP: for now, create the world in the mesh worker

import { Vector3 } from '../../common/Vector3'
import { Block } from '../../common/world/Block'
import { SIZE } from '../../common/world/Chunk'
import { World } from '../../common/world/World'
import { ChunkMesh } from './ChunkMesh'
import { MeshWorkerMessage } from './message'

const world = new World<ChunkMesh>({
  createChunk: position => new ChunkMesh(position)
})

function generateChunk (position: Vector3): void {
  const chunk = new ChunkMesh(position)
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      for (let z = 0; z < SIZE; z++) {
        // Decreasing probability as you go up
        if (Math.random() < (SIZE - y) / SIZE) {
          chunk.set(
            { x, y, z },
            (Math.floor(position.x / 2) + position.z) % 2 === 0
              ? Block.STONE
              : Block.GLASS
          )
        }
      }
    }
  }
  world.register(chunk)
}

for (let x = -1; x <= 1; x++) {
  for (let z = -1; z <= 1; z++) {
    generateChunk({ x, y: 0, z })
    if (x !== 0 || z !== 0) {
      world.register(new ChunkMesh({ x, y: 1, z }))
    }
  }
}

const testChunk = new ChunkMesh({ x: 0, y: 1, z: 0 })
// Lone block (no AO)
testChunk.set({ x: 1, y: 3, z: 6 }, Block.WHITE)
// Corners touching (AO level 1)
testChunk.set({ x: 1, y: 3, z: 3 }, Block.WHITE)
testChunk.set({ x: 2, y: 4, z: 2 }, Block.WHITE)
// Sides touching (AO level 1)
testChunk.set({ x: 5, y: 3, z: 3 }, Block.WHITE)
testChunk.set({ x: 5, y: 4, z: 2 }, Block.WHITE)
// Side + corner touching (AO level 2)
testChunk.set({ x: 9, y: 3, z: 3 }, Block.WHITE)
testChunk.set({ x: 9, y: 4, z: 2 }, Block.WHITE)
testChunk.set({ x: 10, y: 4, z: 2 }, Block.WHITE)
// Two sides, no corner (AO level 3)
testChunk.set({ x: 5, y: 3, z: 6 }, Block.WHITE)
testChunk.set({ x: 5, y: 4, z: 7 }, Block.WHITE)
testChunk.set({ x: 6, y: 4, z: 6 }, Block.WHITE)
// Two sides, corner (AO level 3)
testChunk.set({ x: 9, y: 3, z: 6 }, Block.WHITE)
testChunk.set({ x: 9, y: 4, z: 7 }, Block.WHITE)
testChunk.set({ x: 10, y: 4, z: 6 }, Block.WHITE)
testChunk.set({ x: 10, y: 4, z: 7 }, Block.WHITE)
world.register(testChunk)

for (const chunk of world.chunks()) {
  const data = chunk.generateMesh()
  if (data.length === 0) {
    continue
  }
  const message: MeshWorkerMessage = {
    type: 'mesh',
    position: chunk.position,
    data
  }
  self.postMessage(message)
}
