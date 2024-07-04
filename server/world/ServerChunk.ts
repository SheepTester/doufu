import { Connection } from '..'
import { Chunk } from '../../common/world/Chunk'

export class ServerChunk extends Chunk {
  subscribers = new Set<Connection>()
  generationState: 'generated' | 'generating' | 'ungenerated' = 'ungenerated'

  broadcastUpdate () {
    for (const subscriber of this.subscribers) {
      subscriber.send({ type: 'chunk-data', chunks: [this.serialize()] })
    }
  }
}
