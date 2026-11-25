import { Collider, LootToss, Position } from '../components/index.js';
import { sweepMaxFree } from '../geometry/sweep.js';

const TOSS_SECONDS = 0.55;
const TOSS_DISTANCE = 76;
const TOSS_ANGLES = [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, Math.PI];

export function tossLoot(world, itemId, grid, openerId, {
  heading, distance = TOSS_DISTANCE, peak = LootToss.defaults.peak, rebound = false,
} = {}) {
  const origin = world.get(itemId, Position);
  const opener = world.get(openerId, Position) ?? origin;
  const direction = heading ?? Math.atan2(origin.y - opener.y, origin.x - opener.x);
  const clearance = Math.max(14, world.get(itemId, Collider).radius);
  let landingX = origin.x;
  let landingY = origin.y;
  let best = 0;
  for (const offset of TOSS_ANGLES) {
    const dx = Math.cos(direction + offset) * distance;
    const dy = Math.sin(direction + offset) * distance;
    const fraction = sweepMaxFree(grid, origin.x, origin.y, origin.x + dx, origin.y + dy, clearance);
    if (fraction <= best) continue;
    landingX = origin.x + dx * fraction;
    landingY = origin.y + dy * fraction;
    best = fraction;
    if (best === 1) break;
  }
  world.add(itemId, LootToss, { landingX, landingY, remaining: TOSS_SECONDS, peak, rebound });
}

export function lootTossSystem(world, dt) {
  for (const [id, position, toss] of world.query(Position, LootToss)) {
    if (toss.remaining <= dt + 1e-9) {
      position.x = toss.landingX;
      position.y = toss.landingY;
      world.remove(id, LootToss);
      continue;
    }
    const fraction = dt / toss.remaining;
    position.x += (toss.landingX - position.x) * fraction;
    position.y += (toss.landingY - position.y) * fraction;
    toss.remaining -= dt;
    const progress = 1 - toss.remaining / TOSS_SECONDS;
    const firstLanding = 0.72;
    const bouncing = toss.rebound && progress >= firstLanding;
    const arc = !toss.rebound ? progress : bouncing
      ? (progress - firstLanding) / (1 - firstLanding) : progress / firstLanding;
    const peak = bouncing ? toss.peak * 0.18 : toss.peak;
    toss.height = 4 * peak * arc * (1 - arc);
  }
}
