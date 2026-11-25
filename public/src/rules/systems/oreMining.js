import { Health, Input, Mining, Position, Spellbook } from '../components/index.js';
import { oreMaterialId, rollMiningGemstone } from '../data/miningMaterials.js';
import { mulberry32 } from '../geometry/caveGen.js';
import { canMineOre, isOreExposed } from '../geometry/oreSites.js';
import { sweepMaxFree } from '../geometry/sweep.js';
import { spawnItem } from '../spawner.js';
import { tossLoot } from './lootTossSystem.js';

const TARGET_RADIUS = 24;
const GEMSTONE_CHANCE = 0.20;
const ROCK_SPREAD = [-0.78, 0.57, 1.10];

function canKeepMining(input, book) {
  return Math.hypot(input.moveX, input.moveY) <= 0.1 && !input.fire && !input.cancelCast && !book.charging;
}

export function createOreMining({ seed, grid, sites }) {
  const deposits = sites.map((site, id) => ({ ...site, id }));
  const mined = new Set();
  const available = () => deposits.filter((site) => !mined.has(site.id) && isOreExposed(grid, site));

  function start(world, { id, pos, input }, x, y) {
    if (world.has(id, Mining) || !canKeepMining(input, world.get(id, Spellbook))) return;
    const site = available().find((deposit) =>
      Math.hypot(deposit.x - x, deposit.y - y) <= TARGET_RADIUS && canMineOre(grid, pos, deposit));
    if (site) world.add(id, Mining, { siteId: site.id });
  }

  function update(world, dt) {
    const finished = new Set();
    for (const [id, order, pos, health, input, book] of world.query(Mining, Position, Health, Input, Spellbook)) {
      const site = deposits[order.siteId];
      if (health.dead || health.hp <= 0 || mined.has(site.id) ||
        !canKeepMining(input, book) || !isOreExposed(grid, site) || !canMineOre(grid, pos, site)) {
        finished.add(id);
        continue;
      }
      order.remaining -= dt;
      if (order.remaining <= 1e-9) {
        finished.add(id);
        breakVein(world, id, pos, site);
      }
    }
    if (!finished.size) return;
    for (const [id, { siteId }] of world.query(Mining)) {
      if (finished.has(id) || mined.has(siteId)) world.remove(id, Mining);
    }
  }

  function breakVein(world, playerId, pos, site) {
    mined.add(site.id);

    // Keep the drops on the miner's side even when an excavated opening is too narrow to enter.
    const reach = sweepMaxFree(grid, pos.x, pos.y, site.x, site.y, 14);
    const originX = pos.x + (site.x - pos.x) * reach;
    const originY = pos.y + (site.y - pos.y) * reach;
    const heading = Math.atan2(pos.y - site.y, pos.x - site.x);
    const random = mulberry32(seed ^ Math.imul(site.id + 1, 0x5e91db));

    function drop(type, spread, distance, peak) {
      const item = spawnItem(world, originX, originY, { type });
      tossLoot(world, item, grid, playerId, { heading: heading + spread, distance, peak, rebound: true });
    }

    const ore = oreMaterialId(site.kind);
    for (const spread of ROCK_SPREAD) drop(ore, spread, 46 + random() * 24, 16 + random() * 8);
    if (random() < GEMSTONE_CHANCE) {
      drop(rollMiningGemstone(random), -1.2, 78, 28);
    }
  }

  return { deposits, available, start, update };
}
