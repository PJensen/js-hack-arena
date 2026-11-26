import { ItemInfo, ItemSlot, Ring, WeaponPickup } from './components/index.js';

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
  return Object.entries(character?.gear ?? {}).flatMap(([key, count]) => {
    const item = readGearKey(key);
    return item && Number.isSafeInteger(count) && count > 0 ? [{ key, count, ...item }] : [];
  });
}

