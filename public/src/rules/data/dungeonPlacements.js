import { itemIds, mobSpawners } from '../spawner.js';
import { miningMaterialIds } from './miningMaterials.js';

export const decorationIds = ['torch', 'mushroom', 'ghost_pipe'];
export const chestLootIds = ['epic', 'mob', 'fixed'];
export const dungeonItemIds = itemIds.filter((id) => id !== 'epic_chest');
export const dungeonMobIds = Object.keys(mobSpawners);
export const dungeonOreIds = miningMaterialIds.filter((id) => id.endsWith('_ore')).map((id) => id.slice(0, -4));
export const AUTHORED_ENTRANCE_CLEARANCE = 320;
export const PLACEMENT_LIMIT = 250;
export const ZONE_COUNT_LIMIT = 12;

export const dungeonPlacementTypes = {
  decoration: { label: 'Decoration', options: decorationIds },
  dressing: { label: 'Dressing zone', options: ['cave', ...decorationIds], zone: true },
  mob: { label: 'Fixed mob', options: dungeonMobIds, patrol: true },
  mob_zone: { label: 'Mob zone', options: ['cave_pack', ...dungeonMobIds], zone: true, patrol: true },
  chest: { label: 'Chest', options: chestLootIds },
  item: { label: 'Loose item', options: dungeonItemIds },
  campfire: { label: 'Campfire' },
  bank: { label: 'Bank', unique: true },
  exit: { label: 'Exit', unique: true },
  ore: { label: 'Ore vein', options: dungeonOreIds },
  ore_zone: { label: 'Ore zone', options: ['mixed', ...dungeonOreIds], zone: true },
};

export function normalizeDungeonPlacements(placements, bounds) {
  if (placements === undefined) return [];
  if (!Array.isArray(placements) || placements.length > PLACEMENT_LIMIT) throw new Error('Invalid dungeon placements');
  const ids = new Set(), uniqueTypes = new Set();
  let total = 0;
  function point(value) {
    const { x, y } = value ?? {};
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > bounds.width || y > bounds.height) {
      throw new Error('Placement coordinates must be inside the dungeon');
    }
    return { x, y };
  }
  return placements.map((value) => {
    const { id, kind, variant } = value ?? {};
    if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,47}$/.test(id) || ids.has(id)) throw new Error('Invalid placement ID');
    ids.add(id);
    const type = Object.hasOwn(dungeonPlacementTypes, kind) && dungeonPlacementTypes[kind];
    if (!type || (type.options && !type.options.includes(variant))) throw new Error('Unknown dungeon placement');
    if (type.unique && uniqueTypes.has(kind)) throw new Error(`The dungeon can only have one ${type.label.toLowerCase()}`);
    uniqueTypes.add(kind);
    const result = { id, kind, ...point(value) };
    if (type.options) result.variant = variant;
    if (type.zone) {
      const { radius, count } = value;
      if (!Number.isInteger(radius) || radius < 32 || radius > 1200 ||
          !Number.isInteger(count) || count < 1 || count > ZONE_COUNT_LIMIT) throw new Error('Invalid zone radius or count');
      Object.assign(result, { radius, count });
    }
    total += result.count ?? 1;
    if (total > 600) throw new Error('Dungeon placements can request up to 600 objects in total');
    if (kind === 'chest') {
      if (variant === 'fixed') {
        if (!dungeonItemIds.includes(value.item)) throw new Error('Unknown fixed chest item');
        result.item = value.item;
      }
      if (value.mimic === true) result.mimic = true;
    }
    if (type.patrol && value.patrol !== undefined) {
      if (!Array.isArray(value.patrol) || value.patrol.length > 8) throw new Error('A patrol can contain up to eight waypoints');
      if (value.patrol.length) result.patrol = value.patrol.map(point);
    }
    return result;
  });
}
