// rules/systems/movementSystem.js — player movement with wall slide
import { Position, Velocity, Speed, Collider, Input, Facing } from '../components/index.js';
import { moveWithSlide } from '../geometry/sweep.js';

export function createMovementSystem(ctx) {
  const { grid } = ctx;

  return function movementSystem(world, dt) {
    for (const [id, pos, vel, spd, col, inp, fac] of world.query(Position, Velocity, Speed, Collider, Input, Facing)) {
      vel.vx = inp.moveX * spd.max;
      vel.vy = inp.moveY * spd.max;

      if (Math.abs(inp.aimX) > 0.1 || Math.abs(inp.aimY) > 0.1) {
        fac.angle = Math.atan2(inp.aimY, inp.aimX);
      } else if (Math.abs(vel.vx) > 1 || Math.abs(vel.vy) > 1) {
        fac.angle = Math.atan2(vel.vy, vel.vx);
      }

      const mdx = vel.vx * dt;
      const mdy = vel.vy * dt;
      if (Math.abs(mdx) > 0.01 || Math.abs(mdy) > 0.01) {
        const moved = moveWithSlide(grid, pos.x, pos.y, mdx, mdy, col.radius);
        pos.x = moved.x;
        pos.y = moved.y;
      }
    }
  };
}
