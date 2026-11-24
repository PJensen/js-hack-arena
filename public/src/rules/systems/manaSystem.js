import { Mana, PlayerTag, Powerups } from '../components/index.js';

const COMBAT_REGEN_DELAY = 5;

export function installManaCombatDelay(world) {
  world.on('damage.dealt', ({ amount, periodic, source, target }) => {
    if (amount <= 0 || periodic) return;
    for (const id of [source, target]) {
      if (!world.has(id, PlayerTag)) continue;
      const mana = world.get(id, Mana);
      if (mana) mana.regenDelay = COMBAT_REGEN_DELAY;
    }
  });
}

export function manaSystem(world, dt) {
  for (const [id, mana] of world.query(Mana)) {
    const recoveryTime = Math.max(0, dt - mana.regenDelay);
    mana.regenDelay = Math.max(0, mana.regenDelay - dt);
    const powerups = world.get(id, Powerups);
    const multiplier = powerups?.manaRegenMultiplier || 1;
    mana.mana = Math.min(mana.maxMana, mana.mana + mana.regenPerSecond * multiplier * recoveryTime);
  }
}
