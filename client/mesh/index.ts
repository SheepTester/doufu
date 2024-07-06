import { neighborIndex, SIZE } from '../../common/world/Chunk'
import { World } from '../../common/world/World'
import { Connection } from '../net/Connection'
import { ChunkMesh, neighborAffectedParts } from './ChunkMesh'
import { MeshWorkerMessage, MeshWorkerRequest } from './message'

const world = new World<ChunkMesh>({
  createChunk: position => new ChunkMesh(position)
})

const dirty = new Set<ChunkMesh>()

let timeoutId: number | undefined = undefined
function remeshDirtyChunks () {
  clearTimeout(timeoutId)
  timeoutId = setTimeout(() => {
    for (const chunk of dirty) {
      const data = chunk.generateMesh()
      connection.send({ type: 'mesh', position: chunk.position, data }, [
        data.buffer
      ])
    }
    dirty.clear()
  }, 0)
}

const connection = new Connection<MeshWorkerRequest, MeshWorkerMessage>(
  message => {
    switch (message.type) {
      case 'chunk-data': {
        for (const { position, data } of message.chunks) {
          const chunk = world.ensure(position)
          chunk.data = data
          chunk.markAllDirty()
          for (const [i, neighbor] of chunk.neighbors.entries()) {
            if (neighbor instanceof ChunkMesh) {
              for (const j of neighborAffectedParts[i]) {
                neighbor.cache[j].dirty = true
              }
              dirty.add(neighbor)
            }
          }
        }
        remeshDirtyChunks()
        break
      }
      case 'block-update': {
        for (const { position, block } of message.blocks) {
          const { chunk, local } = world.setBlock(position, block)
          const part = {
            x: local.x < 1 ? -1 : local.x < SIZE - 1 ? 0 : 1,
            y: local.y < 1 ? -1 : local.y < SIZE - 1 ? 0 : 1,
            z: local.z < 1 ? -1 : local.z < SIZE - 1 ? 0 : 1
          }
          // Mark neighboring parts as dirty
          // rp = "raw part" because it could be -2 or 2
          for (const rpx of [part.x - 1, part.x, part.x + 1]) {
            for (const rpy of [part.y - 1, part.y, part.y + 1]) {
              for (const rpz of [part.z - 1, part.z, part.z + 1]) {
                // n = neighbor, p = part
                const [nx, px] =
                  rpx === -2 ? [-1, 1] : rpx === 2 ? [1, -1] : [0, rpx]
                const [ny, py] =
                  rpy === -2 ? [-1, 1] : rpy === 2 ? [1, -1] : [0, rpy]
                const [nz, pz] =
                  rpz === -2 ? [-1, 1] : rpz === 2 ? [1, -1] : [0, rpz]
                const neighbor = chunk.neighbors[neighborIndex(nx, ny, nz)]
                if (neighbor instanceof ChunkMesh) {
                  neighbor.cache[neighborIndex(px, py, pz)].dirty = true
                  dirty.add(neighbor)
                }
              }
            }
          }
        }
        remeshDirtyChunks()
        break
      }
    }
  }
)
connection.connectWorker()
