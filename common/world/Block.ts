// `null` is the void block, for the edges of chunks that haven't been rendered
// yet. Faces at that border should still be culled (since the player shouldn't
// see them anyways), but it also doesn't have a texture.

import { Face } from './Face'

export const enum Block {
  AIR = 0,
  STONE = 1,
  GLASS = 2,
  WHITE = 3,
  DIRT = 4,
  GRASS = 5,
  LOG = 6,
  LEAVES = 7
}

const textures: Partial<Record<Block, number>> = {
  [Block.STONE]: 0,
  [Block.GLASS]: 1,
  [Block.WHITE]: 2,
  [Block.DIRT]: 3,
  [Block.GRASS]: 4,
  [Block.LOG]: 6,
  [Block.LEAVES]: 8
}

/** Whether the block can cull faces */
export function isOpaque (block: Block | null): boolean {
  return block !== Block.AIR && block !== Block.GLASS && block !== Block.LEAVES
}

/**
 * Whether faces between adjacent blocks of the same type should still be
 * rendered.
 */
export function showAdjacentFaces (block: Block | null): boolean {
  return block === Block.LEAVES
}

/** Whether entities can collide with the block */
export function isSolid (block: Block | null): boolean {
  return block !== Block.AIR
}

export function getTexture (block: Block | null, face: Face): number | null {
  if (block === Block.GRASS) {
    if (face === Face.TOP) {
      return 5
    } else if (face === Face.BOTTOM) {
      return 3
    }
  }
  if (block === Block.LOG && (face === Face.TOP || face === Face.BOTTOM)) {
    return 7
  }
  return block !== null ? textures[block] ?? null : null
}
