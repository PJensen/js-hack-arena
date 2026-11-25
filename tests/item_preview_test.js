import { assert, assertEquals } from 'https://deno.land/std@0.220.0/assert/mod.ts';
import { Consumable, GroundItem, Position, Ring } from '../public/src/rules/components/index.js';
import { ringTooltipRows } from '../public/src/display/ui/itemTooltip.js';
import { epicChestTable, mobDropTable } from '../public/src/rules/data/lootTable.js';
import { createArenaSimulation } from '../public/src/rules/sim/arenaSim.js';
import { itemIds, spawnItem } from '../public/src/rules/spawner.js';
import { getItemPreview, givePreviewItems } from '../public/src/runtime/itemPreview.js';

const grid = { distanceMove: () => 100 };

function makeSimulation() {
  return createArenaSimulation({ seed: 42, grid, spawns: [{ x: 100, y: 100 }], enemyCount: 0 });
}

Deno.test('item preview lists the shared catalog and rejects unknown IDs', () => {
  assertEquals(getItemPreview(new URLSearchParams()), null);
  const preview = getItemPreview(new URLSearchParams('give=list'));
  assertEquals(preview.items, []);
  assert(preview.status.includes(itemIds.join(', ')));

  const invalid = getItemPreview(new URLSearchParams('give=haste_ring,constructor'));
  assertEquals(invalid.items, []);
  assert(invalid.status.includes('Unknown test item "constructor"'));
});

Deno.test('item preview applies normal pickup effects before the first tick', () => {
  const sim = makeSimulation();
  const playerId = sim.addPlayer('local');
  const preview = getItemPreview(new URLSearchParams(
    'give=Haste+Ring,Godslayer,sunfire-longbow' +
      '&give=spellbook:blizzard,arrows,gold,ward_rune,health_potion,mana_potion' +
      '&give=black-opal,diamond,black_opal',
  ));
  givePreviewItems(sim.world, grid, playerId, preview.items);

  const { state } = sim.getPlayerSnapshot('local');
  assertEquals(state.ring.name, 'Haste Ring');
  assertEquals(state.weapon.damage, 60);
  assertEquals(state.rangedWeapon.infiniteArrows, true);
  assertEquals(state.spells.slice(-2), ['arrow', 'blizzard']);
  assertEquals(state.arrowCount, 15);
  assertEquals(state.gold, 1);
  assertEquals(state.wardSeconds, 9);
  assertEquals(state.materials, { black_opal: 2, diamond: 1 });
  assertEquals(sim.getTick(), 0);

  const leftOnGround = [...sim.world.query(GroundItem, Consumable, Position)]
    .map(([, , consumable, position]) => [consumable.effect, position.x, position.y]);
  assertEquals(leftOnGround, [['heal_over_time', 100, 100], ['mana', 100, 100]]);
});

Deno.test('item catalog spawns every listed item and resolves every weighted drop', () => {
  const { world } = makeSimulation();
  const entries = [
    ...itemIds.map((type) => ({ type })),
    ...mobDropTable.filter(({ type }) => type !== 'nothing'),
    ...epicChestTable,
  ];
  for (const entry of entries) {
    const id = spawnItem(world, 100, 100, entry);
    assert(id != null && world.has(id, GroundItem), entry.type);
    const consumable = world.get(id, Consumable);
    if (consumable) assert(Number.isFinite(consumable.potency), entry.type);
  }
});

Deno.test('ring tooltip compares authored condition duration bonuses', () => {
  const { world } = makeSimulation();
  const rare = world.get(spawnItem(world, 100, 100, { type: 'frostband' }), Ring);
  const epic = world.get(spawnItem(world, 100, 100, { type: 'rimeband' }), Ring);
  assertEquals(ringTooltipRows(rare, epic), [{
    kind: 'equip', label: 'Equip: ', value: 'Frozen you inflict lasts 5% longer', change: 'down',
  }]);
  assertEquals(ringTooltipRows(epic, rare), [{
    kind: 'equip', label: 'Equip: ', value: 'Frozen you inflict lasts 10% longer', change: 'up',
  }]);
});
