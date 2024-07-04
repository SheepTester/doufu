import { World } from '../../common/world/World'
import { Connection } from '../net/Connection'
import { ChunkMesh, neighborAffectedParts } from './ChunkMesh'
import { MeshWorkerMessage, MeshWorkerRequest } from './message'

const world = new World<ChunkMesh>({
  createChunk: position => new ChunkMesh(position)
})

const dirty = new Set<ChunkMesh>()

function remeshDirtyChunks () {
  for (const chunk of dirty) {
    const data = chunk.generateMesh()
    connection.send({ type: 'mesh', position: chunk.position, data }, [
      data.buffer
    ])
  }
  dirty.clear()
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
    }
  }
)
connection.connectWorker()
