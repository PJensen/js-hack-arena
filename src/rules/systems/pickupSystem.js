// rules/systems/pickupSystem.js — walk over ground items to pick them up.
import { Position, Collider, Health, Input, GroundItem, Consumable, ItemInfo } from '../components/index.js';

export function pickupSystem(world, dt) {
  // Collect players (entities with Input)
  const players = [];
  for (const [id, pos, col, hp] of world.query(Position, Collider, Health, Input)) {
    players.push({ id, pos, col, hp });
  }

  // Check ground items for overlap with players
  const toDestroy = [];
  for (const [itemId, ipos, icol, gi] of world.query(Position, Collider, GroundItem)) {
    for (const p of players) {
      const dx = p.pos.x - ipos.x, dy = p.pos.y - ipos.y;
      const dist = Math.hypot(dx, dy);
      if (dist < p.col.radius + icol.radius) {
        // Consume the item
        if (world.has(itemId, Consumable)) {
          const c = world.get(itemId, Consumable);
          if (c.effect === 'heal') {
            p.hp.hp = Math.min(p.hp.maxHp, p.hp.hp + c.potency);
            world.emit('damage.dealt', {
              target: p.id, source: itemId, amount: -c.potency,
              x: p.pos.x, y: p.pos.y,
            });
          }
        }
        toDestroy.push(itemId);
        break;
      }
    }
  }
  for (const id of toDestroy) world.destroy(id);
}
