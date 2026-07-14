// Authoritative entity lifecycle. Presentation observes entity.died events.
import { Actor, Health, Lifetime, PlayerTag, Position, Projectile } from '../components/index.js';

export function deathSystem(world, _dt) {
  const destroy = new Set();

  for (const [id, position, health, actor] of world.query(Position, Health, Actor)) {
    if (health.hp > 0 || world.has(id, PlayerTag)) continue;
    world.emit('entity.died', {
      id,
      kind: actor.kind,
      x: position.x,
      y: position.y,
      glyph: actor.glyph,
    });
    destroy.add(id);
  }

  for (const [id, lifetime] of world.query(Lifetime)) {
    if (world.has(id, Projectile)) continue;
    lifetime.ttl -= _dt;
    if (lifetime.ttl <= 0) destroy.add(id);
  }

  for (const id of destroy) world.destroy(id);
}
