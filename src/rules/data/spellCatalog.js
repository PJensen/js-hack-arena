// rules/data/spellCatalog.js
// Spell definitions — stats, FX configs.
// type: 'projectile' = spawns a moving entity
// type: 'bolt' = instant-hit chain lightning

export const spells = {
  frost_bolt: {
    type: 'projectile',
    name: 'Frost Bolt',
    glyph: '\u2744',  // ❄
    cooldown: 0.25,
    damage: 15,
    speed: 320,
    radius: 5,
    ttl: 2.0,
    light: { radius: 120, r: 140, g: 200, b: 255 },
    trailColor: '#8cd8ff',
    burstColor: '#b0e0ff',
  },
  arrow: {
    type: 'projectile',
    name: 'Arrow',
    glyph: '\u2192',  // →
    cooldown: 0.18,
    damage: 10,
    speed: 450,
    radius: 3,
    ttl: 1.5,
    light: null,
    trailColor: '#c8a050',
    burstColor: '#a08040',
  },
  lightning: {
    type: 'bolt',
    name: 'Lightning',
    glyph: '\u26A1',  // ⚡
    cooldown: 0.6,
    damage: 25,
    range: 280,         // max range to first target
    chainRadius: 120,   // max hop distance between targets
    maxTargets: 3,      // chain up to 3 enemies
  },
};
