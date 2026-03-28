// Point light source — attach to any entity with a Position.
import { defineComponent } from '../../lib/ecs-js/index.js';

export const PointLight = defineComponent('PointLight', {
  radius: 350,
  r: 255,
  g: 190,
  b: 120,
  enabled: true,
});
