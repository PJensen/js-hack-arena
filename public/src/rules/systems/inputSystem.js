// rules/systems/inputSystem.js — reads InputRouter, writes Input component, casts spells from Spellbook
import { Position, Velocity, Input, Collider, Projectile, Lifetime, PointLight, Spellbook, Health, AI } from '../components/index.js';
import { spells as spellCatalog } from '../data/spellCatalog.js';

/** LOS check on grid — true if path is clear. */
function hasLOS(grid, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const dist = Math.hypot(dx, dy);
  const steps = Math.ceil(dist / (grid.cellSize * 2));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (grid.distanceMove(ax + dx * t, ay + dy * t) < 6) return false;
  }
  return true;
}

export function createInputSystem(ctx) {
  const { inputRouter, playerId, grid } = ctx;

  return function inputSystem(world, dt) {
    const inp = world.get(playerId, Input);
    const o = ctx._lastInput || inputRouter.getOutput();

    inp.moveX = o.intent.moveX;
    inp.moveY = o.intent.moveY;
    inp.aimX = o.intent.aimX;
    inp.aimY = o.intent.aimY;

    if (!world.has(playerId, Spellbook)) return;
    const book = world.get(playerId, Spellbook);
    const count = book.spells.length;
    if (count === 0) return;

    // Spell switching
    if (o.spellSlot !== null && o.spellSlot >= 0 && o.spellSlot < count) {
      book.activeIndex = o.spellSlot;
    }
    if (o.spellCycle !== 0) {
      book.activeIndex = ((book.activeIndex + o.spellCycle) % count + count) % count;
    }

    // Casting
    book.cooldown -= dt;
    const aiming = Math.abs(inp.aimX) > 0.1 || Math.abs(inp.aimY) > 0.1;
    if (!aiming || book.cooldown > 0) return;

    const spellId = book.spells[book.activeIndex];
    const spell = spellCatalog[spellId];
    if (!spell) return;

    book.cooldown = spell.cooldown;
    const ppos = world.get(playerId, Position);
    const angle = Math.atan2(inp.aimY, inp.aimX);

    if (spell.type === 'bolt') {
      // ── Lightning bolt: instant chain, no projectile ──
      // Find targets — hostile entities with Health + AI, sorted by distance
      const candidates = [];
      for (const [id, tpos, hp] of world.query(Position, Health, AI)) {
        const dx = tpos.x - ppos.x, dy = tpos.y - ppos.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= spell.range && hasLOS(grid, ppos.x, ppos.y, tpos.x, tpos.y)) {
          candidates.push({ id, x: tpos.x, y: tpos.y, dist, hp });
        }
      }
      candidates.sort((a, b) => a.dist - b.dist);

      if (candidates.length === 0) return;  // no targets in range

      const hit = new Set();
      let fromX = ppos.x, fromY = ppos.y;
      const maxChain = spell.maxTargets || 3;

      for (let chain = 0; chain < maxChain; chain++) {
        // Find nearest un-hit target from current position
        let best = null, bestDist = spell.chainRadius || spell.range;
        for (const c of candidates) {
          if (hit.has(c.id)) continue;
          const d = Math.hypot(c.x - fromX, c.y - fromY);
          if (d < bestDist && (chain === 0 || hasLOS(grid, fromX, fromY, c.x, c.y))) {
            best = c; bestDist = d;
          }
        }
        if (!best) break;

        hit.add(best.id);

        // Damage (attenuates per chain: 70% per hop)
        const dmg = Math.round(spell.damage * Math.pow(0.7, chain));
        best.hp.hp = Math.max(0, best.hp.hp - dmg);

        // Emit bolt event for visual FX
        world.emit('spell:bolt', { fromX, fromY, toX: best.x, toY: best.y, chain });
        world.emit('damage.dealt', { target: best.id, source: playerId, amount: dmg, x: best.x, y: best.y });

        // Temporary SDF light at impact — feeds into the grid torch pass
        const flashId = world.create();
        world.add(flashId, Position, { x: best.x, y: best.y });
        world.add(flashId, PointLight, { radius: 160, r: 255, g: 240, b: 140 });
        world.add(flashId, Lifetime, { ttl: 0.2 });

        fromX = best.x;
        fromY = best.y;
      }
    } else {
      // ── Projectile spell (frost bolt etc) ──
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
  };
}
