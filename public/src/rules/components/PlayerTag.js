// Tag component — marks the local player entity. Query with world.query(PlayerTag).
import { defineTag } from '../../lib/ecs-js/index.js';

export const PlayerTag = defineTag('PlayerTag');
