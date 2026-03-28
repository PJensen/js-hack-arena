// Item metadata — attach to any entity that can be picked up / equipped.
import { defineComponent } from '../../lib/ecs-js/index.js';

export const ItemSlot = Object.freeze({
  NONE:    'none',
  HAND:    'hand',
  OFFHAND: 'offhand',
});

export const ItemInfo = defineComponent('ItemInfo', {
  name:  '',
  glyph: '?',
  slot:  ItemSlot.NONE,
  count: 1,
});
