import { Collider, Conditions, Health, Position } from '../components/index.js';
import { conditions } from '../data/conditionCatalog.js';
import { applyCondition } from '../effects.js';

export function createCampfireSystem(campfire) {
  const condition = conditions[campfire?.conditionId];
  return function campfireSystem(world) {
    if (!condition) return;
    for (const [id, position, collider, health, state] of world.query(Position, Collider, Health, Conditions)) {
      if (health.dead || health.hp <= 0) continue;
      const distance = Math.hypot(position.x - campfire.x, position.y - campfire.y);
      if (distance > campfire.contactRadius + collider.radius) continue;

      const active = state.active.find(({ id }) => id === condition.id);
      if (active) {
        // Extend the lifetime without resetting the periodic damage timer.
        active.remaining = Math.max(active.remaining, condition.duration);
        active.duration = Math.max(active.duration, condition.duration);
      } else {
        applyCondition(world, id, condition.id);
      }
    }
  };
}
