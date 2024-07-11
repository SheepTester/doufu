import { createNoise2D } from 'simplex-noise'
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
const BASE_SCALE = 200
const BASE_AMPLITUDE = 20

function generateChunk (position: Vector3): Chunk {
  const chunk = new Chunk(position)
  for (let x = 0; x < SIZE; x++) {
    for (let z = 0; z < SIZE; z++) {
      const elevation =
        elevationNoise1(
          (position.x * SIZE + x) / BASE_SCALE,
          (position.z * SIZE + z) / BASE_SCALE
        ) *
          BASE_AMPLITUDE +
        elevationNoise2(
          (position.x * SIZE + x) / (BASE_SCALE / 2),
          (position.z * SIZE + z) / (BASE_SCALE / 2)
        ) *
          (BASE_AMPLITUDE / 2) +
        elevationNoise3(
          (position.x * SIZE + x) / (BASE_SCALE / 4),
          (position.z * SIZE + z) / (BASE_SCALE / 4)
        ) *
          (BASE_AMPLITUDE / 4) +
        elevationNoise4(
          (position.x * SIZE + x) / (BASE_SCALE / 8),
          (position.z * SIZE + z) / (BASE_SCALE / 8)
        ) *
          (BASE_AMPLITUDE / 8) +
        20
      for (let y = 0; y < SIZE; y++) {
        const globalY = y + position.y * SIZE
        if (globalY <= elevation - 4) {
          chunk.set({ x, y, z }, Block.STONE)
        } else if (globalY <= elevation - 1) {
          chunk.set({ x, y, z }, Block.DIRT)
        } else if (globalY <= elevation) {
          chunk.set({ x, y, z }, Block.GRASS)
        } else if (globalY <= 10) {
          chunk.set({ x, y, z }, Block.GLASS)
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
