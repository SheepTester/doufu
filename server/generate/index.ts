import { Connection } from '../../client/net/Connection'
import { Vector3 } from '../../common/Vector3'
import { Block } from '../../common/world/Block'
import { Chunk, SIZE } from '../../common/world/Chunk'
import { WorldGeneratorMessage, WorldGeneratorRequest } from './message'

function generateChunk (position: Vector3): Chunk {
  const chunk = new Chunk(position)
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
