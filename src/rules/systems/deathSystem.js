// rules/systems/deathSystem.js — destroy dead mobs with particle burst
import { Position, Health, Actor, ActorKind } from '../components/index.js';

export function createDeathSystem(ctx) {
  const { fx, playerId } = ctx;

  return function deathSystem(world, dt) {
    const toDie = [];
    for (const [id, pos, hp, actor] of world.query(Position, Health, Actor)) {
      if (hp.hp > 0) continue;
      if (id === playerId) continue;  // player death handled in render

      // Death burst particles
      const burst = fx.ensureEmitter('death:' + id, {
        continuous: false, burstCount: 30,
        angle: 0, spread: Math.PI,
        speed: 40, speedJitter: 0.7,
        ax: 0, ay: 0,
        life: 0.5, lifeJitter: 0.4,
        size: 6, sizeEnd: 1,
        color: actor.kind === ActorKind.MOB ? '#a050ff' : '#ffffff',
        alpha0: 0.9, alpha1: 0.0,
      });
      burst.step(fx.pool, dt, pos.x, pos.y);
      toDie.push(id);
    }
    for (const id of toDie) {
      world.emit('entity.died', { id });
      world.destroy(id);
    }
  };
}
