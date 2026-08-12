// Body separation and contact melee. Mutable cooldown state is scoped to one
// simulation instance, never shared between rooms.
import { AI, Collider, GroundItem, Health, MeleeWeapon, PlayerTag, Position, Powerups, Projectile } from '../components/index.js';
import { applyDamage } from '../effects.js';

const BUMP_COOLDOWN = 0.4;
const BASE_DAMAGE = 5;

export function createBumpSystem() {
  const cooldowns = new Map();
  let time = 0;

  return function bumpSystem(world, dt) {
    time += dt;
    for (const [key, lastHit] of cooldowns) {
      if (time - lastHit > BUMP_COOLDOWN * 4) cooldowns.delete(key);
    }
    const bodies = [];
    for (const [id, position, collider] of world.query(Position, Collider)) {
      if (world.has(id, Projectile) || world.has(id, GroundItem)) continue;
      const health = world.get(id, Health);
      if (health?.dead || health?.hp <= 0) continue;
      bodies.push({ id, position, collider });
    }

    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        resolvePair(world, bodies[i], bodies[j], cooldowns, time);
      }
    }
  };
}

function resolvePair(world, a, b, cooldowns, time) {
  const dx = b.position.x - a.position.x;
  const dy = b.position.y - a.position.y;
  const distance = Math.hypot(dx, dy);
  const overlap = a.collider.radius + b.collider.radius - distance;
  if (overlap <= 0) return;

  const nx = distance > 0.01 ? dx / distance : 1;
  const ny = distance > 0.01 ? dy / distance : 0;
  const push = overlap * 0.5;
  a.position.x -= nx * push;
  a.position.y -= ny * push;
  b.position.x += nx * push;
  b.position.y += ny * push;

  const aPlayer = world.has(a.id, PlayerTag);
  const bPlayer = world.has(b.id, PlayerTag);
  const aMob = world.has(a.id, AI);
  const bMob = world.has(b.id, AI);
  if (!((aPlayer && bMob) || (bPlayer && aMob))) return;

  const key = Math.min(a.id, b.id) + ':' + Math.max(a.id, b.id);
  if (time - (cooldowns.get(key) ?? -Infinity) < BUMP_COOLDOWN) return;
  cooldowns.set(key, time);

  const playerId = aPlayer ? a.id : b.id;
  const mobId = aMob ? a.id : b.id;
  dealDamage(world, mobId, playerId, positionOf(aPlayer ? a : b));
  dealDamage(world, playerId, mobId, positionOf(aMob ? a : b));
}

function dealDamage(world, sourceId, targetId, position) {
  const health = world.get(targetId, Health);
  if (!health) return;
  let damage = world.has(sourceId, MeleeWeapon)
    ? world.get(sourceId, MeleeWeapon).damage
    : BASE_DAMAGE;
  damage = Math.max(1, Math.round(damage * (world.get(sourceId, Powerups)?.furyMultiplier || 1)));
  damage = applyDamage(world, targetId, damage, {
    sourceId, x: position.x, y: position.y, damageType: 'physical',
  });
  world.emit('melee.hit', {
    target: targetId,
    source: sourceId,
    amount: damage,
    x: position.x,
    y: position.y,
    fromX: world.get(sourceId, Position)?.x ?? position.x,
    fromY: world.get(sourceId, Position)?.y ?? position.y,
  });
}

function positionOf(body) {
  return body.position;
}
