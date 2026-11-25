import { Collider, LootToss, Position } from '../components/index.js';
import { sweepMaxFree } from '../geometry/sweep.js';

const TOSS_SECONDS = 0.55;
const TOSS_DISTANCE = 76;
const TOSS_HEIGHT = 30;
const TOSS_ANGLES = [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, Math.PI];

export function tossLoot(world, itemId, grid, openerId) {
  const origin = world.get(itemId, Position);
  const opener = world.get(openerId, Position) ?? origin;
  const heading = Math.atan2(origin.y - opener.y, origin.x - opener.x);
  const clearance = Math.max(14, world.get(itemId, Collider).radius);
  let landingX = origin.x;
  let landingY = origin.y;
  let best = 0;
  for (const offset of TOSS_ANGLES) {
    const dx = Math.cos(heading + offset) * TOSS_DISTANCE;
    const dy = Math.sin(heading + offset) * TOSS_DISTANCE;
    const fraction = sweepMaxFree(grid, origin.x, origin.y, origin.x + dx, origin.y + dy, clearance);
    if (fraction <= best) continue;
    landingX = origin.x + dx * fraction;
    landingY = origin.y + dy * fraction;
    best = fraction;
    if (best === 1) break;
  }
  world.add(itemId, LootToss, { landingX, landingY, remaining: TOSS_SECONDS });
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
    toss.height = 4 * TOSS_HEIGHT * progress * (1 - progress);
  }
}
