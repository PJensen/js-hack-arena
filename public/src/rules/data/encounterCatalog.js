import { seedFromString } from '../../shared/net/protocol.js';
import { mulberry32 } from '../geometry/caveGen.js';
import { spawnLootGoblin, spawnMimic } from '../spawner.js';
import { rollTable } from './weightedTable.js';

const siteFallbackWeights = { leafRoom: 4, encounter: 15 };
const encounterVariants = [spawnMimic];
const roamingEncounters = [{ spawn: spawnLootGoblin, count: 1 }];

export function createEncounterSelector(seed) {
  const random = mulberry32(seedFromString(`dungeon-encounters:${seed}`));
  const placements = new Map();

  function remaining(spawn) {
    return spawn.maxPerDungeon - (placements.get(spawn) ?? 0);
  }

  return {
    choose(site) {
      const variants = encounterVariants.flatMap((spawn) => {
        const weight = spawn.spawnWeights[site];
        return weight > 0 && remaining(spawn) > 0 ? [{ spawn, weight }] : [];
      });
      if (!variants.length) return null;
      const table = [{ spawn: null, weight: siteFallbackWeights[site] }, ...variants];
      const total = table.reduce((sum, entry) => sum + entry.weight, 0);
      return rollTable(table, total, random).spawn;
    },
    roamingAt(index, siteCount) {
      const first = (seed >>> 0) % siteCount;
      const offset = (index - first + siteCount) % siteCount;
      return roamingEncounters.flatMap(({ spawn, count }) => {
        // Spread the roster across existing sites before placing a pack at any one site.
        const size = Math.ceil((count - offset) / siteCount);
        return size > 0 ? [{ spawn, size }] : [];
      });
    },
    remaining,
    record(spawn, count) {
      if (Number.isFinite(spawn.maxPerDungeon)) {
        placements.set(spawn, (placements.get(spawn) ?? 0) + count);
      }
    },
  };
}
