import { Health, MaterialStacks, Position } from './components/index.js';
import { sweepMaxFree } from './geometry/sweep.js';

export const CampAction = Object.freeze({ DEPOSIT: 'deposit', EXIT: 'exit' });

export function inCampReach(grid, position, site) {
  return !!position && !!site && Math.hypot(position.x - site.x, position.y - site.y) <= 42 &&
    sweepMaxFree(grid, position.x, position.y, site.x, site.y, 2) === 1;
}

export function checkCampAction({ world, player, grid, camp, action, pending }) {
  const health = world.get(player, Health);
  if (!health || !camp) return 'Camp is unavailable.';
  const dead = health.dead || health.hp <= 0;
  const position = world.get(player, Position);
  const stacks = world.get(player, MaterialStacks);
  const carrying = Object.values(stacks.counts).some((count) => count > 0);

  if (action === CampAction.DEPOSIT) {
    if (dead || !inCampReach(grid, position, camp.bank)) return 'Walk up to the camp chest to deposit.';
    if (pending) return 'Your deposit is still saving.';
    if (!carrying) return 'Your pack has no loot to deposit.';
  } else if (action === CampAction.EXIT) {
    if (!dead && !inCampReach(grid, position, camp.portal)) return 'Walk up to the camp portal to leave.';
    if (pending) return 'Wait for your deposit to finish saving.';
    if (!dead && carrying) return 'Deposit your loot in the camp chest first.';
  } else {
    return 'Unknown camp action.';
  }
  return null;
}
