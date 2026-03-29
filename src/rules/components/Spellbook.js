import { defineComponent } from '../../lib/ecs-js/index.js';

export const SpellId = Object.freeze({
  FROST_BOLT: 'frost_bolt',
  LIGHTNING:  'lightning',
});

export const Spellbook = defineComponent('Spellbook', {
  spells: [],          // array of SpellId values
  activeIndex: 0,      // currently selected spell
  cooldown: 0,         // shared cooldown timer
});
