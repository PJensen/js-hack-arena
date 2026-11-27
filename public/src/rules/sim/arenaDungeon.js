import { createArenaSimulation } from './arenaSim.js';

export function createArenaDungeonSimulation({ seed, cave, mode, preview = false }) {
  return createArenaSimulation({
    seed,
    grid: cave.grid,
    spawns: cave.spawns,
    campfires: cave.campfires,
    chestSites: preview ? [] : cave.chestSites,
    itemSites: preview ? [] : cave.itemSites,
    authoredMobSites: preview ? [] : cave.authoredMobSites,
    mode,
    collectGear: !preview,
    enemyGroupSize: 3,
    encounterSites: preview ? [] : cave.encounterSites,
    oreSites: cave.oreSites,
  });
}
