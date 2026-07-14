import { assertEquals } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { createSnapshotInterpolator } from '../public/src/display/snapshotInterpolator.js';
import { createLocalPlayerPrediction } from '../public/src/display/localPlayerPrediction.js';
import { Position } from '../public/src/rules/components/index.js';
import { SIM_MODE, createArenaSimulation } from '../public/src/rules/sim/arenaSim.js';

function makeSim(mode) {
  const grid = {
    cellSize: 4,
    cols: 64,
    rows: 64,
    moveGrid: new Float32Array(64 * 64).fill(100),
    distanceMove: () => 100,
  };
  return createArenaSimulation({
    seed: 1,
    grid,
    spawns: [{ x: 10, y: 10 }],
    mode,
    enemyCount: 0,
  });
}

Deno.test('snapshot interpolation does not mutate authoritative positions', () => {
  let now = 0;
  const authority = makeSim(SIM_MODE.AUTHORITY);
  authority.addPlayer('peer-a');
  const replica = makeSim(SIM_MODE.REPLICA);
  replica.applySnapshot(authority.captureSnapshot());
  const interpolator = createSnapshotInterpolator({ sim: replica, intervalMs: 100, now: () => now });

  authority.setPlayerInput('peer-a', { seq: 1, moveX: 1 });
  authority.step(0.5);
  interpolator.applySnapshot(authority.captureSnapshot());

  const entityId = replica.getPlayerEntity('peer-a');
  const authoritative = replica.world.get(entityId, Position);
  assertEquals(authoritative.x, 110);
  assertEquals(interpolator.position(entityId, authoritative).x, 10);
  now = 50;
  assertEquals(interpolator.position(entityId, authoritative).x, 60);
  now = 100;
  assertEquals(interpolator.position(entityId, authoritative).x, 110);
  assertEquals(replica.world.get(entityId, Position).x, 110);
});

Deno.test('local prediction is presentation-only', () => {
  const authority = makeSim(SIM_MODE.AUTHORITY);
  authority.addPlayer('peer-a');
  const replica = makeSim(SIM_MODE.REPLICA);
  replica.applySnapshot(authority.captureSnapshot());
  const playerId = replica.getPlayerEntity('peer-a');
  const grid = {
    distanceMove: () => 100,
  };
  const prediction = createLocalPlayerPrediction({ world: replica.world, playerId, grid });

  prediction.step({ intent: { moveX: 1, moveY: 0 } }, 0.25);
  assertEquals(prediction.position().x, 60);
  assertEquals(replica.world.get(playerId, Position).x, 10);
});
