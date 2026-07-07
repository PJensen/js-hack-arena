// rules/data/lootTable.js
// Centralized loot drop table. Weights are relative (not percentages).

export const Rarity = Object.freeze({
  COMMON:    'common',
  UNCOMMON:  'uncommon',
  RARE:      'rare',
  EPIC:      'epic',
  LEGENDARY: 'legendary',
});

/** Rarity glow colors (for PointLight tint). */
export const rarityColors = {
  [Rarity.COMMON]:    { r: 160, g: 160, b: 160 },
  [Rarity.UNCOMMON]:  { r: 100, g: 220, b: 100 },
  [Rarity.RARE]:      { r: 80,  g: 140, b: 255 },
  [Rarity.EPIC]:      { r: 200, g: 80,  b: 255 },
  [Rarity.LEGENDARY]: { r: 255, g: 200, b: 50  },
};

/** Rarity text colors for float text / HUD. */
export const rarityTextColors = {
  [Rarity.COMMON]:    '#aaaaaa',
  [Rarity.UNCOMMON]:  '#44dd44',
  [Rarity.RARE]:      '#5588ff',
  [Rarity.EPIC]:      '#cc55ff',
  [Rarity.LEGENDARY]: '#ffcc00',
};

/**
 * Mob death loot table.
 * Rolled once per mob kill. Potion always drops separately.
 */
export const mobDropTable = [
  { weight: 25, type: 'nothing' },
  { weight: 10, type: 'bow',          rarity: Rarity.COMMON },
  { weight: 12, type: 'sword',        tier: 0, rarity: Rarity.COMMON },
  { weight: 10, type: 'sword',        tier: 1, rarity: Rarity.UNCOMMON },
  { weight: 7,  type: 'sword',        tier: 2, rarity: Rarity.RARE },
  { weight: 8,  type: 'arrows',       count: 5 },
  { weight: 8,  type: 'epic_chest',   rarity: Rarity.EPIC },
  { weight: 5,  type: 'epic_sword',   rarity: Rarity.EPIC },
  { weight: 4,  type: 'epic_bow',     rarity: Rarity.EPIC },
  { weight: 2,  type: 'legendary_sword', rarity: Rarity.LEGENDARY },
  { weight: 1,  type: 'legendary_bow',   rarity: Rarity.LEGENDARY },
];

export const mobDropTotalWeight = mobDropTable.reduce((s, e) => s + e.weight, 0);

/**
 * Epic chest loot table (opened on pickup).
 */
export const epicChestTable = [
  { weight: 25, type: 'epic_sword',      rarity: Rarity.EPIC },
  { weight: 20, type: 'epic_bow',        rarity: Rarity.EPIC },
  { weight: 20, type: 'sword',           tier: 2, rarity: Rarity.RARE },
  { weight: 15, type: 'arrows',          count: 10 },
  { weight: 10, type: 'potion',          potency: 50 },
  { weight: 5,  type: 'legendary_sword', rarity: Rarity.LEGENDARY },
  { weight: 5,  type: 'legendary_bow',   rarity: Rarity.LEGENDARY },
];

export const epicChestTotalWeight = epicChestTable.reduce((s, e) => s + e.weight, 0);

/**
 * Pick a weighted random entry from a table.
 */
export function rollTable(table, totalWeight) {
  let roll = Math.random() * totalWeight;
  for (const entry of table) {
    roll -= entry.weight;
    if (roll <= 0) return entry;
  }
  return table[table.length - 1];
}
