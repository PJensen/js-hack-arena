import { Powerups } from '../components/index.js';

const TIMERS = Object.freeze([
  ['manaRegenSeconds', 'manaRegenMultiplier'],
  ['hasteSeconds', 'hasteMultiplier'],
  ['furySeconds', 'furyMultiplier'],
  ['wardSeconds', 'wardMultiplier'],
]);

export function powerupSystem(world, dt) {
  for (const [, powerups] of world.query(Powerups)) {
    for (const [timer, multiplier] of TIMERS) {
      if (powerups[timer] <= 0) continue;
      powerups[timer] = Math.max(0, powerups[timer] - dt);
      if (powerups[timer] === 0) powerups[multiplier] = 1;
    }
  }
}
