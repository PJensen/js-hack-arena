import { defineComponent } from '../../lib/ecs-js/index.js';

// Arrows lodged in a living enemy are recovered from its corpse.
export const RecoverableArrows = defineComponent('RecoverableArrows', {
  count: 0,
});
