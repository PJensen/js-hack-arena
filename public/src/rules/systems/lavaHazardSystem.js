import { Health, PlayerTag, Position } from '../components/index.js';
import { ConditionId } from '../data/conditionCatalog.js';
import { applyDamage, refreshCondition } from '../effects.js';
import { hasFloorCoverage } from '../geometry/floorCoverage.js';

const CONTACT_INTERVAL = 0.25;
const CONTACT_DAMAGE = 14;
const LAVA_BURN = { conditionId: ConditionId.BURNING };

export function createLavaHazardSystem(grid) {
  const nextHit = new Map();

  return function lavaHazardSystem(world, dt) {
    for (const id of nextHit.keys()) {
      if (!world.alive.has(id)) nextHit.delete(id);
    }
    for (const [id, position, health] of world.query(Position, Health, PlayerTag)) {
      if (health.dead || health.hp <= 0 || !hasFloorCoverage(grid, grid.lavaGrid, position)) {
        nextHit.delete(id);
        continue;
      }

      refreshCondition(world, id, null, LAVA_BURN);
      const remaining = (nextHit.get(id) ?? dt) - dt;
      if (remaining > 1e-9) {
        nextHit.set(id, remaining);
        continue;
      }
      applyDamage(world, id, CONTACT_DAMAGE, { damageType: 'fire', canCrit: false, periodic: true });
      nextHit.set(id, remaining + CONTACT_INTERVAL);
    }
  };
}
