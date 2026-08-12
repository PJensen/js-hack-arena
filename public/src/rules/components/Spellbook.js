import { defineComponent } from '../../lib/ecs-js/index.js';

export const SpellId = Object.freeze({
  FROST_BOLT: 'frost_bolt',
  LIGHTNING:  'lightning',
  ARROW:      'arrow',
  POISON_ORB: 'poison_orb',
  ICE_ARMOR:  'ice_armor',
  BLIZZARD:   'blizzard',
  REGENERATION: 'regeneration',
});

export const Spellbook = defineComponent('Spellbook', {
  spells: [],          // array of SpellId values
  activeIndex: 0,      // currently selected spell
  cooldown: 0,         // shared cooldown timer
  cooldowns: {},       // individual cooldown seconds keyed by spell ID
  castPhase: 'idle',   // idle, casting, charging, or channeling
  castMode: 'instant',
  charge: 0,           // seconds the current cast has been held
  charging: false,     // presentation-friendly active cast flag
  chargeAimX: 0,
  chargeAimY: 0,
  chargeSpellIndex: 0,
  castTargetX: 0,
  castTargetY: 0,
  channelRemaining: 0,
  triggerHeld: false,
});
