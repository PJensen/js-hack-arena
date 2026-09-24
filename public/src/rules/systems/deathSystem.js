// Authoritative entity lifecycle. Presentation observes entity.died events.
import { Actor, Health, Input, Lifetime, PlayerTag, Position, Projectile, RecoverableArrows, Velocity } from '../components/index.js';
import { spawnArrows } from '../spawner.js';

export function deathSystem(world, _dt) {
  const destroy = new Set();

  for (const [id, position, health, actor] of world.query(Position, Health, Actor)) {
    if (health.hp > 0 || health.dead) continue;
    health.hp = 0;
    health.dead = true;
    world.emit('entity.died', {
      id,
      kind: actor.kind,
      x: position.x,
      y: position.y,
      glyph: actor.glyph,
    });
    const arrows = world.get(id, RecoverableArrows)?.count || 0;
    if (arrows > 0) spawnArrows(world, position.x, position.y, arrows);
    if (world.has(id, PlayerTag)) {
      const input = world.get(id, Input);
      if (input) Object.assign(input, { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false });
      const velocity = world.get(id, Velocity);
      if (velocity) Object.assign(velocity, { vx: 0, vy: 0 });
    } else {
      destroy.add(id);
    }
  }

  for (const [id, lifetime] of world.query(Lifetime)) {
    if (world.has(id, Projectile)) continue;
    lifetime.ttl -= _dt;
    if (lifetime.ttl <= 0) destroy.add(id);
  }

  for (const id of destroy) world.destroy(id);
}
