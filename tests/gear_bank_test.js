import { assertEquals } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { ItemInfo, ItemSlot, Ring, WeaponPickup } from '../public/src/rules/components/index.js';
import { bankedGear, gearKey, readGearKey } from '../public/src/rules/gear.js';
import { CharacterProgress } from '../worker/characterProgress.js';

Deno.test('gear descriptors preserve stats and mixed bank deposits are idempotent', () => {
  const components = new Map([
    [ItemInfo, { name: 'Test Ring', glyph: 'o', rarity: 'rare' }],
    [Ring, { haste: 0.1, modifiers: [{ stat: 'test', value: 1.1 }] }],
  ]);
  const world = { get: (_entity, component) => components.get(component) };
  const key = gearKey(world, 1);
  assertEquals(readGearKey(key), { slot: ItemSlot.RING, name: 'Test Ring', glyph: 'o',
    rarity: 'rare', haste: 0.1, modifiers: [{ stat: 'test', value: 1.1 }] });
  const records = new Map();
  const storage = { transactionSync: fn => fn(), kv: {
    get: key => structuredClone(records.get(key)),
    put: (key, value) => records.set(key, structuredClone(value)),
  } };
  const character = new CharacterProgress(storage);
  character.initialize(10);
  character.creditMaterials('room', { copper_ore: 6, [key]: 1 });
  character.creditMaterials('room', { copper_ore: 6, [key]: 1 });
  assertEquals(character.read().materials, { copper_ore: 6 });
  assertEquals(bankedGear(character.read()).map(({ name, count }) => ({ name, count })), [{ name: 'Test Ring', count: 1 }]);
  character.enqueueCraft({ recipeId: 'smelt_copper', requestId: '00000000-0000-4000-8000-000000000001' }, 1000);
  character.read(601000);
  const restarted = new CharacterProgress(storage);
  restarted.creditMaterials('room', { copper_ore: 6, [key]: 2 });
  assertEquals(restarted.read().materials, { copper_ore: 4, copper_ingot: 1 });
  assertEquals(restarted.read().gear, { [key]: 2 });
});

Deno.test('weapon descriptors retain damage, slot and ammo behavior', () => {
  const components = new Map([
    [ItemInfo, { name: 'Bow', glyph: ')', rarity: 'epic' }],
    [WeaponPickup, { slot: ItemSlot.RANGED, damage: 21, infiniteArrows: true }],
  ]);
  const key = gearKey({ get: (_entity, component) => components.get(component) }, 1);
  assertEquals(readGearKey(key), { slot: ItemSlot.RANGED, name: 'Bow', glyph: ')', rarity: 'epic', damage: 21, infiniteArrows: true });
});
