import { ZERO } from '../../common/Vector3'
import { Entity } from '../../common/world/Entity'
import { World } from '../../common/world/World'
import { ServerChunk } from './ServerChunk'

export class ServerEntity extends Entity<World<ServerChunk>> {
  doMovement (elapsed: number): void {
    this.move(elapsed, ZERO, ZERO)
  }
}
