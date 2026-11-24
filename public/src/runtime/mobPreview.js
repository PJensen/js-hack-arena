import { sweepMaxFree } from '../rules/geometry/sweep.js';
import { spawnBat, spawnCaster, spawnFloatingEye, spawnGasSpore, spawnMelee, spawnSpider, spawnTank } from '../rules/spawner.js';

const spawners = new Map([
  ['spider', spawnSpider],
  ['goblin', spawnMelee],
  ['wraith', spawnCaster],
  ['cube', spawnTank],
  ['floating_eye', spawnFloatingEye],
  ['gas_spore', spawnGasSpore],
  ['bat', spawnBat],
]);

export const previewMobNames = [...spawners.keys()].join(', ');

export function getPreviewMob(name) {
  return spawners.get(name?.trim().toLowerCase());
}

export function spawnPreviewMob(world, grid, { x, y }, spawnMob) {
  // Prefer a readable starting gap and a clear path for the mob to engage.
  for (const distance of [82, 64, 46]) {
    for (let direction = 0; direction < 16; direction++) {
      const angle = direction * Math.PI / 8;
      const tx = x + Math.cos(angle) * distance;
      const ty = y + Math.sin(angle) * distance;
      if (grid.distanceMove(tx, ty) < 20) continue;
      if (sweepMaxFree(grid, x, y, tx, ty, 18) < 1) continue;
      return spawnMob(world, grid, tx, ty, null);
    }
  }
  return null;
}
