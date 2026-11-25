import { defineComponent } from '../../lib/ecs-js/index.js';

export const MINING_SECONDS = 1.5;
export const Mining = defineComponent('Mining', { siteId: 0, remaining: MINING_SECONDS });
