// rules/systems/projectileSystem.js — move projectiles, trail particles, hit detection, wall collision
import { Position, Velocity, Projectile, Lifetime, Collider, Health, AI } from '../components/index.js';

export function createProjectileSystem(ctx) {
  const { grid, fx, fxCatalog } = ctx;

  return function projectileSystem(world, dt) {
    const toDestroy = [];
    const origins = [];

    // Collect hittable entities (non-projectile, has Health)
    const targets = [];
    for (const [id, pos, col, hp] of world.query(Position, Collider, Health)) {
      targets.push({ id, pos, col, hp });
    }

    for (const [id, pos, vel, proj, lt, col] of world.query(Position, Velocity, Projectile, Lifetime, Collider)) {
      // Move
      pos.x += vel.vx * dt;
      pos.y += vel.vy * dt;

      // Trail particles — use AI check on owner to determine trail type
      const isEnemyBolt = world.alive.has(proj.owner) && world.has(proj.owner, AI);
      const trail = isEnemyBolt ? fxCatalog.SHADOW_TRAIL : fxCatalog.FROST_TRAIL;
      fx.ensureEmitter('bolt:' + id, trail);
      origins.push({ key: 'bolt:' + id, x: pos.x, y: pos.y, vx: vel.vx * 0.1, vy: vel.vy * 0.1 });

      // Entity hit detection
      let hit = false;
      for (const t of targets) {
        if (t.id === proj.owner) continue;  // can't hit owner
        const dx = t.pos.x - pos.x, dy = t.pos.y - pos.y;
        const dist = Math.hypot(dx, dy);
        if (dist < col.radius + t.col.radius) {
          // Apply damage
          t.hp.hp = Math.max(0, t.hp.hp - proj.damage);

          // Impact burst
          const burstColor = isEnemyBolt ? '#d0a0ff' : '#b0e0ff';
          const burst = fx.ensureEmitter('hit:' + id, {
            continuous: false, burstCount: 15,
            angle: Math.atan2(dy, dx), spread: Math.PI * 0.5,
            speed: 60, speedJitter: 0.5,
            ax: 0, ay: 0,
            life: 0.3, lifeJitter: 0.3,
            size: 4, sizeEnd: 1,
            color: burstColor,
            alpha0: 0.9, alpha1: 0.0,
          });
          burst.step(fx.pool, dt, pos.x, pos.y);

          fx.removeEmitter('bolt:' + id);
          toDestroy.push(id);
          hit = true;
          break;
        }
      }
      if (hit) continue;

      // Wall collision
      if (grid.distanceMove(pos.x, pos.y) < col.radius) {
        const burstColor = isEnemyBolt ? '#d0a0ff' : '#b0e0ff';
        const burst = fx.ensureEmitter('wallhit:' + id, {
          continuous: false, burstCount: 20,
          angle: 0, spread: Math.PI,
          speed: 50, speedJitter: 0.6,
          ax: 0, ay: 0,
          life: 0.35, lifeJitter: 0.4,
          size: 5, sizeEnd: 1,
          color: burstColor,
          alpha0: 0.9, alpha1: 0.0,
        });
        burst.step(fx.pool, dt, pos.x, pos.y);
        fx.removeEmitter('bolt:' + id);
        toDestroy.push(id);
        continue;
      }

      lt.ttl -= dt;
      if (lt.ttl <= 0) {
        fx.removeEmitter('bolt:' + id);
        toDestroy.push(id);
      }
    }

    fx.step(dt, origins);
    for (const id of toDestroy) {
      fx.removeEmitter('bolt:' + id);
      world.destroy(id);
    }
  };
}
