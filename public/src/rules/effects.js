import { Auras, Health, Position, Powerups } from './components/index.js';
import { auras as auraCatalog, EffectKind } from './data/auraCatalog.js';

export function applyAura(world, targetId, auraId, sourceId = null, duration = null) {
  const definition = auraCatalog[auraId];
  if (!definition || !world.alive.has(targetId)) return false;
  if (!world.has(targetId, Auras)) world.add(targetId, Auras);

  const state = world.get(targetId, Auras);
  const lifetime = positiveDuration(duration, definition.duration);
  const existing = state.active.find((aura) => aura.id === auraId);
  if (existing) {
    existing.source = sourceId;
    existing.remaining = Math.max(existing.remaining, lifetime);
    existing.duration = Math.max(existing.duration, lifetime);
    existing.effects = cloneEffects(definition.effects);
  } else {
    state.active.push({
      id: definition.id,
      source: sourceId,
      remaining: lifetime,
      duration: lifetime,
      stacks: 1,
      effects: cloneEffects(definition.effects),
    });
  }
  world.emit('aura.applied', { target: targetId, source: sourceId, auraId, duration: lifetime });
  return true;
}

export function getStatMultiplier(world, targetId, stat, context = {}) {
  let multiplier = 1;
  forEachEffect(world, targetId, (effect, aura) => {
    if (effect.kind === EffectKind.STAT_MULTIPLIER && effect.stat === stat &&
      (!effect.damageType || effect.damageType === context.damageType)) {
      multiplier *= finiteNumber(effect.value, 1) ** Math.max(1, aura.stacks || 1);
    }
  });
  return multiplier;
}

export function applyDamage(world, targetId, rawAmount, {
  sourceId = null, damageType = null, x = null, y = null, spellId = null, periodic = false,
} = {}) {
  const health = world.get(targetId, Health);
  if (!health || health.dead || health.hp <= 0) return 0;
  const ward = world.get(targetId, Powerups)?.wardMultiplier || 1;
  const mitigation = getStatMultiplier(world, targetId, 'damageTaken', { damageType });
  const amount = Math.max(0, Math.round(rawAmount * ward * mitigation));
  if (amount <= 0) return 0;
  health.hp = Math.max(0, health.hp - amount);
  const position = world.get(targetId, Position);
  world.emit('damage.dealt', {
    target: targetId, source: sourceId, amount,
    x: x ?? position?.x ?? 0, y: y ?? position?.y ?? 0,
    damageType, spellId, periodic,
  });
  return amount;
}

export function applyHealing(world, targetId, rawAmount, { sourceId = null, x = null, y = null, spellId = null } = {}) {
  const health = world.get(targetId, Health);
  if (!health || health.dead || health.hp <= 0) return 0;
  const amount = Math.min(Math.max(0, Math.round(rawAmount)), health.maxHp - health.hp);
  if (amount <= 0) return 0;
  health.hp += amount;
  const position = world.get(targetId, Position);
  world.emit('damage.dealt', {
    target: targetId, source: sourceId, amount: -amount,
    x: x ?? position?.x ?? 0, y: y ?? position?.y ?? 0, spellId,
  });
  return amount;
}

export function isActionLocked(world, targetId, action) {
  let locked = false;
  forEachEffect(world, targetId, (effect) => {
    if (effect.kind === EffectKind.ACTION_LOCK && effect.action === action) locked = true;
  });
  return locked;
}

export function auraSystem(world, dt) {
  for (const [targetId, state] of world.query(Auras)) {
    for (const aura of state.active) {
      aura.remaining -= dt;
      tickPeriodicDamage(world, targetId, aura, dt);
      tickPeriodicHealing(world, targetId, aura, dt);
    }
    const expired = state.active.filter((aura) => aura.remaining <= 0);
    state.active = state.active.filter((aura) => aura.remaining > 0);
    for (const aura of expired) world.emit('aura.expired', { target: targetId, auraId: aura.id });
  }
}

export function projectAuras(world, targetId) {
  const state = world.get(targetId, Auras);
  if (!state) return [];
  return state.active.map((aura) => {
    const definition = auraCatalog[aura.id];
    return {
      id: aura.id,
      name: definition?.name || aura.id,
      glyph: definition?.glyph || '•',
      visual: definition?.visual || 'generic',
      disposition: definition?.disposition || 'neutral',
      remaining: Math.max(0, aura.remaining),
      duration: aura.duration,
      stacks: aura.stacks || 1,
    };
  });
}

function forEachEffect(world, targetId, visit) {
  const state = world.get(targetId, Auras);
  if (!state) return;
  for (const aura of state.active) {
    if (aura.remaining <= 0) continue;
    for (const effect of aura.effects || []) visit(effect, aura);
  }
}

function tickPeriodicDamage(world, targetId, aura, dt) {
  const health = world.get(targetId, Health);
  if (!health || health.dead || health.hp <= 0) return;
  for (const effect of aura.effects || []) {
    if (effect.kind !== EffectKind.PERIODIC_DAMAGE) continue;
    const interval = Math.max(0.05, finiteNumber(effect.interval, 1));
    effect.elapsed = finiteNumber(effect.elapsed, 0) + dt;
    while (effect.elapsed >= interval && health.hp > 0) {
      effect.elapsed -= interval;
      const amount = Math.max(0, finiteNumber(effect.amount, 0)) * Math.max(1, aura.stacks || 1);
      applyDamage(world, targetId, amount, {
        sourceId: aura.source, damageType: effect.damageType, periodic: true,
      });
    }
  }
}

function tickPeriodicHealing(world, targetId, aura, dt) {
  for (const effect of aura.effects || []) {
    if (effect.kind !== EffectKind.PERIODIC_HEAL) continue;
    const interval = Math.max(0.05, finiteNumber(effect.interval, 1));
    effect.elapsed = finiteNumber(effect.elapsed, 0) + dt;
    while (effect.elapsed >= interval) {
      effect.elapsed -= interval;
      applyHealing(world, targetId, finiteNumber(effect.amount, 0) * Math.max(1, aura.stacks || 1), {
        sourceId: aura.source,
      });
    }
  }
}

function cloneEffects(effects) {
  return (effects || []).map((effect) => ({ ...effect, elapsed: 0 }));
}

function positiveDuration(value, fallback) {
  const duration = finiteNumber(value, fallback);
  return duration > 0 ? duration : fallback;
}

function finiteNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}
