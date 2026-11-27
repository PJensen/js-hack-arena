import { AI } from '../rules/components/index.js';
import { findReachableNear } from '../rules/geometry/landmarks.js';
import { mobSpawners, spawnCaster, spawnMelee } from '../rules/spawner.js';

const spawners = new Map([
  ...Object.entries(mobSpawners),
  ['backline', spawnBackline],
]);

export const previewMobNames = [...spawners.keys()].join(', ');

export function getPreviewMob(name) {
  return spawners.get(name?.trim().toLowerCase());
}

export function spawnPreviewMob(world, grid, start, spawnMob) {
  if (spawnMob === spawnBackline) return spawnBackline(world, grid, start);
  // Prefer a readable starting gap and a clear path for the mob to engage.
  const position = findReachableNear(grid, start, [82, 64, 46]);
  return position ? spawnMob(world, grid, position.x, position.y, null) : null;
}

function spawnBackline(world, grid, start) {
  const back = findReachableNear(grid, start, [150, 120, 90]);
  if (!back) return null;
  const front = {
    x: start.x + (back.x - start.x) * 0.55,
    y: start.y + (back.y - start.y) * 0.55,
  };
  const goblin = spawnMelee(world, grid, front.x, front.y, null);
  const wraith = spawnCaster(world, grid, back.x, back.y, null);
  // Keep the practice targets in formation while the player tries the controls.
  world.get(goblin, AI).aggroRange = 0;
  world.get(wraith, AI).aggroRange = 0;
  return wraith;
}
