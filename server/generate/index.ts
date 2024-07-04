import { createNoise2D } from 'simplex-noise'
import { Connection } from '../../client/net/Connection'
import { Vector3 } from '../../common/Vector3'
import { Block } from '../../common/world/Block'
import { Chunk, SIZE } from '../../common/world/Chunk'
import { WorldGeneratorMessage, WorldGeneratorRequest } from './message'
import Alea from 'alea'

const SEED = 'bleh'

const elevationNoise = createNoise2D(Alea(SEED, 'wow'))

function generateChunk (position: Vector3): Chunk {
  const chunk = new Chunk(position)
  for (let x = 0; x < SIZE; x++) {
    for (let z = 0; z < SIZE; z++) {
      const elevation =
        elevationNoise(
          (position.x * SIZE + x) / 50,
          (position.z * SIZE + z) / 50
        ) *
          10 +
        16
      for (let y = 0; y < SIZE; y++) {
        if (y + position.y * SIZE <= elevation) {
          chunk.set({ x, y, z }, Block.STONE)
        } else if (y + position.y * SIZE < 16) {
          chunk.set({ x, y, z }, Block.GLASS)
        }
      }
    }
  }
  return chunk
}

const connection = new Connection<WorldGeneratorRequest, WorldGeneratorMessage>(
  message => {
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
)
connection.connectWorker()
