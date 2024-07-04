// `null` is the void block, for the edges of chunks that haven't been rendered
// yet. Faces at that border should still be culled (since the player shouldn't
// see them anyways), but it also doesn't have a texture.

export const enum Block {
  AIR = 0,
  STONE = 1,
  GLASS = 2,
  WHITE = 3
}

const textures: Partial<Record<Block, number>> = {
  [Block.STONE]: 0,
  [Block.GLASS]: 1,
  [Block.WHITE]: 2
}

/** Whether the block can cull faces */
export function isOpaque (block: Block | null): boolean {
  return block === Block.STONE || block === Block.WHITE
}

/** Whether entities can collide with the block */
export function isSolid (block: Block | null): boolean {
  return block !== Block.AIR
}

export function getTexture (block: Block | null): number | null {
  return block !== null ? textures[block] ?? null : null
}
