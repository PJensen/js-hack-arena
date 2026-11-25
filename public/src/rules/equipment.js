import { Actor, BowWeapon, MeleeWeapon, Ring } from './components/index.js';

const equippedComponents = [Ring, MeleeWeapon, BowWeapon];

export function forEachEquippedItem(world, actorId, visit) {
  if (!world.has(actorId, Actor)) return;
  for (const component of equippedComponents) {
    const item = world.get(actorId, component);
    if (item?.name && item.equipped !== false) visit(item);
  }
}
