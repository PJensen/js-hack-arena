// rules/systems/inputSystem.js — reads InputRouter, writes Input component, spawns frost bolts
import { Position, Velocity, Input, Collider, Projectile, Lifetime, PointLight } from '../components/index.js';

export function createInputSystem(ctx) {
  const { inputRouter, playerId } = ctx;
  let castEventCooldown = 0;

  return function inputSystem(world, dt) {
    const inp = world.get(playerId, Input);
    const o = inputRouter.sample();

    inp.moveX = o.intent.moveX;
    inp.moveY = o.intent.moveY;
    inp.aimX = o.intent.aimX;
    inp.aimY = o.intent.aimY;

    castEventCooldown -= dt;
    const aiming = Math.abs(inp.aimX) > 0.1 || Math.abs(inp.aimY) > 0.1;
    if (aiming && castEventCooldown <= 0) {
      castEventCooldown = 0.25;
      const ppos = world.get(playerId, Position);
      const angle = Math.atan2(inp.aimY, inp.aimX);
      const speed = 320;
      const boltId = world.create();
      world.add(boltId, Position,   { x: ppos.x + Math.cos(angle) * 20, y: ppos.y + Math.sin(angle) * 20 });
      world.add(boltId, Velocity,   { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed });
      world.add(boltId, Projectile, { damage: 15, owner: playerId, speed, piercing: false });
      world.add(boltId, Lifetime,   { ttl: 2.0 });
      world.add(boltId, Collider,   { radius: 5 });
      world.add(boltId, PointLight, { radius: 120, r: 140, g: 200, b: 255 });
    }
  };
}
