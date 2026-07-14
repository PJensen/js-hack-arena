import { updateCamera } from './controller.js';
import { followEntity } from './follow.js';
import { Position } from '../../rules/components/index.js';

export function createCameraSystem({ cam, playerId, positionFor = (_id, position) => position }) {
  return function cameraSystem(world, dt) {
    const authoritativePosition = world.get(playerId, Position);
    const position = positionFor(playerId, authoritativePosition);
    followEntity(cam, position, dt);
    updateCamera(cam, dt);
  };
}
