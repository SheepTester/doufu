import { add, map, neighborIndex, NEIGHBORS, ZERO } from '../../common/Vector3'
import { SIZE } from '../../common/world/Chunk'
import { World } from '../../common/world/World'
import { Connection } from '../net/Connection'
import { ChunkMesh, neighborAffectedParts } from './ChunkMesh'
import { MeshWorkerMessage, MeshWorkerRequest } from './message'

const world = new World<ChunkMesh>({
  createChunk: position => new ChunkMesh(position)
})

const dirty = new Set<ChunkMesh>()

let timeoutId: ReturnType<typeof setTimeout> | undefined = undefined
function remeshDirtyChunks () {
  const start = performance.now()
  const dirtyCount = dirty.size
  for (const chunk of dirty) {
    const data = chunk.generateMesh()
    connection.send({ type: 'mesh', position: chunk.position, data }, [
      data.buffer
    ])
  }
  dirty.clear()
  timeoutId = undefined
  if (dirtyCount > 0) {
    connection.send({
      type: 'mesh-time',
      time: (performance.now() - start) / dirtyCount
    })
  }
}
function requestRemesh () {
  clearTimeout(timeoutId)
  if (dirty.size > 200) {
    // Forcefully remesh chunks now so client can start rendering chunks. The
    // smaller this limit is, the sooner we can get chunks loaded, but the more
    // extra work we have to re-mesh chunk borders.
    remeshDirtyChunks()
  } else {
    timeoutId = setTimeout(remeshDirtyChunks, 0)
  }
}

const connection = new Connection<MeshWorkerRequest, MeshWorkerMessage>({
  onMessage: message => {
    switch (message.type) {
      case 'chunk-data': {
        for (const { position, data } of message.chunks) {
          const chunk = world.ensure(position)
          chunk.data = data
          chunk.handleDataUpdate()
          chunk.markAllDirty()
        }
        // Iterate neighbors after all new chunks have their neighbors set
        for (const { position } of message.chunks) {
          const chunk = world.ensure(position)
          for (const [i, neighbor] of chunk.neighbors.entries()) {
            if (neighbor instanceof ChunkMesh) {
              for (const j of neighborAffectedParts[i]) {
                neighbor.cache[j].dirty = true
              }
              dirty.add(neighbor)
            }
          }
        }
        requestRemesh()
        break
      }
      case 'block-update': {
        for (const { position, block, id } of message.blocks) {
          const { chunk, local } = world.setBlock(position, block, id)
          if (!chunk) {
            break
          }
          chunk.handleDataUpdate()
          // TODO: Where does it set the current chunk to be dirty?
          const part = map(local, local =>
            local < 1 ? -1 : local < SIZE - 1 ? 0 : 1
          )
          // Mark neighboring parts as dirty
          for (const offset of NEIGHBORS) {
            // rp = "raw part" because it could be -2 or 2
            const rawPart = add(part, offset)
            const neighbor =
              chunk.neighbors[
                neighborIndex(
                  map(rawPart, rp => (rp === -2 ? -1 : rp === 2 ? 1 : 0))
                )
              ]
            if (neighbor instanceof ChunkMesh) {
              neighbor.cache[
                neighborIndex(
                  map(rawPart, rp => (rp === -2 ? 1 : rp === 2 ? -1 : rp))
                )
              ].dirty = true
              dirty.add(neighbor)
            }
          }
        }
        requestRemesh()
        break
      }
    }
  }
})
connection.connectWorker()
