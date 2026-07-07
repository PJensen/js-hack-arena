// Continuous 2D world position (not integer-snapped — this is real-time).
import { defineComponent } from '../../lib/ecs-js/index.js';

export const Position = defineComponent('Position', { x: 0, y: 0 });
