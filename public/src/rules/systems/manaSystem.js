import { Mana } from '../components/index.js';

export function manaSystem(world, dt) {
  for (const [, mana] of world.query(Mana)) {
    mana.mana = Math.min(mana.maxMana, mana.mana + mana.regenPerSecond * dt);
  }
}
