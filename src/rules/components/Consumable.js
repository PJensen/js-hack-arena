// Consumable effect — attached to items that do something on pickup/use.
import { defineComponent } from '../../lib/ecs-js/index.js';

export const Consumable = defineComponent('Consumable', {
  effect: 'heal',    // 'heal', 'mana', etc.
  potency: 30,       // amount
});
