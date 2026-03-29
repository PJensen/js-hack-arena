// rules/systems/inputSystem.js — reads InputRouter, writes Input component, casts spells from Spellbook
import { Position, Velocity, Input, Collider, Projectile, Lifetime, PointLight, Spellbook } from '../components/index.js';
import { spells as spellCatalog } from '../data/spellCatalog.js';

export function createInputSystem(ctx) {
  const { inputRouter, playerId } = ctx;
  let legacyCd = 0;

  return function inputSystem(world, dt) {
    const inp = world.get(playerId, Input);
    const o = inputRouter.sample();

    inp.moveX = o.intent.moveX;
    inp.moveY = o.intent.moveY;
    inp.aimX = o.intent.aimX;
    inp.aimY = o.intent.aimY;

    // --- Spell switching ---
    const hasBook = world.has(playerId, Spellbook);
    if (hasBook) {
      const book = world.get(playerId, Spellbook);
      const count = book.spells.length;

      if (count > 0) {
        // Direct slot pick
        if (o.spellSlot !== null && o.spellSlot >= 0 && o.spellSlot < count) {
          book.activeIndex = o.spellSlot;
        }
        // Cycle
        if (o.spellCycle !== 0) {
          book.activeIndex = ((book.activeIndex + o.spellCycle) % count + count) % count;
        }

        // --- Casting ---
        book.cooldown -= dt;
        const aiming = Math.abs(inp.aimX) > 0.1 || Math.abs(inp.aimY) > 0.1;
        if (aiming && book.cooldown <= 0) {
          const spellId = book.spells[book.activeIndex];
          const spell = spellCatalog[spellId];
          if (spell) {
            book.cooldown = spell.cooldown;
            const ppos = world.get(playerId, Position);
            const angle = Math.atan2(inp.aimY, inp.aimX);

            const boltId = world.create();
            world.add(boltId, Position, {
              x: ppos.x + Math.cos(angle) * 20,
              y: ppos.y + Math.sin(angle) * 20,
            });
            world.add(boltId, Velocity, {
              vx: Math.cos(angle) * spell.speed,
              vy: Math.sin(angle) * spell.speed,
            });
            world.add(boltId, Projectile, {
              damage: spell.damage,
              owner: playerId,
              speed: spell.speed,
              piercing: false,
              trailColor: spell.trailColor,
              burstColor: spell.burstColor,
            });
            world.add(boltId, Lifetime, { ttl: spell.ttl });
            world.add(boltId, Collider, { radius: spell.radius });
            world.add(boltId, PointLight, spell.light);
          }
        }
      }
    } else {
      // Fallback: no Spellbook — legacy frost bolt behavior
      legacyCd -= dt;
      const aiming = Math.abs(inp.aimX) > 0.1 || Math.abs(inp.aimY) > 0.1;
      if (aiming && legacyCd <= 0) {
        legacyCd = 0.25;
        const ppos = world.get(playerId, Position);
        const angle = Math.atan2(inp.aimY, inp.aimX);
        const speed = 320;
        const boltId = world.create();
        world.add(boltId, Position, { x: ppos.x + Math.cos(angle) * 20, y: ppos.y + Math.sin(angle) * 20 });
        world.add(boltId, Velocity, { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed });
        world.add(boltId, Projectile, { damage: 15, owner: playerId, speed, piercing: false });
        world.add(boltId, Lifetime, { ttl: 2.0 });
        world.add(boltId, Collider, { radius: 5 });
        world.add(boltId, PointLight, { radius: 120, r: 140, g: 200, b: 255 });
      }
    }
  };
}
