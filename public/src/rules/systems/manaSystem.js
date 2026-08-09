import { Mana, Powerups } from '../components/index.js';

export function manaSystem(world, dt) {
  for (const [id, mana] of world.query(Mana)) {
    const powerups = world.get(id, Powerups);
    if (powerups?.manaRegenSeconds > 0) {
      powerups.manaRegenSeconds = Math.max(0, powerups.manaRegenSeconds - dt);
      if (powerups.manaRegenSeconds === 0) powerups.manaRegenMultiplier = 1;
    }
    const multiplier = powerups?.manaRegenMultiplier || 1;
    mana.mana = Math.min(mana.maxMana, mana.mana + mana.regenPerSecond * multiplier * dt);
  }
}
