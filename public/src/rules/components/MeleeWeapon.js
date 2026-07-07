// Melee weapon stats — bump damage scales from this.
import { defineComponent } from '../../lib/ecs-js/index.js';

export const MeleeWeapon = defineComponent('MeleeWeapon', {
  damage: 5,
  name: 'Fists',
  glyph: '\u270A',  // ✊
});
