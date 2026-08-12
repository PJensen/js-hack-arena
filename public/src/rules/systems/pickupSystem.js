// rules/systems/pickupSystem.js — walk over ground items to pick them up.
import { Position, Collider, Health, Input, GroundItem, Consumable, ItemInfo, Spellbook, MeleeWeapon, Powerups } from '../components/index.js';

export function pickupSystem(world, dt) {
  const players = [];
  for (const [id, pos, col, hp] of world.query(Position, Collider, Health, Input)) {
    if (hp.dead || hp.hp <= 0) continue;
    players.push({ id, pos, col, hp });
  }

  const toDestroy = [];
  for (const [itemId, ipos, icol, gi] of world.query(Position, Collider, GroundItem)) {
    for (const p of players) {
      const dx = p.pos.x - ipos.x, dy = p.pos.y - ipos.y;
      const dist = Math.hypot(dx, dy);
      // Generous pickup radius — player radius + item radius + 6px grace
      if (dist < p.col.radius + icol.radius + 6) {
        if (world.has(itemId, Consumable)) {
          const c = world.get(itemId, Consumable);
          const info = world.has(itemId, ItemInfo) ? world.get(itemId, ItemInfo) : null;

          if (c.effect === 'heal') {
            if (p.hp.hp >= p.hp.maxHp) continue;
            const healed = Math.min(c.potency, p.hp.maxHp - p.hp.hp);
            p.hp.hp += healed;
            world.emit('damage.dealt', {
              target: p.id, source: itemId, amount: -healed,
              x: p.pos.x, y: p.pos.y,
            });
            world.emit('item.pickup', { entity: p.id, item: info?.name, healed });
          } else if (c.effect === 'add_spell' && world.has(p.id, Spellbook)) {
            const book = world.get(p.id, Spellbook);
            const spellId = c.spellId;
            if (spellId && !book.spells.includes(spellId)) {
              book.spells.push(spellId);
            }
            world.emit('item.pickup', { entity: p.id, item: info?.name, spellId });
          } else if (c.effect === 'mana_regen' && world.has(p.id, Powerups)) {
            const powerups = world.get(p.id, Powerups);
            powerups.manaRegenMultiplier = 2.5;
            powerups.manaRegenSeconds = Math.max(powerups.manaRegenSeconds, c.potency);
            world.emit('item.pickup', { entity: p.id, item: info?.name, powerup: 'mana_regen', duration: c.potency });
          } else if (['haste', 'fury', 'ward'].includes(c.effect) && world.has(p.id, Powerups)) {
            const powerups = world.get(p.id, Powerups);
            const config = {
              haste: ['hasteMultiplier', 'hasteSeconds', 1.45],
              fury: ['furyMultiplier', 'furySeconds', 1.6],
              ward: ['wardMultiplier', 'wardSeconds', 0.5],
            }[c.effect];
            powerups[config[0]] = config[2];
            powerups[config[1]] = Math.max(powerups[config[1]], c.potency);
            world.emit('item.pickup', { entity: p.id, item: info?.name, powerup: c.effect, duration: c.potency });
          } else if (c.effect === 'melee_upgrade' && world.has(p.id, MeleeWeapon)) {
            const mw = world.get(p.id, MeleeWeapon);
            if (c.potency > mw.damage) {
              mw.damage = c.potency;
              mw.name = info?.name || mw.name;
              mw.glyph = info?.glyph || mw.glyph;
            }
            world.emit('item.pickup', { entity: p.id, item: info?.name });
          } else if (c.effect === 'epic_chest') {
            // Epic chest: emit event so index.html can roll the chest table and spawn loot
            world.emit('chest.opened', { entity: p.id, x: ipos.x, y: ipos.y });
            world.emit('item.pickup', { entity: p.id, item: info?.name });
          }
        }
        toDestroy.push(itemId);
        break;
      }
    }
  }
  for (const id of toDestroy) world.destroy(id);
}
