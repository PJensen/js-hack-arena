// A spell composes casting, resource, targeting, delivery, and impact rules.
// Presentation metadata lives beside those mechanics, but no cast mode implies
// a particular effect or delivery shape.

export const SpellCastMode = Object.freeze({
  INSTANT: 'instant',
  CAST_TIME: 'cast_time',
  CHARGED: 'charged',
  CHANNELED: 'channeled',
});

export const TargetingType = Object.freeze({
  DIRECTION: 'direction',
  ENEMY_CHAIN: 'enemy_chain',
  SELF: 'self',
  AIMED_AREA: 'aimed_area',
});

export const DeliveryKind = Object.freeze({
  PROJECTILE: 'projectile',
  DIRECT: 'direct',
  AREA: 'area',
});

export const ImpactKind = Object.freeze({
  DAMAGE: 'damage',
  HEAL: 'heal',
  APPLY_AURA: 'apply_aura',
});

export const DEFAULT_GLOBAL_COOLDOWN = 0.45;

export const spells = Object.freeze({
  frost_bolt: spell({
    id: 'frost_bolt',
    name: 'Frost Bolt', glyph: '❄', element: 'frost',
    cast: { mode: SpellCastMode.CHARGED, maxCharge: 1 },
    mana: { cost: 12, chargeCost: true },
    cooldown: 0.25,
    targeting: { type: TargetingType.DIRECTION, range: 420 },
    delivery: { kind: DeliveryKind.PROJECTILE, speed: 320, radius: 5, ttl: 2 },
    impacts: [
      { kind: ImpactKind.DAMAGE, amount: 15, chargeScale: [0.65, 1.35] },
      { kind: ImpactKind.APPLY_AURA, auraId: 'frozen', duration: 2.4, chargeScale: [0.6, 1] },
    ],
    trailColor: '#8cd8ff', burstColor: '#b0e0ff',
  }),
  arrow: spell({
    id: 'arrow',
    name: 'Arrow', glyph: '→', element: 'arrow',
    cast: { mode: SpellCastMode.CHARGED, maxCharge: 0.7 },
    mana: { cost: 0 },
    cooldown: 0.18,
    targeting: { type: TargetingType.DIRECTION, range: 520 },
    delivery: { kind: DeliveryKind.PROJECTILE, speed: 450, radius: 3, ttl: 1.5 },
    impacts: [{ kind: ImpactKind.DAMAGE, amount: 10, chargeScale: [0.65, 1.35] }],
    trailColor: '#c8a050', burstColor: '#a08040',
  }),
  lightning: spell({
    id: 'lightning',
    name: 'Lightning', glyph: '⚡', element: 'electric',
    cast: { mode: SpellCastMode.INSTANT },
    mana: { cost: 28 },
    cooldown: 0.6,
    targeting: { type: TargetingType.ENEMY_CHAIN, range: 280, chainRadius: 120, maxTargets: 3 },
    delivery: { kind: DeliveryKind.DIRECT },
    impacts: [
      { kind: ImpactKind.DAMAGE, amount: 25 },
      { kind: ImpactKind.APPLY_AURA, auraId: 'stunned', duration: 0.8 },
    ],
  }),
  poison_orb: spell({
    id: 'poison_orb',
    name: 'Venom Orb', glyph: '☠', element: 'poison',
    cast: { mode: SpellCastMode.CAST_TIME, castTime: 0.65, interruptOnRelease: true, interruptOnMove: true, interruptOnDamage: true },
    mana: { cost: 18 },
    cooldown: 1.2,
    targeting: { type: TargetingType.DIRECTION, range: 380 },
    delivery: { kind: DeliveryKind.PROJECTILE, speed: 285, radius: 6, ttl: 2.2 },
    impacts: [
      { kind: ImpactKind.DAMAGE, amount: 8 },
      { kind: ImpactKind.APPLY_AURA, auraId: 'poisoned', duration: 4 },
    ],
    trailColor: '#52e878', burstColor: '#80ff98',
  }),
  ice_armor: spell({
    id: 'ice_armor',
    name: 'Ice Armor', glyph: '◇', element: 'frost',
    cast: { mode: SpellCastMode.INSTANT },
    mana: { cost: 24 },
    cooldown: 8,
    targeting: { type: TargetingType.SELF },
    delivery: { kind: DeliveryKind.DIRECT },
    impacts: [{ kind: ImpactKind.APPLY_AURA, auraId: 'ice_armor', duration: 6 }],
  }),
  regeneration: spell({
    id: 'regeneration',
    name: 'Regeneration', glyph: '✚', element: 'nature',
    cast: { mode: SpellCastMode.INSTANT },
    mana: { cost: 26 },
    cooldown: 10,
    targeting: { type: TargetingType.SELF },
    delivery: { kind: DeliveryKind.DIRECT },
    impacts: [{ kind: ImpactKind.APPLY_AURA, auraId: 'regeneration', duration: 6 }],
  }),
  blizzard: spell({
    id: 'blizzard',
    name: 'Blizzard', glyph: '※', element: 'frost',
    cast: { mode: SpellCastMode.CHANNELED, channelDuration: 3, interruptOnRelease: true, interruptOnMove: true, interruptOnDamage: true },
    mana: { perTick: 1 },
    cooldown: 6,
    targeting: { type: TargetingType.AIMED_AREA, range: 170, areaRadius: 72 },
    delivery: { kind: DeliveryKind.AREA },
    impacts: [
      { kind: ImpactKind.DAMAGE, amount: 1 },
      { kind: ImpactKind.APPLY_AURA, auraId: 'frozen', duration: 0.35 },
    ],
  }),
});

function spell(definition) {
  return Object.freeze({
    globalCooldown: DEFAULT_GLOBAL_COOLDOWN,
    ...definition,
    cast: Object.freeze({ ...definition.cast }),
    mana: Object.freeze({ ...definition.mana }),
    targeting: Object.freeze({ ...definition.targeting }),
    delivery: Object.freeze({ ...definition.delivery }),
    impacts: Object.freeze(definition.impacts.map((impact) => Object.freeze({ ...impact }))),
  });
}
