import { Vector3, Vector3Key } from '../../common/Vector3'
import { Block } from '../../common/world/Block'

/** from lowest to highest */
export const priorityOrder = [
  Block.AIR,
  Block.WATER,
  Block.LEAVES,
  Block.LOG,
  Block.STONE,
  Block.DIRT,
  Block.GRASS,
  Block.GLASS,
  Block.WHITE
]
export const priorityMap: Partial<Record<Block, number>> = Object.fromEntries(
  priorityOrder.map((block, i) => [block, i])
)

export type ChunkFeatureChange = { position: Vector3; priority: number }

export function mergeChanges (
  a: Record<Vector3Key, ChunkFeatureChange>,
  b: Record<Vector3Key, ChunkFeatureChange>
): Record<Vector3Key, ChunkFeatureChange> {
  const aStr: Record<string, ChunkFeatureChange> = a
  return {
    ...a,
    ...Object.fromEntries(
      Object.entries(b).map(([k, v]) => [
        k,
        aStr[k] && aStr[k].priority > v.priority ? aStr[k] : v
      ])
    )
  }
}
