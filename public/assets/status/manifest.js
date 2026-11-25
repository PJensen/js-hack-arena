// Status effect icon atlas: 8 columns × 4 rows, 48 × 48 px per icon.
// "existing" entries map to conditionCatalog.js; "concept" entries are art-ready ideas only.
export const statusAtlas = Object.freeze({ image: './status-atlas.svg', columns: 8, rows: 4, width: 384, height: 192, cellSize: 48 });

const entries = [
  {
    "id": "burning",
    "name": "Burning",
    "disposition": "harmful",
    "state": "existing",
    "meaning": "Fire damage over time.",
    "column": 0,
    "row": 0
  },
  {
    "id": "bleeding",
    "name": "Bleeding",
    "disposition": "harmful",
    "state": "existing",
    "meaning": "Physical damage over time.",
    "column": 1,
    "row": 0
  },
  {
    "id": "frozen",
    "name": "Frozen",
    "disposition": "harmful",
    "state": "existing",
    "meaning": "Severely reduced movement; fire hurts more.",
    "column": 2,
    "row": 0
  },
  {
    "id": "slowed",
    "name": "Slowed",
    "disposition": "harmful",
    "state": "existing",
    "meaning": "Movement speed is reduced.",
    "column": 3,
    "row": 0
  },
  {
    "id": "stunned",
    "name": "Stunned",
    "disposition": "harmful",
    "state": "existing",
    "meaning": "Movement and casting are locked briefly.",
    "column": 4,
    "row": 0
  },
  {
    "id": "immobilized",
    "name": "Immobilized",
    "disposition": "harmful",
    "state": "existing",
    "meaning": "Cannot move; other actions remain available.",
    "column": 5,
    "row": 0
  },
  {
    "id": "paralyzed",
    "name": "Paralyzed",
    "disposition": "harmful",
    "state": "existing",
    "meaning": "Nerve shock locks movement.",
    "column": 6,
    "row": 0
  },
  {
    "id": "poisoned",
    "name": "Poisoned",
    "disposition": "harmful",
    "state": "existing",
    "meaning": "Poison damage over time.",
    "column": 7,
    "row": 0
  },
  {
    "id": "ice_armor",
    "name": "Ice Armor",
    "disposition": "beneficial",
    "state": "existing",
    "meaning": "Reduces incoming damage.",
    "column": 0,
    "row": 1
  },
  {
    "id": "regeneration",
    "name": "Regeneration",
    "disposition": "beneficial",
    "state": "existing",
    "meaning": "Restores health over time.",
    "column": 1,
    "row": 1
  },
  {
    "id": "health_potion",
    "name": "Potion Healing",
    "disposition": "beneficial",
    "state": "existing",
    "meaning": "Restores health over time after a healing potion.",
    "column": 2,
    "row": 1
  },
  {
    "id": "silenced",
    "name": "Silenced",
    "disposition": "harmful",
    "state": "concept",
    "meaning": "Cannot cast spells.",
    "column": 3,
    "row": 1
  },
  {
    "id": "blinded",
    "name": "Blinded",
    "disposition": "harmful",
    "state": "concept",
    "meaning": "Vision and targeting are impaired.",
    "column": 4,
    "row": 1
  },
  {
    "id": "weakened",
    "name": "Weakened",
    "disposition": "harmful",
    "state": "concept",
    "meaning": "Outgoing damage is reduced.",
    "column": 5,
    "row": 1
  },
  {
    "id": "vulnerable",
    "name": "Vulnerable",
    "disposition": "harmful",
    "state": "concept",
    "meaning": "Takes increased incoming damage.",
    "column": 6,
    "row": 1
  },
  {
    "id": "exposed",
    "name": "Exposed",
    "disposition": "harmful",
    "state": "concept",
    "meaning": "Armor is stripped or bypassed.",
    "column": 7,
    "row": 1
  },
  {
    "id": "cursed",
    "name": "Cursed",
    "disposition": "harmful",
    "state": "concept",
    "meaning": "A lingering malign hex; mechanic reserved for future use.",
    "column": 0,
    "row": 2
  },
  {
    "id": "corroded",
    "name": "Corroded",
    "disposition": "harmful",
    "state": "concept",
    "meaning": "Armor or equipment degrades over time.",
    "column": 1,
    "row": 2
  },
  {
    "id": "shocked",
    "name": "Shocked",
    "disposition": "harmful",
    "state": "concept",
    "meaning": "A brief electrical disruption; movement or action penalty.",
    "column": 2,
    "row": 2
  },
  {
    "id": "chilled",
    "name": "Chilled",
    "disposition": "harmful",
    "state": "concept",
    "meaning": "Mild movement slow from cold.",
    "column": 3,
    "row": 2
  },
  {
    "id": "rooted",
    "name": "Rooted",
    "disposition": "harmful",
    "state": "concept",
    "meaning": "Roots bind the target in place.",
    "column": 4,
    "row": 2
  },
  {
    "id": "fear",
    "name": "Terrified",
    "disposition": "harmful",
    "state": "concept",
    "meaning": "Fear disrupts control and can force retreat.",
    "column": 5,
    "row": 2
  },
  {
    "id": "sleep",
    "name": "Asleep",
    "disposition": "harmful",
    "state": "concept",
    "meaning": "Target is incapacitated until disturbed or duration ends.",
    "column": 6,
    "row": 2
  },
  {
    "id": "confusion",
    "name": "Confused",
    "disposition": "harmful",
    "state": "concept",
    "meaning": "Target input or direction is unreliable.",
    "column": 7,
    "row": 2
  },
  {
    "id": "taunted",
    "name": "Taunted",
    "disposition": "harmful",
    "state": "concept",
    "meaning": "Target is compelled to focus on the taunting source.",
    "column": 0,
    "row": 3
  },
  {
    "id": "marked",
    "name": "Marked",
    "disposition": "harmful",
    "state": "concept",
    "meaning": "Target is singled out for tracking or bonus damage.",
    "column": 1,
    "row": 3
  },
  {
    "id": "barrier",
    "name": "Barrier",
    "disposition": "beneficial",
    "state": "concept",
    "meaning": "Absorbs a limited amount of incoming damage.",
    "column": 2,
    "row": 3
  },
  {
    "id": "fortified",
    "name": "Fortified",
    "disposition": "beneficial",
    "state": "concept",
    "meaning": "Temporarily increases resilience.",
    "column": 3,
    "row": 3
  },
  {
    "id": "haste",
    "name": "Haste",
    "disposition": "beneficial",
    "state": "concept",
    "meaning": "Movement and action speed increase.",
    "column": 4,
    "row": 3
  },
  {
    "id": "empowered",
    "name": "Empowered",
    "disposition": "beneficial",
    "state": "concept",
    "meaning": "Next attack or spell is strengthened.",
    "column": 5,
    "row": 3
  },
  {
    "id": "blessed",
    "name": "Blessed",
    "disposition": "beneficial",
    "state": "concept",
    "meaning": "A protective blessing; exact mechanic reserved for future use.",
    "column": 6,
    "row": 3
  },
  {
    "id": "lifesteal",
    "name": "Siphoning",
    "disposition": "beneficial",
    "state": "concept",
    "meaning": "Damage dealt returns a portion as health.",
    "column": 7,
    "row": 3
  }
];
export const statusIcons = Object.freeze(Object.fromEntries(entries.map((entry) => [entry.id, Object.freeze({ ...entry, x: entry.column / statusAtlas.columns, y: entry.row / statusAtlas.rows, width: 1 / statusAtlas.columns, height: 1 / statusAtlas.rows })])));
export default statusIcons;
