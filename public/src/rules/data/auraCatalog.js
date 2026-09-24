import { EffectKind } from './effectCatalog.js';
export { EffectKind };

export const AuraId = Object.freeze({
  CHILLING_PRESENCE: 'chilling_presence',
  HASTE_TOTEM: 'haste_totem',
});

// Spatial fields share the same generic effect operations as conditions.
// Their radius, relationship, and visual describe the emitter, not recipients.
export const auras = Object.freeze({
  [AuraId.CHILLING_PRESENCE]: Object.freeze({
    id: AuraId.CHILLING_PRESENCE,
    name: 'Chilling Presence',
    radius: 90,
    team: 'hostile',
    targets: 'hostile',
    effects: Object.freeze([
      Object.freeze({ kind: EffectKind.STAT_MULTIPLIER, stat: 'movementSpeed', value: 0.7 }),
    ]),
    visual: Object.freeze({ glyph: '❄', color: Object.freeze([0.32, 0.78, 1]) }),
  }),
  [AuraId.HASTE_TOTEM]: Object.freeze({
    id: AuraId.HASTE_TOTEM,
    name: 'Haste Totem',
    radius: 110,
    team: 'friendly',
    targets: 'friendly',
    effects: Object.freeze([
      Object.freeze({ kind: EffectKind.STAT_MULTIPLIER, stat: 'movementSpeed', value: 1.2 }),
    ]),
    visual: Object.freeze({ glyph: '»', color: Object.freeze([0.28, 1, 0.68]) }),
  }),
});
