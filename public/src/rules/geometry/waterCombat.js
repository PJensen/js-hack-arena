import { hasFloorCoverage } from './floorCoverage.js';

// Game-wide tuning for electric hits against actors standing in shallow water.
export const WATER_COMBAT = Object.freeze({ damage: 2, critChance: 1, stunDuration: 1 });

export function isStandingInWater(grid, point) {
  return hasFloorCoverage(grid, grid?.waterGrid, point);
}
