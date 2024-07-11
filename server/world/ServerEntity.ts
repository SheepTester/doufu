import { Entity } from '../../common/world/Entity'
import { World } from '../../common/world/World'
import { ServerChunk } from './ServerChunk'

export class ServerEntity extends Entity<World<ServerChunk>> {
  doMovement (elapsed: number): void {
    this.move(elapsed, {
      x: 0,
      y: 0,
      z: 0
    })
  }
}
