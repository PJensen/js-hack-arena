import { defineComponent } from '../../lib/ecs-js/index.js';

export const SpellId = Object.freeze({
  FROST_BOLT: 'frost_bolt',
  LIGHTNING:  'lightning',
  ARROW:      'arrow',
  POISON_ORB: 'poison_orb',
});

export const Spellbook = defineComponent('Spellbook', {
  spells: [],          // array of SpellId values
  activeIndex: 0,      // currently selected spell
  cooldown: 0,         // shared cooldown timer
  charge: 0,           // seconds the current cast has been held
  charging: false,     // previous trigger state, used to cast on release
  chargeAimX: 0,
  chargeAimY: 0,
  chargeSpellIndex: 0,
});
