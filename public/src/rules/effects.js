import { Actor, ActorKind, AuraEmitter, AuraMemberships, Conditions, Health, Position, Powerups } from './components/index.js';
import { conditions as conditionCatalog } from './data/conditionCatalog.js';
import { EffectKind } from './data/effectCatalog.js';

export function applyCondition(world, targetId, conditionId, sourceId = null, duration = null) {
  const definition = conditionCatalog[conditionId];
  if (!definition || !world.alive.has(targetId)) return false;
  if (!world.has(targetId, Conditions)) world.add(targetId, Conditions);

  const state = world.get(targetId, Conditions);
  const lifetime = positiveDuration(duration, definition.duration);
  const existing = state.active.find((condition) => condition.id === conditionId);
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
  world.emit('condition.applied', { target: targetId, source: sourceId, conditionId, duration: lifetime });
  return true;
}

export function getStatMultiplier(world, targetId, stat, context = {}) {
  let multiplier = 1;
  forEachEffect(world, targetId, (effect, source) => {
    if (effect.kind === EffectKind.STAT_MULTIPLIER && effect.stat === stat &&
      (!effect.damageType || effect.damageType === context.damageType)) {
      multiplier *= finiteNumber(effect.value, 1) ** Math.max(1, source.stacks || 1);
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

// Runs before movement and combat, keeping emitter membership and timed
// conditions current for every later system in the tick.
export function effectSystem(world, dt) {
  updateAuraMemberships(world, dt);
  for (const [targetId, state] of world.query(Conditions)) {
    for (const condition of state.active) {
      condition.remaining -= dt;
      tickPeriodicEffects(world, targetId, condition, dt);
    }
    const expired = state.active.filter((condition) => condition.remaining <= 0);
    state.active = state.active.filter((condition) => condition.remaining > 0);
    for (const condition of expired) {
      world.emit('condition.expired', { target: targetId, conditionId: condition.id });
    }
  }

  for (const [targetId, memberships] of world.query(AuraMemberships)) {
    for (const membership of memberships.active) tickPeriodicEffects(world, targetId, membership, dt);
  }
}

export function projectConditions(world, targetId) {
  const state = world.get(targetId, Conditions);
  if (!state) return [];
  return state.active.map((condition) => {
    const definition = conditionCatalog[condition.id];
    return {
      id: condition.id,
      name: definition?.name || condition.id,
      glyph: definition?.glyph || '•',
      visual: definition?.visual || 'generic',
      disposition: definition?.disposition || 'neutral',
      remaining: Math.max(0, condition.remaining),
      duration: condition.duration,
      stacks: condition.stacks || 1,
    };
  });
}

export function projectAuraEmitter(world, entityId) {
  const emitter = world.get(entityId, AuraEmitter);
  if (!emitter) return null;
  return {
    id: String(emitter.id || ''),
    name: String(emitter.name || emitter.id || 'Aura'),
    radius: Math.max(0, finiteNumber(emitter.radius, 0)),
    targets: emitter.targets || 'all',
    team: emitter.team || null,
    effects: cloneEffects(emitter.effects),
    visual: cloneVisual(emitter.visual),
    duration: Math.max(0, finiteNumber(emitter.duration, 0)),
    remaining: finiteNumber(emitter.remaining, -1),
    active: Boolean(emitter.active),
  };
}

function updateAuraMemberships(world, dt) {
  const emitters = [];
  for (const [id, position, emitter] of world.query(Position, AuraEmitter)) {
    if (!emitter.active) continue;
    if (emitter.duration > 0) {
      if (emitter.remaining < 0) emitter.remaining = emitter.duration;
      emitter.remaining -= dt;
      if (emitter.remaining <= 0) {
        emitter.remaining = 0;
        emitter.active = false;
        world.emit('aura.expired', { emitter: id, auraId: emitter.id });
        continue;
      }
    }
    const radius = Math.max(0, finiteNumber(emitter.radius, 0));
    if (radius <= 0) continue;
    emitters.push({ id, position, emitter, radiusSquared: radius * radius });
  }

  const actors = [...world.query(Position, Actor)];
  for (const [targetId, position, actor] of actors) {
    const health = world.get(targetId, Health);
    const old = world.get(targetId, AuraMemberships)?.active || [];
    const previous = new Map(old.map((membership) => [membership.emitterId, membership]));
    const next = [];
    if (!health || (!health.dead && health.hp > 0)) {
      for (const { id, position: sourcePosition, emitter, radiusSquared } of emitters) {
        const sourceTeam = emitter.team || actorTeam(world, id);
        if (!isTargeted(emitter.targets, sourceTeam, actorTeam(world, targetId))) continue;
        const dx = position.x - sourcePosition.x;
        const dy = position.y - sourcePosition.y;
        if (dx * dx + dy * dy > radiusSquared) continue;

        const existing = previous.get(id);
        next.push(existing && existing.id === emitter.id
          ? existing
          : {
            emitterId: id,
            id: emitter.id,
            source: id,
            stacks: 1,
            effects: cloneEffects(emitter.effects),
          });
      }
    }
    if (!world.has(targetId, AuraMemberships)) world.add(targetId, AuraMemberships);
    world.get(targetId, AuraMemberships).active = next;
  }
}

function actorTeam(world, entityId) {
  const actor = world.get(entityId, Actor);
  if (!actor) return 'neutral';
  if (actor.team && actor.team !== 'neutral') return actor.team;
  if (actor.kind === ActorKind.PLAYER) return 'friendly';
  if (actor.kind === ActorKind.MOB) return 'hostile';
  return actor.team || 'neutral';
}

function isTargeted(targets, sourceTeam, targetTeam) {
  if (targets === 'all') return true;
  if (!sourceTeam || sourceTeam === 'neutral' || !targetTeam || targetTeam === 'neutral') return false;
  if (targets === 'friendly') return sourceTeam === targetTeam;
  if (targets === 'hostile') return sourceTeam !== targetTeam;
  return false;
}

function forEachEffect(world, targetId, visit) {
  const conditions = world.get(targetId, Conditions);
  if (conditions) {
    for (const condition of conditions.active) {
      if (condition.remaining <= 0) continue;
      for (const effect of condition.effects || []) visit(effect, condition);
    }
  }
  const memberships = world.get(targetId, AuraMemberships);
  if (memberships) {
    for (const membership of memberships.active) {
      for (const effect of membership.effects || []) visit(effect, membership);
    }
  }
}

function tickPeriodicEffects(world, targetId, source, dt) {
  for (const effect of source.effects || []) {
    if (effect.kind !== EffectKind.PERIODIC_DAMAGE && effect.kind !== EffectKind.PERIODIC_HEAL) continue;
    if (effect.kind === EffectKind.PERIODIC_DAMAGE) {
      const health = world.get(targetId, Health);
      if (!health || health.dead || health.hp <= 0) continue;
    }
    const interval = Math.max(0.05, finiteNumber(effect.interval, 1));
    effect.elapsed = finiteNumber(effect.elapsed, 0) + dt;
    while (effect.elapsed >= interval) {
      effect.elapsed -= interval;
      const amount = Math.max(0, finiteNumber(effect.amount, 0)) * Math.max(1, source.stacks || 1);
      if (effect.kind === EffectKind.PERIODIC_DAMAGE) {
        if (world.get(targetId, Health)?.hp <= 0) break;
        applyDamage(world, targetId, amount, {
          sourceId: source.source, damageType: effect.damageType, periodic: true,
        });
      } else {
        applyHealing(world, targetId, amount, { sourceId: source.source });
      }
    }
  }
}

function cloneEffects(effects) {
  return (effects || []).map((effect) => ({ ...effect, elapsed: 0 }));
}

function cloneVisual(visual) {
  return {
    glyph: String(visual?.glyph || '◌'),
    color: Array.isArray(visual?.color) && visual.color.length >= 3
      ? visual.color.slice(0, 3).map((channel) => Math.max(0, Math.min(1, finiteNumber(channel, 1))))
      : [0.65, 0.85, 1],
  };
}

function positiveDuration(value, fallback) {
  const duration = finiteNumber(value, fallback);
  return duration > 0 ? duration : fallback;
}

function finiteNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

// Legacy names remain available while spell data and callers migrate.
export const applyAura = applyCondition;
export const auraSystem = effectSystem;
export const projectAuras = projectConditions;
