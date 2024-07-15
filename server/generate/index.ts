import { createNoise2D, createNoise3D } from 'simplex-noise'
import { Connection } from '../../client/net/Connection'
import { Vector3 } from '../../common/Vector3'
import { Block } from '../../common/world/Block'
import { Chunk, SIZE } from '../../common/world/Chunk'
import { WorldGenMessage, WorldGenRequest } from './message'
import Alea from 'alea'

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

function getElevation (x: number, z: number) {
  return (
    elevationNoise1(x, z) +
    elevationNoise2(x * 2, z * 2) / 2 +
    elevationNoise3(x * 4, z * 4) / 4 +
    elevationNoise4(x * 8, z * 8) / 8
  )
}

function getIslandness (x: number, y: number, z: number) {
  return islandNoise1(x, y, z) + islandNoise2(x * 2, y * 2, z * 2) / 2
}

function generateChunk (position: Vector3): Chunk {
  const relativeSeaLevel = 10 - position.y * SIZE

  const chunk = new Chunk(position)
  for (let x = 0; x < SIZE; x++) {
    for (let z = 0; z < SIZE; z++) {
      const elevation =
        getElevation(
          (position.x * SIZE + x) / BASE_SCALE,
          (position.z * SIZE + z) / BASE_SCALE
        ) *
          BASE_AMPLITUDE +
        20
      const relativeElevation = Math.floor(elevation) - position.y * SIZE
      const rand = Alea(SEED, x, z)
      const shouldSpawnTree =
        relativeElevation >= relativeSeaLevel &&
        rand.next() <
          treeChances(
            (position.x * SIZE + x) / 60,
            (position.z * SIZE + z) / 60
          ) *
            0.05
      for (let y = 0; y < SIZE; y++) {
        if (y <= relativeElevation - 4) {
          chunk.set({ x, y, z }, Block.STONE)
        } else if (y <= relativeElevation - 1) {
          chunk.set({ x, y, z }, Block.DIRT)
        } else if (y <= relativeElevation) {
          chunk.set(
            { x, y, z },
            relativeElevation < relativeSeaLevel
              ? Block.DIRT
              : shouldSpawnTree
              ? Block.LOG
              : Block.GRASS
          )
        } else if (y <= relativeSeaLevel) {
          chunk.set({ x, y, z }, Block.GLASS)
        } else if (shouldSpawnTree && y <= relativeElevation + 1) {
          chunk.set({ x, y, z }, Block.LOG)
        } else if (shouldSpawnTree && y <= relativeElevation + 4) {
          chunk.set({ x, y, z }, Block.LEAVES)
        } else {
          const scale = 100
          const islandness =
            getIslandness(
              (position.x * SIZE + x) / scale,
              (position.y * SIZE + y) / scale,
              (position.z * SIZE + z) / scale
            ) * Math.min(1, (y - relativeElevation) / 50)
          if (islandness > 1) {
            const islandnessAbove =
              getIslandness(
                (position.x * SIZE + x) / scale,
                (position.y * SIZE + y + 1) / scale,
                (position.z * SIZE + z) / scale
              ) * Math.min(1, (y + 1 - relativeElevation) / 50)
            chunk.set(
              { x, y, z },
              islandnessAbove > 1 ? Block.STONE : Block.GRASS
            )
          }
        }
      }
    }
  }
  return chunk
}

const connection = new Connection<WorldGenRequest, WorldGenMessage>({
  onMessage: message => {
    switch (message.type) {
      case 'generate': {
        const chunk = generateChunk(message.position).serialize()
        connection.send({ type: 'chunk-data', chunk }, [chunk.data.buffer])
        break
      }
      default: {
        console.error('Unknown world generator request type', message)
      }
    }
  }
})
connection.connectWorker()
