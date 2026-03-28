// rules/systems/inputSystem.js — reads sticks/keyboard, writes Input component, spawns frost bolts
import { Position, Velocity, Facing, Input, Collider, Projectile, Lifetime, PointLight } from '../components/index.js';

function keyboardInput(keys) {
  let mx = 0, my = 0;
  if (keys['w'] || keys['arrowup'])    my -= 1;
  if (keys['s'] || keys['arrowdown'])  my += 1;
  if (keys['a'] || keys['arrowleft'])  mx -= 1;
  if (keys['d'] || keys['arrowright']) mx += 1;
  const len = Math.hypot(mx, my);
  if (len > 1) { mx /= len; my /= len; }
  return { mx, my };
}

export function createInputSystem(ctx) {
  const { leftStick, rightStick, keys, playerId } = ctx;
  let castEventCooldown = 0;

  return function inputSystem(world, dt) {
    const inp = world.get(playerId, Input);
    const kb = keyboardInput(keys);

    inp.moveX = leftStick.active ? leftStick.x : kb.mx;
    inp.moveY = leftStick.active ? leftStick.y : kb.my;
    inp.aimX = rightStick.active ? rightStick.x : 0;
    inp.aimY = rightStick.active ? rightStick.y : 0;

    // Keyboard aim: spacebar fires in current facing direction
    const kbAimX = keys[' '] ? Math.cos(world.get(playerId, Facing).angle) : 0;
    const kbAimY = keys[' '] ? Math.sin(world.get(playerId, Facing).angle) : 0;
    if (!rightStick.active && Math.abs(kbAimX) > 0.1) {
      inp.aimX = kbAimX; inp.aimY = kbAimY;
    }

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
