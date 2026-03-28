// Marks an entity as a controllable actor and carries display metadata.
import { defineComponent } from '../../lib/ecs-js/index.js';

export const ActorKind = Object.freeze({
  PLAYER: 'player',
  MOB:    'mob',
  NPC:    'npc',
});

export const Actor = defineComponent('Actor', {
  kind: ActorKind.PLAYER,
  name: '',
  glyph: '@',
});
