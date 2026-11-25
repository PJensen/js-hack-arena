import { findReachableNear } from '../rules/geometry/landmarks.js';
import { spawnBat, spawnCaster, spawnFlamingBat, spawnFloatingEye, spawnGasSpore, spawnMelee, spawnSpider, spawnTank } from '../rules/spawner.js';

const spawners = new Map([
  ['spider', spawnSpider],
  ['goblin', spawnMelee],
  ['wraith', spawnCaster],
  ['cube', spawnTank],
  ['floating_eye', spawnFloatingEye],
  ['gas_spore', spawnGasSpore],
  ['bat', spawnBat],
  ['flaming_bat', spawnFlamingBat],
]);

export const previewMobNames = [...spawners.keys()].join(', ');

export function getPreviewMob(name) {
  return spawners.get(name?.trim().toLowerCase());
}

export function spawnPreviewMob(world, grid, start, spawnMob) {
  // Prefer a readable starting gap and a clear path for the mob to engage.
  const position = findReachableNear(grid, start, [82, 64, 46]);
  return position ? spawnMob(world, grid, position.x, position.y, null) : null;
}
