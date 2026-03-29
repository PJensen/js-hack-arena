// rules/systems/projectileSystem.js — move projectiles, trail particles, hit detection, wall collision
import { Position, Velocity, Projectile, Lifetime, Collider, Health, AI } from '../components/index.js';
import { FROST_TRAIL, SHADOW_TRAIL, ARROW_TRAIL, spellTrail } from '../data/fxCatalog.js';

// Cache spell trails by color to avoid per-frame allocation
const _trailCache = new Map();
function cachedTrail(color) {
  let t = _trailCache.get(color);
  if (!t) { t = spellTrail(color); _trailCache.set(color, t); }
  return t;
}

// Reusable origin object to reduce GC pressure
const _origin = { key: '', x: 0, y: 0, vx: 0, vy: 0 };

export function createProjectileSystem(ctx) {
  const { grid, fx } = ctx;

  return function projectileSystem(world, dt) {
    const toDestroy = [];
    const origins = [];

    // Collect hittable entities — reuse across projectiles
    const targets = [];
    for (const [id, pos, col, hp] of world.query(Position, Collider, Health)) {
      targets.push({ id, pos, col, hp });
    }

    for (const [id, pos, vel, proj, lt, col] of world.query(Position, Velocity, Projectile, Lifetime, Collider)) {
      pos.x += vel.vx * dt;
      pos.y += vel.vy * dt;

      // Trail — skip for arrows (physical projectile, no magic particles)
      const isArrow = proj.trailColor === '#c8a050';
      const isEnemyBolt = world.alive.has(proj.owner) && world.has(proj.owner, AI);
      const key = 'b' + id;

      if (!isArrow) {
        const trail = proj.trailColor ? cachedTrail(proj.trailColor) : (isEnemyBolt ? SHADOW_TRAIL : FROST_TRAIL);
        fx.ensureEmitter(key, trail);
        origins.push({ key, x: pos.x, y: pos.y, vx: vel.vx * 0.1, vy: vel.vy * 0.1 });
      }

      // Hit detection
      let hit = false;
      for (let ti = 0; ti < targets.length; ti++) {
        const t = targets[ti];
        if (t.id === proj.owner) continue;
        const dx = t.pos.x - pos.x, dy = t.pos.y - pos.y;
        const d2 = dx * dx + dy * dy;
        const minDist = col.radius + t.col.radius;
        if (d2 < minDist * minDist) {
          t.hp.hp = Math.max(0, t.hp.hp - proj.damage);
          world.emit('damage.dealt', { target: t.id, source: proj.owner, amount: proj.damage, x: pos.x, y: pos.y });

          // Inline burst — spawn particles directly, skip emitter overhead
          const burstColor = proj.burstColor || (isEnemyBolt ? '#d0a0ff' : '#b0e0ff');
          const angle = Math.atan2(dy, dx);
          _spawnBurst(fx.pool, pos.x, pos.y, burstColor, angle, 10);

          fx.removeEmitter(key);
          toDestroy.push(id);
          hit = true;
          break;
        }
      }
      if (hit) continue;

      // Wall collision
      if (grid.distanceMove(pos.x, pos.y) < col.radius) {
        const burstColor = proj.burstColor || (isEnemyBolt ? '#d0a0ff' : '#b0e0ff');
        _spawnBurst(fx.pool, pos.x, pos.y, burstColor, 0, 12);
        fx.removeEmitter(key);
        toDestroy.push(id);
        continue;
      }

      lt.ttl -= dt;
      if (lt.ttl <= 0) {
        fx.removeEmitter(key);
        toDestroy.push(id);
      }
    }

    // Clear targets for next frame
    targets.length = 0;

    fx.step(dt, origins);
    for (const id of toDestroy) {
      fx.removeEmitter('b' + id);
      world.destroy(id);
    }
  };
}

// Inline burst — spawn particles directly into pool, no emitter allocation
import { Particle } from '../../display/passes/vfx/particles/particlePool.js';

function _hexRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

const _burstColorCache = new Map();

function _spawnBurst(pool, x, y, color, baseAngle, count) {
  let rgb = _burstColorCache.get(color);
  if (!rgb) { rgb = _hexRgb(color); _burstColorCache.set(color, rgb); }

  for (let i = 0; i < count; i++) {
    const angle = baseAngle + (Math.random() - 0.5) * Math.PI;
    const speed = 30 + Math.random() * 40;
    pool.spawn(new Particle({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      ax: 0, ay: 0,
      life: 0.2 + Math.random() * 0.15,
      size0: 3, size1: 0.5,
      r: rgb.r, g: rgb.g, b: rgb.b,
      a0: 0.8, a1: 0,
    }));
  }
}
