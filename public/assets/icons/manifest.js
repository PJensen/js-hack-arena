// Grimdark icon atlas: 12 columns × 12 rows.
// Coordinates are normalized UVs so the generated 1254×1254 sheet can be
// sampled without rounding its 104.5-pixel cell size.
export const atlas = Object.freeze({
  image: './icons.png',
  normal: './normals.png',
  emissive: './emissive.png',
  columns: 12,
  rows: 13,
  width: 1254,
  height: 1359,
});

const names = [
  // Row 1: current abilities and conditions
  'cleave', 'rend', 'frost_bolt', 'arrow', 'lightning', 'venom_orb', 'ice_armor', 'regeneration', 'blizzard', 'frozen', 'stunned', 'poisoned',
  // Row 2: effects and loot
  'bleeding', 'chilling_presence', 'haste_totem', 'health_potion', 'mana_potion', 'mana_surge', 'haste_rune', 'fury_rune', 'ward_rune', 'epic_chest', 'arrows', 'quiver',
  // Row 3: swords and bows
  'sword_tier_0', 'sword_tier_1', 'sword_tier_2', 'epic_sword', 'legendary_sword', 'bow', 'epic_bow', 'legendary_bow', 'dagger', 'sacrificial_knife', 'greatsword', 'falchion',
  // Row 4: additional weapons
  'hand_axe', 'battleaxe', 'executioner_axe', 'flanged_mace', 'morningstar', 'warhammer', 'spear', 'halberd', 'quarterstaff', 'sorcerer_staff', 'bone_wand', 'crossbow',
  // Row 5: armor
  'round_shield', 'kite_shield', 'tower_shield', 'buckler', 'leather_hood', 'iron_helmet', 'greathelm', 'bone_mask', 'leather_cuirass', 'chainmail', 'iron_breastplate', 'sorcerer_robe',
  // Row 6: equipment
  'leather_gloves', 'iron_gauntlets', 'worn_boots', 'greaves', 'pauldrons', 'belt', 'cloak', 'ring', 'signet_ring', 'bone_amulet', 'silver_pendant', 'iron_circlet',
  // Row 7: spellbooks and scrolls
  'spellbook_venom_orb', 'spellbook_ice_armor', 'spellbook_blizzard', 'spellbook_regeneration', 'spellbook_fire', 'spellbook_lightning', 'necromancy_tome', 'blood_magic_tome', 'sealed_scroll', 'arcane_scroll', 'curse_scroll', 'torn_map',
  // Row 8: offensive magic
  'firebolt', 'fireball', 'flame_eruption', 'ring_of_fire', 'ice_lance', 'ice_wall', 'electric_spear', 'shadow_bolt', 'void', 'blood_spear', 'spectral_skull', 'grasping_dead_hands',
  // Row 9: support and control magic
  'protective_barrier', 'cracked_shield_spell', 'spectral_step', 'teleport', 'purge', 'dispel', 'silence', 'fear', 'sleep', 'confusion', 'dead_roots', 'petrification',
  // Row 10: martial abilities
  'charge', 'shield_bash', 'parry', 'block', 'backstab', 'execution_strike', 'hammer_stun', 'spear_thrust', 'whirlwind', 'aimed_shot', 'multishot', 'dodge',
  // Row 11: consumables and materials
  'antidote', 'stamina_potion', 'poison_vial', 'oil_bottle', 'bandage', 'bitter_herbs', 'mushrooms', 'ration', 'iron_ore', 'coal', 'rough_crystal', 'leather_scraps',
  // Row 12: utility and additional conditions
  'old_key', 'keyring', 'torch', 'lantern', 'rope', 'coin_pouch', 'skeletal_remains', 'burning_hand', 'weakened', 'cursed', 'blind', 'fortified',
  // Row 13: newly added icons
  'runed_copper_signet',
];

export const icons = Object.freeze(Object.fromEntries(names.map((id, index) => {
  const column = index % atlas.columns;
  const row = Math.floor(index / atlas.columns);
  return [id, Object.freeze({
    x: column / atlas.columns,
    y: row / atlas.rows,
    width: 1 / atlas.columns,
    height: 1 / atlas.rows,
    column,
    row,
  })];
})));

export default icons;
