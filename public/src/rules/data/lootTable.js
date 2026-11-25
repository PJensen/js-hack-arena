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
  { weight: 10, type: 'short_bow' },
  { weight: 12, type: 'rusty_sword' },
  { weight: 10, type: 'steel_blade' },
  { weight: 7, type: 'flame_brand' },
  { weight: 8, type: 'arrows', count: 5 },
  { weight: 5, type: 'mana_potion', potency: 30 },
  { weight: 7, type: 'arcane_surge' },
  { weight: 4, type: 'spellbook:poison_orb' },
  { weight: 3, type: 'spellbook:ice_armor' },
  { weight: 2, type: 'spellbook:blizzard' },
  { weight: 3, type: 'spellbook:regeneration' },
  { weight: 6, type: 'haste_rune' },
  { weight: 5, type: 'fury_rune' },
  { weight: 5, type: 'ward_rune' },
  { weight: 8, type: 'epic_chest' },
  { weight: 5, type: 'void_reaver' },
  { weight: 4, type: 'shadow_longbow' },
  { weight: 2, type: 'godslayer' },
  { weight: 1, type: 'sunfire_longbow' },
];

export const mobDropTotalWeight = mobDropTable.reduce((s, e) => s + e.weight, 0);

/**
 * Epic chest loot table (opened on pickup).
 */
export const epicChestTable = [
  { weight: 25, type: 'void_reaver' },
  { weight: 20, type: 'shadow_longbow' },
  { weight: 20, type: 'flame_brand' },
  { weight: 15, type: 'arrows', count: 10 },
  { weight: 10, type: 'instant_health_potion', potency: 50 },
  { weight: 8, type: 'mana_potion', potency: 40 },
  { weight: 8, type: 'fury_rune' },
  { weight: 8, type: 'ward_rune' },
  { weight: 5, type: 'godslayer' },
  { weight: 5, type: 'sunfire_longbow' },
];

export const epicChestTotalWeight = epicChestTable.reduce((s, e) => s + e.weight, 0);

export { rollTable } from './weightedTable.js';
