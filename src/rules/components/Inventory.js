// Inventory — items are entity IDs held by this entity.
import { defineComponent } from '../../lib/ecs-js/index.js';

export const Inventory = defineComponent('Inventory', {
  items: [],
  capacity: 10,
});
