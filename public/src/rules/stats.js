import { forEachActiveEffect } from './activeEffects.js';
import { conditions } from './data/conditionCatalog.js';
import { EffectKind, EffectStat } from './data/effectCatalog.js';
import { forEachEquippedItem } from './equipment.js';

const knownStats = new Set(Object.values(EffectStat));

export function normalizeStatModifiers(modifiers, field) {
  if (!Array.isArray(modifiers)) throw new Error(`${field} must be an array`);
  return Object.freeze(modifiers.map((modifier, index) => {
    const { kind, stat, conditionId, damageType, value } = modifier ?? {};
    if (kind !== EffectKind.STAT_MULTIPLIER || !knownStats.has(stat) || !Number.isFinite(value) || value <= 0) {
      throw new Error(`${field}[${index}] must specify a known stat and a positive finite multiplier`);
    }
    if (conditionId != null && (typeof conditionId !== 'string' || !Object.hasOwn(conditions, conditionId))) {
      throw new Error(`${field}[${index}].conditionId must specify a known condition`);
    }
    if (damageType != null && (typeof damageType !== 'string' || !damageType)) {
      throw new Error(`${field}[${index}].damageType must be a non-empty string`);
    }
    return Object.freeze({
      kind, stat, value,
      ...(conditionId != null && { conditionId }),
      ...(damageType != null && { damageType }),
    });
  }));
}

// Equipment and active effects use the same contextual multiplier and stack rules.
function modifierMultiplier(modifier, stat, context, stacks = 1) {
  if (modifier.kind !== EffectKind.STAT_MULTIPLIER || modifier.stat !== stat ||
    (modifier.conditionId && modifier.conditionId !== context.conditionId) ||
    (modifier.damageType && modifier.damageType !== context.damageType)) return 1;
  return Number.isFinite(modifier.value) ? modifier.value ** stacks : 1;
}

export function getModifierMultiplier(modifiers, stat, context = {}) {
  let multiplier = 1;
  for (const modifier of modifiers ?? []) multiplier *= modifierMultiplier(modifier, stat, context);
  return multiplier;
}

export function getStatMultiplier(world, actorId, stat, context = {}) {
  let multiplier = 1;
  const contribute = (modifier, stacks) => {
    multiplier *= modifierMultiplier(modifier, stat, context, stacks);
  };
  forEachEquippedItem(world, actorId, (item) => {
    for (const modifier of item.modifiers ?? []) contribute(modifier, 1);
  });
  forEachActiveEffect(world, actorId, contribute);
  return multiplier;
}
