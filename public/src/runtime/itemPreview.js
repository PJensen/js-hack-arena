import { Position } from '../rules/components/Position.js';
import { itemIds, spawnItem } from '../rules/spawner.js';
import { applyItemPickup } from '../rules/systems/pickupSystem.js';

export function getItemPreview(params) {
  if (!params.has('give')) return null;
  const items = params.getAll('give')
    .flatMap((value) => value.split(','))
    .map((item) => item.trim().toLowerCase().replace(/[\s-]+/g, '_'))
    .filter(Boolean);
  const available = `Available test items: ${itemIds.join(', ')}.`;
  if (!items.length || (items.length === 1 && items[0] === 'list')) {
    return { items: [], status: available };
  }
  const unknown = items.find((item) => !itemIds.includes(item));
  if (unknown) return { items: [], status: `Unknown test item "${unknown}". ${available}` };
  return { items, status: `Starting test items: ${items.join(', ')}.` };
}

export function givePreviewItems(world, grid, playerId, items) {
  const { x, y } = world.get(playerId, Position);
  for (const type of items) {
    const itemId = spawnItem(world, x, y, { type });
    if (itemId != null && applyItemPickup(world, playerId, itemId, grid)) world.destroy(itemId);
  }
}
