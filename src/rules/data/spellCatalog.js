// rules/data/spellCatalog.js
// Spell definitions — stats, costs, FX configs.

export const spells = {
  frost_bolt: {
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
  lightning: {
    name: 'Lightning',
    glyph: '\u26A1',  // ⚡
    cooldown: 0.6,
    damage: 25,
    speed: 500,
    radius: 4,
    ttl: 1.0,
    light: { radius: 180, r: 255, g: 240, b: 140 },
    trailColor: '#fff080',
    burstColor: '#ffee88',
  },
};
