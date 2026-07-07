// rules/systems/aiSystem.js — AI pathing, LOS, tactical behaviour, projectile spawning
import { Position, Velocity, Speed, Facing, AI, Collider, Projectile, Lifetime, PointLight } from '../components/index.js';
import { moveWithSlide } from '../geometry/sweep.js';
import { astar } from '../ai/pathfind.js';

const aiPaths = new Map();       // entityId -> { path: [{x,y}], age: number }
const PATH_REFRESH = 0.5;        // recompute every 0.5s

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

export function createAISystem(ctx) {
  const { grid } = ctx;

  // Listen for entity deaths to clean up cached paths
  // (caller should wire world.on('entity.died', ...) if available)

  return function aiSystem(world, dt) {
    for (const [id, pos, vel, spd, fac, ai, col] of world.query(Position, Velocity, Speed, Facing, AI, Collider)) {
      if (ai.target === null) continue;
      if (!world.alive.has(ai.target)) { ai.target = null; continue; }

      const tpos = world.get(ai.target, Position);
      const dx = tpos.x - pos.x, dy = tpos.y - pos.y;
      const dist = Math.hypot(dx, dy);

      // LOS check
      ai.sight = dist < ai.aggroRange && hasLOS(grid, pos.x, pos.y, tpos.x, tpos.y);

      if (ai.sight) {
        // ── Has LOS — tactical behaviour ──
        aiPaths.delete(id);  // drop path, we can see them

        const tooClose = dist < ai.preferredDist * 0.7;
        const tooFar = dist > ai.preferredDist * 1.3;

        if (tooClose) {
          vel.vx = -(dx / dist) * spd.max;
          vel.vy = -(dy / dist) * spd.max;
        } else if (tooFar) {
          vel.vx = (dx / dist) * spd.max * 0.6;
          vel.vy = (dy / dist) * spd.max * 0.6;
        } else {
          vel.vx = -(dy / dist) * spd.max * 0.4;
          vel.vy =  (dx / dist) * spd.max * 0.4;
        }

        fac.angle = Math.atan2(dy, dx);

        // Cast
        ai.castCooldown -= dt;
        if (ai.castCooldown <= 0) {
          ai.castCooldown = ai.castRate;
          const angle = Math.atan2(dy, dx);
          const boltId = world.create();
          world.add(boltId, Position,   { x: pos.x + Math.cos(angle) * 18, y: pos.y + Math.sin(angle) * 18 });
          world.add(boltId, Velocity,   { vx: Math.cos(angle) * ai.projSpeed, vy: Math.sin(angle) * ai.projSpeed });
          world.add(boltId, Projectile, { damage: 12, owner: id, speed: ai.projSpeed, piercing: false });
          world.add(boltId, Lifetime,   { ttl: 2.5 });
          world.add(boltId, Collider,   { radius: 5 });
          world.add(boltId, PointLight, { radius: 90, r: 180, g: 60, b: 255 });
        }
      } else {
        // ── No LOS — A* pathfind ──
        let cached = aiPaths.get(id);
        if (!cached || cached.age > PATH_REFRESH || cached.path.length === 0) {
          const path = astar(grid, pos.x, pos.y, tpos.x, tpos.y, col.radius);
          cached = { path: path || [], age: 0 };
          aiPaths.set(id, cached);
        }
        cached.age += dt;

        if (cached.path.length > 0) {
          // Steer toward next waypoint
          const wp = cached.path[0];
          const wdx = wp.x - pos.x, wdy = wp.y - pos.y;
          const wdist = Math.hypot(wdx, wdy);

          if (wdist < grid.cellSize * 2) {
            cached.path.shift();  // reached waypoint
          } else {
            vel.vx = (wdx / wdist) * spd.max;
            vel.vy = (wdy / wdist) * spd.max;
            fac.angle = Math.atan2(wdy, wdx);
          }
        } else {
          vel.vx = 0; vel.vy = 0;
        }
      }

      // Move with wall slide
      const mdx = vel.vx * dt, mdy = vel.vy * dt;
      if (Math.abs(mdx) > 0.01 || Math.abs(mdy) > 0.01) {
        const moved = moveWithSlide(grid, pos.x, pos.y, mdx, mdy, col.radius);
        pos.x = moved.x;
        pos.y = moved.y;
      }
    }
  };
}

// Clean up cached path when an entity dies
export function onEntityDied({ id }) {
  aiPaths.delete(id);
}
