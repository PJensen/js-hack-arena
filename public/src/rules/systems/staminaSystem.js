import { Health, Stamina } from '../components/index.js';

export function staminaSystem(world, dt) {
  for (const [, stamina, health] of world.query(Stamina, Health)) {
    if (health.dead || health.hp <= 0) continue;
    const recoveryTime = Math.max(0, dt - stamina.recoveryDelay);
    stamina.recoveryDelay = Math.max(0, stamina.recoveryDelay - dt);
    stamina.stamina = Math.min(stamina.maxStamina, stamina.stamina + recoveryTime * stamina.regenPerSecond);
  }
}
