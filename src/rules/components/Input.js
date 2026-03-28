// Latest input state from the player's controller (joysticks / keyboard).
// Written by the input system each frame; read by movement & aiming systems.
import { defineComponent } from '../../lib/ecs-js/index.js';

export const Input = defineComponent('Input', {
  moveX: 0,      // left-stick X  [-1, 1]
  moveY: 0,      // left-stick Y  [-1, 1]
  aimX: 0,       // right-stick X [-1, 1]
  aimY: 0,       // right-stick Y [-1, 1]
  fire: false,   // trigger held
});
