// rules/systems/bumpSystem.js — push overlapping non-projectile bodies apart
import { Position, Collider, Projectile } from '../components/index.js';

export function bumpSystem(world, dt) {
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
    }
  }
}
