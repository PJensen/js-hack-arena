import { defineComponent } from '../../lib/ecs-js/index.js';

export const BowWeapon = defineComponent('BowWeapon', {
  equipped: false,
  name: '',
  glyph: ')',
  rarity: '',
  damage: 0,
  infiniteArrows: false,
});
