import {
  add,
  all,
  map,
  MIDDLE,
  neighborIndex,
  NEIGHBORS,
  ZERO
} from '../../common/Vector3'
import { SIZE } from '../../common/world/Chunk'
import { World } from '../../common/world/World'
import { Connection } from '../net/Connection'
import { ChunkMesh, sectionsAffectedByNeighborMap } from './ChunkMesh'
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
              for (const j of sectionsAffectedByNeighborMap[i]) {
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
        const chunksWithBlockUpdates = new Set<ChunkMesh>()
        for (const { position, block, id } of message.blocks) {
          const { chunk, local } = world.setBlock(position, block, id)
          if (!chunk) {
            continue
          }
          chunksWithBlockUpdates.add(chunk)

          // The goal of this part of the program is to decide which sections of
          // which chunks should be marked dirty.

          // TODO: the block position check could benefit other sections (except
          // vertex ones) too
          if (all(local, l => 1 < l && l < SIZE - 2)) {
            // The block is both in the middle section and does not touch any
            // other sections, so only the middle section is marked dirty.
            chunk.cache[MIDDLE].dirty = true
            dirty.add(chunk)
            continue
          }

          /**
           * This gets the neighbor vector of the chunk section that the block
           * is in.
           */
          const section = map(local, l => (l < 1 ? -1 : l >= SIZE - 1 ? 1 : 0))
          // Mark neighboring sections as dirty
          for (const neighborOffset of NEIGHBORS) {
            /**
             * A pseudo-neighbor vector representing a neighboring section. It
             * is not a true neighbor vector because some components may be
             * +/-2, but this allows it to represent both the chunk that the
             * section is in and the section offset within that chunk.
             */
            const neighborSectionRaw = add(section, neighborOffset)
            /**
             * The neighbor vector of the chunk that the neighboring section is
             * in.
             */
            const neighborSectionChunk = map(neighborSectionRaw, c =>
              c === -2 ? -1 : c === 2 ? 1 : 0
            )
            const neighborChunk =
              chunk.neighbors[neighborIndex(neighborSectionChunk)]
            if (neighborChunk instanceof ChunkMesh) {
              /**
               * The neighbor vector of the block's neighboring section within
               * `neighborSectionChunk`.
               */
              const neighborSection = map(neighborSectionRaw, c =>
                c === -2 ? 1 : c === 2 ? -1 : c
              )
              neighborChunk.cache[neighborIndex(neighborSection)].dirty = true
              dirty.add(neighborChunk)
            }
          }
        }
        for (const chunk of chunksWithBlockUpdates) {
          chunk.handleDataUpdate()
        }
        requestRemesh()
        break
      }
    }
  }
})
connection.connectWorker()
