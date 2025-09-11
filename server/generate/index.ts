import { createNoise2D, createNoise3D } from 'simplex-noise'
import { Connection } from '../../client/net/Connection'
import {
  add,
  map,
  scale,
  sub,
  toKey,
  Vector3,
  Vector3Key
} from '../../common/Vector3'
import { Block } from '../../common/world/Block'
import { Chunk, SIZE } from '../../common/world/Chunk'
import { ChunkChange, WorldGenMessage, WorldGenRequest } from './message'
import Alea from 'alea'
import { ChunkFeatureChange, mergeChanges, priorityMap } from './priority'

const SEED = 'bleh'

const elevationNoise1 = createNoise2D(Alea(SEED, 'elevationNoise1'))
const elevationNoise2 = createNoise2D(Alea(SEED, 'elevationNoise2'))
const elevationNoise3 = createNoise2D(Alea(SEED, 'elevationNoise3'))
const elevationNoise4 = createNoise2D(Alea(SEED, 'elevationNoise4'))
const treeChances = createNoise2D(Alea(SEED, 'treeChances'))
const islandNoise1 = createNoise3D(Alea(SEED, 'islandNoise1'))
const islandNoise2 = createNoise3D(Alea(SEED, 'islandNoise2'))
const BASE_SCALE = 200
const BASE_AMPLITUDE = 20

function getElevation ({ x, z }: Omit<Vector3, 'y'>) {
  return (
    elevationNoise1(x, z) +
    elevationNoise2(x * 2, z * 2) / 2 +
    elevationNoise3(x * 4, z * 4) / 4 +
    elevationNoise4(x * 8, z * 8) / 8
  )
}

function getIslandness ({ x, y, z }: Vector3) {
  return islandNoise1(x, y, z) + islandNoise2(x * 2, y * 2, z * 2) / 2
}

type ChunkChanges = Record<
  Vector3Key,
  { chunk: Vector3; blocks: Record<Vector3Key, ChunkFeatureChange> }
>

const ungeneratedChunkChanges: ChunkChanges = {}

class FeatureBlockQueue {
  /** maps chunk positions to block positions to highest priority block */
  scheduledChanges: ChunkChanges = {}

  set (position: Vector3, block: Block): void {
    const priority = priorityMap[block] ?? 0
    const chunkPos = map(position, p => Math.floor(p / SIZE))
    const chunkKey = toKey(chunkPos)
    const blockPos = sub(position, scale(chunkPos, SIZE))
    const blockKey = toKey(blockPos)
    this.scheduledChanges[chunkKey] ??= { chunk: chunkPos, blocks: {} }
    this.scheduledChanges[chunkKey].blocks[blockKey] ??= {
      position: blockPos,
      priority: 0
    }
    this.scheduledChanges[chunkKey].blocks[blockKey].priority = Math.max(
      this.scheduledChanges[chunkKey].blocks[blockKey].priority,
      priority
    )
  }
}

/**
 * @param base Global coordinates of dirt block that tree generates above
 */
function spawnTree (queue: FeatureBlockQueue, base: Vector3): void {
  const rand = Alea(SEED, 'tree', base.x, base.z)
  const leavesHeight = rand.next() * 3 + 2
  const trunkHeight = rand.next() * 2 + 1
  for (let i = 0; i < trunkHeight + leavesHeight; i++) {
    if (i >= trunkHeight) {
      for (let x = -2; x <= 2; x++) {
        for (let z = -2; z <= 2; z++) {
          const radius = 5 + rand.next() * 1.5 - (i - trunkHeight) / 2
          if (x * x + z * z <= radius) {
            queue.set(add(base, { x, y: i + 1, z }), Block.LEAVES)
          }
        }
      }
    }
    if (i < trunkHeight + leavesHeight - 1) {
      queue.set(add(base, { y: i + 1 }), Block.LOG)
    }
  }
}

