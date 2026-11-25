import { ConditionId } from './conditionCatalog.js';
import { EffectKind, EffectStat } from './effectCatalog.js';
import { Rarity } from './lootTable.js';
import { normalizeRingModifiers } from '../ringModifiers.js';

const frozenDuration = (value) => normalizeRingModifiers([{
  kind: EffectKind.STAT_MULTIPLIER,
  stat: EffectStat.CONDITION_DURATION_DEALT,
  conditionId: ConditionId.FROZEN,
  value,
}]);

export const ringCatalog = Object.freeze({
  frostband: Object.freeze({
    name: 'Frostband', rarity: Rarity.RARE, modifiers: frozenDuration(1.05),
  }),
  rimeband: Object.freeze({
    name: 'Rimeband', rarity: Rarity.EPIC, modifiers: frozenDuration(1.10),
  }),
});
