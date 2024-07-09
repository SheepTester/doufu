import { Connection } from '..'
import { SerializedBlock } from '../../common/message'
import { Chunk } from '../../common/world/Chunk'

export class ServerChunk extends Chunk {
  subscribers = new Set<Connection>()
  generationState:
    | { type: 'generated' }
    | {
        type: 'generating' | 'ungenerated'
        /**
         * Block updates to be applied after the chunk has finished generating.
         */
        queue: SerializedBlock[]
      } = {
    type: 'ungenerated',
    queue: []
  }

  broadcastUpdate () {
    for (const subscriber of this.subscribers) {
      subscriber.send({ type: 'chunk-data', chunks: [this.serialize()] })
    }
  }
}
