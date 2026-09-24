import { Health } from './components/index.js';
import { applyCondition, applyDamage, applyHealing } from './effects.js';
import { ImpactKind } from './data/spellCatalog.js';

// Resolve author-time spell impacts into a projectile/channel-safe payload.
export function resolveImpacts(impacts, { power = 1, amountMultiplier = 1 } = {}) {
  return (impacts || []).map((impact) => {
    const scale = chargeScale(impact.chargeScale, power);
    if (impact.kind === ImpactKind.DAMAGE || impact.kind === ImpactKind.HEAL) {
      return { ...impact, amount: Math.max(0, impact.amount * scale * amountMultiplier), chargeScale: null };
    }
    if (isConditionImpact(impact.kind)) {
      return { ...impact, duration: impact.duration * scale, conditionId: impact.conditionId || impact.auraId, chargeScale: null };
    }
    return { ...impact, chargeScale: null };
  });
}

export function applyImpacts(world, targetId, sourceId, impacts, context = {}) {
  if (!world.alive.has(targetId)) return false;
  let applied = false;
  for (const impact of impacts || []) {
    if (impact.kind === ImpactKind.DAMAGE) {
      applied = applyDamage(world, targetId, impact.amount, {
        sourceId,
        damageType: impact.damageType || context.damageType,
        x: context.x,
        y: context.y,
        spellId: context.spellId,
        periodic: context.periodic,
      }) > 0 || applied;
    } else if (impact.kind === ImpactKind.HEAL) {
      applied = applyHealing(world, targetId, impact.amount, {
        sourceId, x: context.x, y: context.y, spellId: context.spellId,
      }) > 0 || applied;
    } else if (isConditionImpact(impact.kind)) {
      applied = applyCondition(world, targetId, impact.conditionId || impact.auraId, sourceId, impact.duration) || applied;
    }
  }
  return applied;
}

function isConditionImpact(kind) {
  return kind === ImpactKind.APPLY_CONDITION || kind === ImpactKind.APPLY_AURA;
}

export function canReceiveImpacts(world, targetId) {
  const health = world.get(targetId, Health);
  return Boolean(health && !health.dead && health.hp > 0);
}

function chargeScale(range, power) {
  if (!Array.isArray(range) || range.length !== 2) return 1;
  const normalized = Math.max(0, Math.min(1, power));
  return range[0] + (range[1] - range[0]) * normalized;
}