function generateChunk (position: Vector3): {
  chunk: Chunk
  queue: FeatureBlockQueue
} {
  const relativeSeaLevel = 10 - position.y * SIZE

  const queue = new FeatureBlockQueue()
  const chunk = new Chunk(position)
  const chunkBlockPos = scale(position, SIZE)
  for (let x = 0; x < SIZE; x++) {
    for (let z = 0; z < SIZE; z++) {
      const columnPos = add(chunkBlockPos, { x, z })
      const elevation =
        getElevation(scale(columnPos, 1 / BASE_SCALE)) * BASE_AMPLITUDE + 20
      const relativeElevation = Math.floor(elevation) - position.y * SIZE
      const rand = Alea(SEED, x, z)

      for (let y = 0; y < SIZE; y++) {
        if (y <= relativeElevation - 4) {
          chunk.set({ x, y, z }, Block.STONE)
        } else if (y <= relativeElevation - 1) {
          chunk.set({ x, y, z }, Block.DIRT)
        } else if (y <= relativeElevation) {
          const shouldSpawnTree =
            relativeElevation >= relativeSeaLevel &&
            rand.next() < treeChances(columnPos.x / 60, columnPos.z / 60) * 0.05
          if (shouldSpawnTree) {
            spawnTree(queue, add(columnPos, { y }))
          }
          chunk.set(
            { x, y, z },
            shouldSpawnTree || relativeElevation < relativeSeaLevel
              ? Block.DIRT
              : Block.GRASS
          )
        } else if (y <= relativeSeaLevel) {
          chunk.set({ x, y, z }, Block.WATER)
        } else {
          const islandScale = 100
          const blockPos = scale(add(columnPos, { y }), 1 / islandScale)
          const islandness =
            getIslandness(blockPos) * Math.min(1, (y - relativeElevation) / 50)
          if (islandness > 1) {
            const islandnessAbove =
              getIslandness(add(blockPos, { y: islandScale })) *
              Math.min(1, (y + 1 - relativeElevation) / 50)
            chunk.set(
              { x, y, z },
              islandnessAbove > 1 ? Block.STONE : Block.GRASS
            )
          }
        }
      }
    }
  }
  return { chunk, queue }
}

const generated = new Set<Vector3Key>()

const connection = new Connection<WorldGenRequest, WorldGenMessage>({
  onMessage: message => {
    switch (message.type) {
      case 'generate': {
        const { chunk, queue } = generateChunk(message.position)
        const chunkKey = toKey(message.position)
        if (queue.scheduledChanges[chunkKey]) {
          chunk.apply(Object.values(queue.scheduledChanges[chunkKey].blocks))
        }
        if (ungeneratedChunkChanges[chunkKey]) {
          chunk.apply(Object.values(ungeneratedChunkChanges[chunkKey].blocks))
          delete ungeneratedChunkChanges[chunkKey]
        }

        const serialized = chunk.serialize()
        connection.send({ type: 'chunk-data', chunk: serialized }, [
          serialized.data.buffer
        ])
        generated.add(chunkKey)

        const chunkChanges: ChunkChange[] = []
        for (const changes of Object.values(queue.scheduledChanges)) {
          const key = toKey(changes.chunk)
          if (key === chunkKey) {
            continue
          }
          if (generated.has(key)) {
            chunkChanges.push({
              position: changes.chunk,
              changes: Object.values(changes.blocks)
            })
          } else {
            if (ungeneratedChunkChanges[key]) {
              ungeneratedChunkChanges[key].blocks = mergeChanges(
                ungeneratedChunkChanges[key].blocks,
                changes.blocks
              )
            } else {
              ungeneratedChunkChanges[key] = changes
            }
          }
        }
        if (chunkChanges.length > 0) {
          connection.send({ type: 'retcon-blocks', chunks: chunkChanges })
        }

        break
      }
      default: {
        console.error('Unknown world generator request type', message)
      }
    }
  }
})
connection.connectWorker()
