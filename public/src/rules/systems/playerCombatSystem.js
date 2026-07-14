import {
  AI,
  Collider,
  Health,
  Input,
  PlayerTag,
  Position,
  Projectile,
  Lifetime,
  Spellbook,
  Velocity,
} from '../components/index.js';
import { spells as spellCatalog } from '../data/spellCatalog.js';

export function createPlayerCombatSystem({ grid }) {
  return function playerCombatSystem(world, dt) {
    for (const [playerId, , input, book, position] of world.query(
      PlayerTag,
      Input,
      Spellbook,
      Position,
    )) {
      book.cooldown = Math.max(0, book.cooldown - dt);
      const aiming = Math.abs(input.aimX) > 0.1 || Math.abs(input.aimY) > 0.1;
      if (!input.fire || !aiming || book.cooldown > 0 || book.spells.length === 0) continue;

      const spellId = book.spells[book.activeIndex];
      const spell = spellCatalog[spellId];
      if (!spell) continue;

      const angle = Math.atan2(input.aimY, input.aimX);
      if (spell.type === 'bolt') {
        if (!castChainBolt(world, grid, playerId, position, spell)) continue;
      } else {
        spawnSpellProjectile(world, playerId, position, angle, spell);
      }
      book.cooldown = spell.cooldown;
      world.emit('spell.cast', { playerId, spellId, x: position.x, y: position.y, angle });
    }
  };
}

function castChainBolt(world, grid, playerId, position, spell) {
  const candidates = [];
  for (const [id, targetPosition, health] of world.query(Position, Health, AI)) {
    const distance = Math.hypot(targetPosition.x - position.x, targetPosition.y - position.y);
    if (distance <= spell.range && hasLineOfSight(grid, position.x, position.y, targetPosition.x, targetPosition.y)) {
      candidates.push({ id, position: targetPosition, health, distance });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance || a.id - b.id);
  if (candidates.length === 0) return false;

  const hit = new Set();
  let fromX = position.x;
  let fromY = position.y;
  for (let chain = 0; chain < (spell.maxTargets || 1); chain++) {
    let best = null;
    let bestDistance = chain === 0 ? spell.range : spell.chainRadius;
    for (const candidate of candidates) {
      if (hit.has(candidate.id)) continue;
      const distance = Math.hypot(candidate.position.x - fromX, candidate.position.y - fromY);
      if (distance <= bestDistance && hasLineOfSight(grid, fromX, fromY, candidate.position.x, candidate.position.y)) {
        best = candidate;
        bestDistance = distance;
      }
    }
    if (!best) break;

    hit.add(best.id);
    const damage = Math.round(spell.damage * Math.pow(0.7, chain));
    best.health.hp = Math.max(0, best.health.hp - damage);
    world.emit('spell.bolt', {
      source: playerId,
      target: best.id,
      fromX,
      fromY,
      toX: best.position.x,
      toY: best.position.y,
      chain,
    });
    world.emit('damage.dealt', {
      target: best.id,
      source: playerId,
      amount: damage,
      x: best.position.x,
      y: best.position.y,
    });
    fromX = best.position.x;
    fromY = best.position.y;
  }
  return hit.size > 0;
}

function spawnSpellProjectile(world, playerId, position, angle, spell) {
  const projectileId = world.create();
  world.add(projectileId, Position, {
    x: position.x + Math.cos(angle) * 20,
    y: position.y + Math.sin(angle) * 20,
  });
  world.add(projectileId, Velocity, {
    vx: Math.cos(angle) * spell.speed,
    vy: Math.sin(angle) * spell.speed,
  });
  world.add(projectileId, Projectile, {
    damage: spell.damage,
    owner: playerId,
    team: 'players',
    speed: spell.speed,
    piercing: false,
    trailColor: spell.trailColor,
    burstColor: spell.burstColor,
  });
  world.add(projectileId, Lifetime, { ttl: spell.ttl });
  world.add(projectileId, Collider, { radius: spell.radius });
}

function hasLineOfSight(grid, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const distance = Math.hypot(dx, dy);
  const steps = Math.ceil(distance / (grid.cellSize * 2));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (grid.distanceMove(ax + dx * t, ay + dy * t) < 6) return false;
  }
  return true;
}
