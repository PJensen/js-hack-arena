// rules/systems/bumpSystem.js — push overlapping non-projectile bodies apart + melee damage
import { Position, Collider, Projectile, Health, AI, Input } from '../components/index.js';

const bumpCooldowns = new Map();  // "id1:id2" → timestamp
const BUMP_COOLDOWN = 0.5;
const BUMP_DAMAGE = 8;
let bumpTime = 0;

export function bumpSystem(world, dt) {
  bumpTime += dt;

  // Collect all collidable entities (non-projectile)
  const bodies = [];
  for (const [id, pos, col] of world.query(Position, Collider)) {
    if (world.has(id, Projectile)) continue;
    bodies.push({ id, pos, col });
  }

  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i], b = bodies[j];
      const dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y;
      const dist = Math.hypot(dx, dy);
      const overlap = a.col.radius + b.col.radius - dist;
      if (overlap <= 0) continue;

      // Push apart along collision axis
      const nx = dist > 0.01 ? dx / dist : 1;
      const ny = dist > 0.01 ? dy / dist : 0;
      const push = overlap * 0.5;
      a.pos.x -= nx * push;
      a.pos.y -= ny * push;
      b.pos.x += nx * push;
      b.pos.y += ny * push;

      // Melee damage on bump
      const aIsPlayer = world.has(a.id, Input);
      const bIsPlayer = world.has(b.id, Input);
      const aIsMob = world.has(a.id, AI);
      const bIsMob = world.has(b.id, AI);

      if ((aIsPlayer && bIsMob) || (bIsPlayer && aIsMob)) {
        const key = Math.min(a.id, b.id) + ':' + Math.max(a.id, b.id);
        const lastHit = bumpCooldowns.get(key) || 0;
        if (bumpTime - lastHit >= BUMP_COOLDOWN) {
          bumpCooldowns.set(key, bumpTime);

          // Damage the player (mobs do melee damage to player on contact)
          const playerId = aIsPlayer ? a.id : b.id;
          const mobId = aIsMob ? a.id : b.id;
          const playerHp = world.get(playerId, Health);
          if (playerHp) {
            playerHp.hp = Math.max(0, playerHp.hp - BUMP_DAMAGE);
            const ppos = world.get(playerId, Position);
            world.emit('damage.dealt', { target: playerId, source: mobId, amount: BUMP_DAMAGE, x: ppos.x, y: ppos.y });
          }
        }
      }
    }
  }
}
