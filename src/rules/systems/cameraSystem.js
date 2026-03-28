// rules/systems/cameraSystem.js — follow player and update camera smoothing
import { Position } from '../components/index.js';
import { updateCamera } from '../../display/camera/controller.js';
import { followEntity } from '../../display/camera/follow.js';

export function createCameraSystem(ctx) {
  const { cam, playerId } = ctx;

  return function cameraSystem(world, dt) {
    const pos = world.get(playerId, Position);
    followEntity(cam, pos, dt);
    updateCamera(cam, dt);
  };
}
