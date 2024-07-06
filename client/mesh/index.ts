import { neighborIndex } from '../../common/world/Chunk'
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
          const chunk = world.setBlock(position, block)
          chunk.cache[neighborIndex(0, 0, 0)].dirty = true // TEMP
          dirty.add(chunk)
        }
        remeshDirtyChunks()
        break
      }
    }
  }
)
connection.connectWorker()
