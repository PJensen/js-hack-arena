// Authoritative projectile motion, collision, damage, and lifetime. Rendering
// and particles observe the emitted facts on the client.
import { AI, Collider, Health, Lifetime, PlayerTag, Position, Projectile, Velocity } from '../components/index.js';
import { applyDamage } from '../effects.js';
import { applyImpacts } from '../impacts.js';

export function createProjectileSystem({ grid, carve = null }) {
  return function projectileSystem(world, dt) {
    const targets = [];
    for (const [id, position, collider, health] of world.query(Position, Collider, Health)) {
      if (health.dead) continue;
      targets.push({ id, position, collider, health, team: teamOf(world, id) });
    }

    const destroy = new Set();
    for (const [id, position, velocity, projectile, lifetime, collider] of world.query(
      Position,
      Velocity,
      Projectile,
      Lifetime,
      Collider,
    )) {
      position.x += velocity.vx * dt;
      position.y += velocity.vy * dt;
      const projectileTeam = projectile.team || teamOf(world, projectile.owner);

      for (const target of targets) {
        if (target.id === projectile.owner || target.team === projectileTeam) continue;
        const dx = target.position.x - position.x;
        const dy = target.position.y - position.y;
        const radius = collider.radius + target.collider.radius;
        if (dx * dx + dy * dy >= radius * radius) continue;

        if (projectile.impacts?.length) {
          applyImpacts(world, target.id, projectile.owner, projectile.impacts, {
            x: position.x, y: position.y, damageType: projectile.style,
            spellId: projectile.spellId,
          });
        } else {
          applyDamage(world, target.id, projectile.damage, {
            sourceId: projectile.owner, x: position.x, y: position.y, damageType: projectile.style,
          });
        }
        world.emit('projectile.hit', {
          projectile: id,
          target: target.id,
          x: position.x,
          y: position.y,
          vx: velocity.vx,
          vy: velocity.vy,
          color: projectile.burstColor,
          style: projectile.style,
        });
        if (!projectile.piercing) destroy.add(id);
        break;
      }
      if (destroy.has(id)) continue;

      if (grid.distanceMove(position.x, position.y) < collider.radius) {
        const radius = projectile.style === 'arrow' ? 0 : projectile.damage * 0.5;
        if (carve && radius > 0) carve(position.x, position.y, radius);
        world.emit('projectile.wall', {
          projectile: id,
          x: position.x,
          y: position.y,
          vx: velocity.vx,
          vy: velocity.vy,
          radius,
          color: projectile.burstColor,
          style: projectile.style,
        });
        if (carve && radius > 0) world.emit('terrain.carved', { x: position.x, y: position.y, radius });
        destroy.add(id);
        continue;
      }

      lifetime.ttl -= dt;
      if (lifetime.ttl <= 0) {
        world.emit('projectile.expired', { projectile: id, x: position.x, y: position.y });
        destroy.add(id);
      }
    }

    for (const id of destroy) world.destroy(id);
  };
}

function teamOf(world, id) {
  if (id != null && world.alive.has(id)) {
    if (world.has(id, PlayerTag)) return 'players';
    if (world.has(id, AI)) return 'enemies';
  }
  return 'neutral';
}
