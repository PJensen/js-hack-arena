import { conditions } from './data/conditionCatalog.js';
import { EffectKind, EffectStat } from './data/effectCatalog.js';

export function normalizeRingModifiers(modifiers, field = 'ring.modifiers') {
  if (!Array.isArray(modifiers)) throw new Error(`${field} must be an array`);
  return Object.freeze(modifiers.map((modifier, index) => {
    const { kind, stat, conditionId, value } = modifier ?? {};
    if (kind !== EffectKind.STAT_MULTIPLIER || stat !== EffectStat.CONDITION_DURATION_DEALT ||
      typeof conditionId !== 'string' || !Object.hasOwn(conditions, conditionId) ||
      !Number.isFinite(value) || value <= 0) {
      throw new Error(`${field}[${index}] must specify a condition duration stat multiplier with a known condition and a positive finite value`);
    }
    return Object.freeze({ kind, stat, conditionId, value });
  }));
}

export function getRingStatMultiplier(ring, stat, { conditionId } = {}) {
  let multiplier = 1;
  for (const modifier of ring?.modifiers ?? []) {
    if (modifier.stat === stat && modifier.conditionId === conditionId) {
      multiplier *= modifier.value;
    }
  }
  return multiplier;
}
