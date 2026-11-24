// Body separation and contact melee. Mutable cooldown state is scoped to one
// simulation instance, never shared between rooms.
import { Actor, AI, AIBehavior, Collider, Conditions, GroundItem, Health, MeleeWeapon, PlayerTag, Position, Powerups, Projectile } from '../components/index.js';
import { applyCondition, applyDamage } from '../effects.js';

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
  if (overlap < -2) return;

  const aPlayer = world.has(a.id, PlayerTag);
  const bPlayer = world.has(b.id, PlayerTag);
  const aAI = world.get(a.id, AI);
  const bAI = world.get(b.id, AI);
  const contactMelee = (aPlayer && bAI) || (bPlayer && aAI);
  const plantedContact = contactMelee?.plantAtContact;
  if (!plantedContact) {
    if (overlap <= 0) return;
    const nx = distance > 0.01 ? dx / distance : 1;
    const ny = distance > 0.01 ? dy / distance : 0;
    const push = overlap * 0.5;
    a.position.x -= nx * push;
    a.position.y -= ny * push;
    b.position.x += nx * push;
    b.position.y += ny * push;
  }
  if (!contactMelee) return;

  const key = Math.min(a.id, b.id) + ':' + Math.max(a.id, b.id);
  if (time - (cooldowns.get(key) ?? -Infinity) < BUMP_COOLDOWN) return;
  cooldowns.set(key, time);

  const playerId = aPlayer ? a.id : b.id;
  const mobId = aAI ? a.id : b.id;
  if (contactMelee.behavior !== AIBehavior.PASSIVE && contactMelee.behavior !== AIBehavior.BAT) {
    dealDamage(world, mobId, playerId, positionOf(aPlayer ? a : b));
  }
  dealDamage(world, playerId, mobId, positionOf(aAI ? a : b));
}

function dealDamage(world, sourceId, targetId, position) {
  const health = world.get(targetId, Health);
  if (!health) return;
  const weapon = world.get(sourceId, MeleeWeapon);
  let damage = weapon?.damage ?? BASE_DAMAGE;
  damage = Math.max(1, Math.round(damage * (world.get(sourceId, Powerups)?.furyMultiplier || 1)));
  damage = applyDamage(world, targetId, damage, {
    sourceId, x: position.x, y: position.y, damageType: 'physical',
  });
  const conditionId = weapon?.conditionId;
  let appliedCondition = false;
  if (damage > 0 && health.hp > 0 && conditionId) {
    const active = world.get(targetId, Conditions)?.active;
    if (!active?.some((condition) => condition.id === conditionId)) {
      appliedCondition = applyCondition(world, targetId, conditionId, sourceId);
    }
  }
  world.emit('melee.hit', {
    target: targetId,
    source: sourceId,
    sourceTheme: world.get(sourceId, Actor)?.theme ?? null,
    amount: damage,
    x: position.x,
    y: position.y,
    fromX: world.get(sourceId, Position)?.x ?? position.x,
    fromY: world.get(sourceId, Position)?.y ?? position.y,
    ...(appliedCondition && { conditionId }),
  });
}

function positionOf(body) {
  return body.position;
}
