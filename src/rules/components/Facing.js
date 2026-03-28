// Direction the entity is facing, in radians.  Decoupled from movement.
import { defineComponent } from '../../lib/ecs-js/index.js';

export const Facing = defineComponent('Facing', { angle: 0 });
