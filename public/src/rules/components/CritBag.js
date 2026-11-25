import { defineComponent } from '../../lib/ecs-js/index.js';

export const CritBag = defineComponent('CritBag', {
  remaining: 0,
  critAt: 0,
});

const BAG_SIZE = 10;

export function drawCriticalHit(world, actorId) {
  const bag = world.get(actorId, CritBag);
  if (!bag) return false;

  if (bag.remaining === 0) {
    bag.remaining = BAG_SIZE;
    // With one critical result, picking its position is equivalent to shuffling the bag.
    bag.critAt = 1 + Math.floor(world.rand() * BAG_SIZE);
  }
  return bag.remaining-- === bag.critAt;
}
