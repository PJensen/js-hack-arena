import { assert, assertEquals } from 'https://deno.land/std@0.220.0/assert/mod.ts';
import { Position } from '../public/src/rules/components/index.js';
import { getMiningMaterial } from '../public/src/rules/data/miningMaterials.js';
import { SIM_MODE, createArenaSimulation } from '../public/src/rules/sim/arenaSim.js';

const wallOre = { x: 100, y: 200, normalX: 1, normalY: 0, kind: 'copper' };
const start = { x: 60, y: 200 };
const distanceMove = (x) => Math.max(0, Math.min(80, 118 - x));

function makeSim({ seed = 42, grid = { cellSize: 8, distanceMove }, ore = wallOre, mode } = {}) {
  return createArenaSimulation({ seed, grid, oreSites: [ore], mode, spawns: [start], enemyCount: 0 });
}

const drops = (sim) => sim.captureSnapshot().entities
  .filter(({ state }) => getMiningMaterial(state.effect));

Deno.test('mining validates range, intent, and clear access, then breaks a deposit once', () => {
  let obstructed = false;
  const grid = { cellSize: 8, distanceMove: (x) => obstructed && x > 72 && x < 82 ? 0 : distanceMove(x) };
  const sim = makeSim({ seed: 1, grid });
  const miner = sim.addPlayer('miner');
  sim.addPlayer('other');
  const mine = (peer, ore = wallOre) => sim.setPlayerInput(peer, { pickupX: ore.x, pickupY: ore.y, mine: true });
  const pos = sim.world.get(miner, Position);
  pos.x = start.x - 1;
  mine('miner');
  sim.step();
  assertEquals(drops(sim), []);
  pos.x = start.x;
  obstructed = true;
  mine('miner');
  sim.step();
  assertEquals(drops(sim), []);
  obstructed = false;
  mine('miner', { ...wallOre, y: wallOre.y + 30 });
  sim.step();
  sim.setPlayerInput('miner', { pickupX: wallOre.x, pickupY: wallOre.y });
  sim.step();
  assertEquals(drops(sim), []);

  mine('miner');
  mine('other');
  sim.step();
  assertEquals(sim.getMineableOre(), []);
  assertEquals(drops(sim).map(({ state }) => state.effect), ['copper_ore', 'copper_ore', 'copper_ore']);
});

Deno.test('mining yields collectible rocks and seeded gems that rebound before settling', () => {
  const sim = makeSim();
  const miner = sim.addPlayer('miner');
  const pos = sim.world.get(miner, Position);
  sim.setPlayerInput('miner', { pickupX: wallOre.x, pickupY: wallOre.y, mine: true });
  sim.step();
  const initial = drops(sim);
  const gem = initial.find(({ state }) => getMiningMaterial(state.effect).shape === 'gem');
  assert(gem);
  assertEquals(gem.state.effect, 'black_opal');
  assertEquals(initial.length, 4);
  assert(initial.every(({ state }) => state.tossHeight === 0));

  Object.assign(pos, wallOre);
  const heights = [];
  for (let i = 0; i < 10; i++) {
    sim.step();
    heights.push(drops(sim).find(({ id }) => id === initial[0].id).state.tossHeight);
  }
  assert(Math.max(...heights.slice(0, 6)) >= 15);
  assert(heights[8] > heights[7]);
  assertEquals(sim.getPlayerSnapshot('miner').state.materials, {});
  sim.step();
  const landed = drops(sim);
  assertEquals(landed.length, 4);
  for (const { state } of landed) {
    assertEquals(state.tossHeight, undefined);
    assert(distanceMove(state.x) >= 14);
    Object.assign(pos, { x: state.x, y: state.y });
    sim.step();
  }
  assertEquals(drops(sim), []);
  assertEquals(sim.getPlayerSnapshot('miner').state.materials, { copper_ore: 3, [gem.state.effect]: 1 });
});

Deno.test('replicas learn which buried deposits are exposed and mined from snapshots', () => {
  let carved = false;
  const ore = { ...wallOre, x: 116, buried: true };
  const sim = makeSim({ ore, grid: { cellSize: 8, distanceMove: (x) => carved ? 40 : distanceMove(x) } });
  const pos = sim.world.get(sim.addPlayer('miner'), Position);
  pos.x = 80;
  const replica = makeSim({ ore, mode: SIM_MODE.REPLICA });
  sim.setPlayerInput('miner', { pickupX: ore.x, pickupY: ore.y, mine: true });
  sim.step();
  replica.applySnapshot(sim.captureSnapshot());
  assertEquals(replica.getMineableOre(), []);
  assertEquals(drops(sim), []);

  carved = true;
  sim.step();
  replica.applySnapshot(sim.captureSnapshot());
  assertEquals(replica.getMineableOre().map(({ x }) => x), [116]);

  sim.setPlayerInput('miner', { pickupX: ore.x, pickupY: ore.y, mine: true });
  sim.step();
  const lateReplica = makeSim({ ore, mode: SIM_MODE.REPLICA });
  lateReplica.applySnapshot(sim.captureSnapshot());
  assertEquals(lateReplica.getMineableOre(), []);
  assertEquals(drops(lateReplica), drops(sim));
});
