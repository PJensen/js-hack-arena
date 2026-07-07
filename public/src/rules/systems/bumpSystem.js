// rules/systems/bumpSystem.js — push overlapping bodies apart + bidirectional melee
import { Position, Collider, Projectile, Health, AI, Input, MeleeWeapon, GroundItem } from '../components/index.js';

const bumpCooldowns = new Map();
const BUMP_COOLDOWN = 0.4;
const BASE_DAMAGE = 5;  // fists
let bumpTime = 0;

export function bumpSystem(world, dt) {
  bumpTime += dt;

  const bodies = [];
  for (const [id, pos, col] of world.query(Position, Collider)) {
    if (world.has(id, Projectile)) continue;
    if (world.has(id, GroundItem)) continue;
    bodies.push({ id, pos, col });
  }

  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i], b = bodies[j];
      const dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y;
      const dist = Math.hypot(dx, dy);
      const overlap = a.col.radius + b.col.radius - dist;
      if (overlap <= 0) continue;

      // Push apart
      const nx = dist > 0.01 ? dx / dist : 1;
      const ny = dist > 0.01 ? dy / dist : 0;
      const push = overlap * 0.5;
      a.pos.x -= nx * push;
      a.pos.y -= ny * push;
      b.pos.x += nx * push;
      b.pos.y += ny * push;

      // Melee — only between player and mob
      const aIsPlayer = world.has(a.id, Input);
      const bIsPlayer = world.has(b.id, Input);
      const aIsMob = world.has(a.id, AI);
      const bIsMob = world.has(b.id, AI);
      if (!((aIsPlayer && bIsMob) || (bIsPlayer && aIsMob))) continue;

      const key = Math.min(a.id, b.id) + ':' + Math.max(a.id, b.id);
      const lastHit = bumpCooldowns.get(key) || 0;
      if (bumpTime - lastHit < BUMP_COOLDOWN) continue;
      bumpCooldowns.set(key, bumpTime);

      const pId = aIsPlayer ? a.id : b.id;
      const mId = aIsMob ? a.id : b.id;

      // Mob hits player
      const pHp = world.get(pId, Health);
      if (pHp) {
        const mobDmg = world.has(mId, MeleeWeapon) ? world.get(mId, MeleeWeapon).damage : BASE_DAMAGE;
        pHp.hp = Math.max(0, pHp.hp - mobDmg);
        world.emit('damage.dealt', { target: pId, source: mId, amount: mobDmg, x: a.pos.x, y: a.pos.y });
      }

      // Player hits mob
      const mHp = world.get(mId, Health);
      if (mHp) {
        const plrDmg = world.has(pId, MeleeWeapon) ? world.get(pId, MeleeWeapon).damage : BASE_DAMAGE;
        mHp.hp = Math.max(0, mHp.hp - plrDmg);
        world.emit('damage.dealt', { target: mId, source: pId, amount: plrDmg, x: b.pos.x, y: b.pos.y });
      }
    }
  }
}
