// Bounding circle for SDF sweep collision.
import { defineComponent } from '../../lib/ecs-js/index.js';

export const Collider = defineComponent('Collider', { radius: 14 }, {
  validate(rec) {
    if (typeof rec.radius !== 'number' || rec.radius <= 0)
      throw new Error('Collider.radius must be a positive number');
    return true;
  }
});
