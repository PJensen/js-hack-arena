// rules/systems/pickupSystem.js — walk over ground items to pick them up.
import { Position, Collider, Health, Input, GroundItem, Consumable, ItemInfo, Spellbook } from '../components/index.js';

export function pickupSystem(world, dt) {
  const players = [];
  for (const [id, pos, col, hp] of world.query(Position, Collider, Health, Input)) {
    players.push({ id, pos, col, hp });
  }

  const toDestroy = [];
  for (const [itemId, ipos, icol, gi] of world.query(Position, Collider, GroundItem)) {
    for (const p of players) {
      const dx = p.pos.x - ipos.x, dy = p.pos.y - ipos.y;
      const dist = Math.hypot(dx, dy);
      if (dist < p.col.radius + icol.radius) {
        if (world.has(itemId, Consumable)) {
          const c = world.get(itemId, Consumable);
          const info = world.has(itemId, ItemInfo) ? world.get(itemId, ItemInfo) : null;

          if (c.effect === 'heal') {
            p.hp.hp = Math.min(p.hp.maxHp, p.hp.hp + c.potency);
            world.emit('damage.dealt', {
              target: p.id, source: itemId, amount: -c.potency,
              x: p.pos.x, y: p.pos.y,
            });
          } else if (c.effect === 'add_spell' && world.has(p.id, Spellbook)) {
            // Add a spell based on item name
            const book = world.get(p.id, Spellbook);
            const spellId = info && info.name === 'Short Bow' ? 'arrow' : null;
            if (spellId && !book.spells.includes(spellId)) {
              book.spells.push(spellId);
              world.emit('item.pickup', { entity: p.id, item: info?.name, spellId });
            }
          }
        }
        toDestroy.push(itemId);
        break;
      }
    }
  }
  for (const id of toDestroy) world.destroy(id);
}
