// Inventory capacity tag — attach to entities that can hold items.
// Items are child entities linked via ecs-js hierarchy (attach/detach).
// Query with childrenWith(world, ownerId, ItemInfo) to list items.
import { defineComponent } from '../../lib/ecs-js/index.js';

export const Inventory = defineComponent('Inventory', {
  capacity: 10,
});
