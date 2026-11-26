import { BowWeapon, ItemInfo, ItemSlot, MeleeWeapon, Ring, Spellbook, SpellId, WeaponPickup } from './components/index.js';

// Stack key is a versioned, canonical descriptor of server-authored gear.
// Identical drops stack; rolled stats and modifiers remain part of identity.
const prefix = 'gear:v1:';
export function gearKey(world, entity) {
  const info = world.get(entity, ItemInfo);
  const ring = world.get(entity, Ring);
  const weapon = world.get(entity, WeaponPickup);
  if (!info || (!ring && !weapon)) return null;
  const item = {
    slot: ring ? ItemSlot.RING : weapon.slot,
    name: info.name, glyph: info.glyph, rarity: info.rarity,
    ...(ring ? { haste: ring.haste, modifiers: ring.modifiers } :
      { damage: weapon.damage, infiniteArrows: !!weapon.infiniteArrows }),
  };
  return prefix + JSON.stringify(item);
}

export function readGearKey(key) {
  if (typeof key !== 'string' || !key.startsWith(prefix) || key.length > 4096) return null;
  try {
    const item = JSON.parse(key.slice(prefix.length));
    if (!item || ![ItemSlot.MELEE, ItemSlot.RANGED, ItemSlot.RING].includes(item.slot) ||
      typeof item.name !== 'string' || typeof item.glyph !== 'string' || typeof item.rarity !== 'string') return null;
    if (item.slot === ItemSlot.RING) {
      if (!Number.isFinite(item.haste) || !Array.isArray(item.modifiers)) return null;
    } else if (!Number.isFinite(item.damage) || item.damage < 0) return null;
    return item;
  } catch { return null; }
}

export function bankedGear(character) {
  return Object.entries(character?.materials ?? {}).flatMap(([key, count]) => {
    const item = readGearKey(key);
    return item && Number.isSafeInteger(count) && count > 0 ? [{ key, count, ...item }] : [];
  });
}

// Loadout references only banked items. Swapping references does not consume
// or duplicate equipment, and affects only subsequently created players.
export function selectGear(character, { slot, key }) {
  if (![ItemSlot.MELEE, ItemSlot.RANGED, ItemSlot.RING].includes(slot)) return { error: 'Invalid equipment slot' };
  const equipment = { ...character.equipment };
  if (key === null) delete equipment[slot];
  else {
    const item = readGearKey(key);
    if (!item || item.slot !== slot || !(character.materials?.[key] > 0)) return { error: 'Item is not in your bank' };
    equipment[slot] = key;
  }
  return { character: { ...character, equipment } };
}

export function applyLoadout(world, player, character) {
  for (const { key, slot, name, glyph, rarity, haste, modifiers, damage, infiniteArrows } of bankedGear(character)) {
    if (character.equipment?.[slot] !== key) continue;
    if (slot === ItemSlot.RING) Object.assign(world.get(player, Ring), { name, glyph, rarity, haste, modifiers });
    if (slot === ItemSlot.MELEE) Object.assign(world.get(player, MeleeWeapon), { name, glyph, rarity, damage });
    if (slot === ItemSlot.RANGED) {
      Object.assign(world.get(player, BowWeapon), { equipped: true, name, glyph, rarity, damage, infiniteArrows });
      const book = world.get(player, Spellbook);
      if (!book.spells.includes(SpellId.ARROW)) book.spells.push(SpellId.ARROW);
    }
  }
}
