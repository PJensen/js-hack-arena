// rules/data/spellCatalog.js
// Spell definitions — stats, FX configs.
// type: 'projectile' = spawns a moving entity
// type: 'bolt' = instant-hit chain lightning

export const spells = {
  frost_bolt: {
    type: 'projectile',
    element: 'frost',
    name: 'Frost Bolt',
    glyph: '\u2744',  // ❄
    cooldown: 0.25,
    manaCost: 12,
    chargeTime: 1.0,
    damage: 15,
    speed: 320,
    radius: 5,
    ttl: 2.0,
    light: { radius: 120, r: 140, g: 200, b: 255 },
    trailColor: '#8cd8ff',
    burstColor: '#b0e0ff',
    aura: { id: 'frozen', duration: 2.4 },
  },
  arrow: {
    type: 'projectile',
    element: 'arrow',
    name: 'Arrow',
    glyph: '\u2192',  // →
    cooldown: 0.18,
    manaCost: 0,
    chargeTime: 0.7,
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
    element: 'electric',
    name: 'Lightning',
    glyph: '\u26A1',  // ⚡
    cooldown: 0.6,
    manaCost: 28,
    chargeTime: 1.25,
    damage: 25,
    range: 280,         // max range to first target
    chainRadius: 120,   // max hop distance between targets
    maxTargets: 3,      // chain up to 3 enemies
    aura: { id: 'stunned', duration: 0.8 },
  },
  poison_orb: {
    type: 'projectile',
    element: 'poison',
    name: 'Venom Orb',
    glyph: '\u2620',  // ☠
    cooldown: 0.45,
    manaCost: 18,
    chargeTime: 0.9,
    damage: 8,
    speed: 285,
    radius: 6,
    ttl: 2.2,
    light: { radius: 105, r: 75, g: 235, b: 105 },
    trailColor: '#52e878',
    burstColor: '#80ff98',
    aura: { id: 'poisoned', duration: 4 },
  },
};
