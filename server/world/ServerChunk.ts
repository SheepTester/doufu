import { Connection } from '..'
import { Chunk } from '../../common/world/Chunk'

export class ServerChunk extends Chunk {
  subscribers: Connection[] = []
  generated = false
}
