// Client-owned presentation derived from authoritative projectile entities and
// gameplay events. Nothing in this module can affect combat state.
import { ActorKind, PointLight, Position, Projectile, Velocity } from '../../rules/components/index.js';
import {
  ARROW_TRAIL,
  FROST_TRAIL,
  SHADOW_TRAIL,
  deathBurst,
  impactBurst,
  spellTrail,
  wallBurst,
} from '../../rules/data/fxCatalog.js';

export function createProjectileFxController({ world, fx, runtimeEvents }) {
  const activeTrails = new Set();

  world.on('projectile.hit', (event) => burst(event, impactBurst(event.color, Math.atan2(event.vy, event.vx))));
  world.on('projectile.wall', (event) => burst(event, wallBurst(event.color)));
  world.on('entity.died', (event) => {
    if (event.kind === ActorKind.MOB) burst(event, deathBurst('#a050ff'));
  });
  world.on('spell.cast', () => {
    runtimeEvents.casts += 1;
  });

  function burst(event, preset) {
    const key = `burst:${event.sequence ?? performance.now()}:${event.x}:${event.y}`;
    const emitter = fx.ensureEmitter(key, preset);
    emitter.step(fx.pool, 0, event.x, event.y);
    fx.removeEmitter(key);
  }

  function step(dt) {
    const current = new Set();
    const origins = [];
    for (const [id, position, velocity, projectile] of world.query(Position, Velocity, Projectile)) {
      const key = `projectile:${id}`;
      current.add(key);
      if (!activeTrails.has(key)) {
        fx.ensureEmitter(key, trailFor(projectile));
        activeTrails.add(key);
      }
      if (!world.has(id, PointLight) && projectile.trailColor !== '#c8a050') {
        world.add(id, PointLight, lightFor(projectile.trailColor));
      }
      origins.push({ key, x: position.x, y: position.y, vx: velocity.vx * 0.1, vy: velocity.vy * 0.1 });
    }

    for (const key of [...activeTrails]) {
      if (current.has(key)) continue;
      activeTrails.delete(key);
      fx.removeEmitter(key);
    }
    fx.step(dt, origins);
  }

  return { step };
}

function trailFor(projectile) {
  if (projectile.trailColor === '#c8a050') return ARROW_TRAIL;
  if (projectile.trailColor) return spellTrail(projectile.trailColor);
  return projectile.owner == null ? FROST_TRAIL : SHADOW_TRAIL;
}

function lightFor(color) {
  if (color === '#8cd8ff') return { radius: 120, r: 140, g: 200, b: 255 };
  return { radius: 90, r: 180, g: 60, b: 255 };
}
