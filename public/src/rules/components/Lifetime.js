// Time-to-live in seconds.  Entities with Lifetime are destroyed when ttl <= 0.
import { defineComponent } from '../../lib/ecs-js/index.js';

export const Lifetime = defineComponent('Lifetime', { ttl: 1.0 });
