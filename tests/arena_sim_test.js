import {
  assert,
  assertAlmostEquals,
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.220.0/assert/mod.ts";
import { AI, Facing, Health, Input, Position } from '../public/src/rules/components/index.js';
import { generateCave, CaveProfile } from '../public/src/rules/geometry/caveGen.js';
import {
  SIM_DT,
  SIM_MODE,
  SIM_SNAPSHOT_VERSION,
  createArenaSimulation,
  normalizeSnapshot,
} from '../public/src/rules/sim/arenaSim.js';

function makeCave(seed = 1234) {
  return generateCave({
    seed,
    width: 1000,
    height: 1000,
    profile: CaveProfile.CAVERNS,
    spawnCount: 2,
  });
}

function makeSim(seed = 1234, options = {}) {
  const cave = makeCave(seed);
  return createArenaSimulation({ seed, grid: cave.grid, spawns: cave.spawns, enemyCount: 0, ...options });
}

function makeOpenSim(seed = 1234, options = {}) {
  const grid = {
    cellSize: 4,
    cols: 256,
    rows: 256,
    moveGrid: new Float32Array(256 * 256).fill(100),
    distanceMove: () => 100,
  };
  return createArenaSimulation({
    seed,
    grid,
    spawns: [{ x: 100, y: 100 }, { x: 500, y: 500 }],
    ...options,
  });
}

Deno.test("arena sim: player movement uses the canonical command and movement path", () => {
  const sim = makeSim();
  const playerId = sim.addPlayer('peer-a', 0);
  const before = { ...sim.world.get(playerId, Position) };

  sim.setPlayerInput('peer-a', {
    moveX: 5,
    moveY: 0,
    aimX: 1,
    aimY: 0,
    fire: true,
  });
  sim.step(SIM_DT);

  const after = sim.world.get(playerId, Position);
  const input = sim.world.get(playerId, Input);
  const facing = sim.world.get(playerId, Facing);
  assert(after.x > before.x);
  assertAlmostEquals(after.y, before.y, 1);
  assertEquals(input.moveX, 1);
  assertEquals(input.fire, true);
  assertAlmostEquals(facing.angle, 0, 1e-6);
  assertEquals(sim.getTick(), 1);
});

Deno.test("arena sim: reordered input commands are rejected canonically", () => {
  const sim = makeSim();
  const playerId = sim.addPlayer('peer-a');
  assertEquals(sim.setPlayerInput('peer-a', { seq: 2, moveX: 1 }), true);
  assertEquals(sim.setPlayerInput('peer-a', { seq: 1, moveX: -1 }), false);
  assertEquals(sim.world.get(playerId, Input).moveX, 1);
  assertEquals(sim.captureSnapshot().entities.find((entity) => entity.kind === 'player').inputSeq, 2);
});

Deno.test("arena sim: identical seeds and commands produce identical snapshots", () => {
  const left = makeSim(42);
  const right = makeSim(42);
  for (const sim of [left, right]) {
    sim.addPlayer('peer-a', 0);
    sim.addPlayer('peer-b', 1);
  }

  for (let tick = 0; tick < 8; tick++) {
    const command = {
      moveX: tick < 4 ? 0.75 : -0.25,
      moveY: 0.5,
      aimX: -1,
      aimY: 0.25,
    };
    for (const sim of [left, right]) {
      sim.setPlayerInput('peer-a', command);
      sim.setPlayerInput('peer-b', { ...command, moveY: -command.moveY });
      sim.step();
    }
  }

  assertEquals(left.captureSnapshot(), right.captureSnapshot());
});

Deno.test("arena sim: room-local enemy pipelines do not leak across worlds", () => {
  const left = makeOpenSim(52, { enemyCount: 1, respawnEnemies: false });
  const right = makeOpenSim(52, { enemyCount: 1, respawnEnemies: false });
  for (const sim of [left, right]) {
    sim.addPlayer('peer-a');
    sim.setPlayerInput('peer-a', { seq: 1, moveX: 0.5, aimX: 1, fire: true });
  }
  for (let i = 0; i < 12; i++) {
    left.step();
    right.step();
  }
  assertEquals(left.captureSnapshot(), right.captureSnapshot());
});

Deno.test("arena sim: an authoritative snapshot resolves a replica world", () => {
  const authority = makeSim(77);
  authority.addPlayer('peer-a', 0);
  authority.addPlayer('peer-b', 1);
  authority.setPlayerInput('peer-b', { moveX: 1, aimY: 1 });
  authority.step();
  const snapshot = authority.captureSnapshot();

  const replica = makeSim(77, { mode: SIM_MODE.REPLICA });
  assertEquals(replica.applySnapshot(snapshot), true);
  assertEquals(replica.captureSnapshot(), snapshot);
  assertEquals(replica.applySnapshot(snapshot), false);

  authority.removePlayer('peer-b');
  authority.step();
  assertEquals(replica.applySnapshot(authority.captureSnapshot()), true);
  assertEquals(replica.getPlayerEntity('peer-b'), null);
  assertEquals(replica.captureSnapshot(), authority.captureSnapshot());
});

Deno.test("arena sim: same-tick joins have a newer revision and become visible", () => {
  const authority = makeSim(91);
  authority.addPlayer('peer-a');
  const first = authority.captureSnapshot();
  const replica = makeSim(91, { mode: SIM_MODE.REPLICA });
  replica.applySnapshot(first);

  authority.addPlayer('peer-b');
  const joined = authority.captureSnapshot();
  assertEquals(joined.tick, first.tick);
  assert(joined.revision > first.revision);
  assertEquals(replica.applySnapshot(joined), true);
  assert(replica.getPlayerEntity('peer-a') != null);
  assert(replica.getPlayerEntity('peer-b') != null);
});

Deno.test("arena sim: combat, projectiles, deaths, and loot are authoritative", () => {
  const sim = makeOpenSim(123, { enemyCount: 1, respawnEnemies: false });
  sim.addPlayer('peer-a');
  const mobId = [...sim.world.query(AI)][0][0];
  const initialHp = sim.world.get(mobId, Health).hp;

  sim.setPlayerInput('peer-a', { seq: 1, aimX: 1, fire: true, spellSlot: 1 });
  sim.step();
  assert(sim.world.get(mobId, Health).hp < initialHp);
  assert(sim.captureSnapshot().events.some((event) => event.type === 'spell.bolt'));

  sim.setPlayerInput('peer-a', { seq: 2, aimX: 1, fire: true, spellSlot: 0 });
  for (let i = 0; i < 13; i++) sim.step();
  sim.setPlayerInput('peer-a', { seq: 3, aimX: 1, fire: false, spellSlot: 0 });
  for (let i = 0; i < 20; i++) sim.step();
  assert(sim.captureSnapshot().events.some((event) => event.type === 'projectile.hit'));

  sim.world.get(mobId, Health).hp = 0;
  sim.step();
  const afterDeath = sim.captureSnapshot();
  assertEquals(afterDeath.entities.some((entity) => entity.kind === 'mob'), false);
  assert(afterDeath.entities.some((entity) => entity.kind === 'item'));
  assert(afterDeath.events.some((event) => event.type === 'entity.died'));
});

Deno.test("arena sim: replica re-emits new presentation events once", () => {
  const authority = makeOpenSim(456, { enemyCount: 1 });
  authority.addPlayer('peer-a');
  const replica = makeOpenSim(456, { mode: SIM_MODE.REPLICA });
  replica.applySnapshot(authority.captureSnapshot());
  let bolts = 0;
  replica.world.on('spell.bolt', () => bolts++);

  authority.setPlayerInput('peer-a', { seq: 1, aimX: 1, fire: true, spellSlot: 1 });
  authority.step();
  const combat = authority.captureSnapshot();
  replica.applySnapshot(combat);
  replica.applySnapshot(combat);
  assertEquals(bolts, 1);
});

Deno.test("arena sim: enemy projectiles retain faction and owner identity after enemy death", () => {
  const authority = makeOpenSim(789, { enemyCount: 1, respawnEnemies: false });
  authority.addPlayer('peer-a');
  authority.step(); // the caster fires immediately
  const mobId = [...authority.world.query(AI)][0][0];
  authority.world.get(mobId, Health).hp = 0;
  authority.step();

  const snapshot = authority.captureSnapshot();
  const enemyProjectile = snapshot.entities.find((entity) => entity.kind === 'projectile' && entity.state.team === 'enemies');
  assert(enemyProjectile);
  assert(enemyProjectile.state.owner.startsWith('mob:'));
  const replica = makeOpenSim(789, { mode: SIM_MODE.REPLICA });
  assertEquals(replica.applySnapshot(snapshot), true);
});

Deno.test("arena sim: snapshot records are versioned and validated", () => {
  const state = {
    x: 0, y: 0, vx: 0, vy: 0, facing: 0, radius: 14, hp: 100, maxHp: 100,
    spells: ['frost_bolt'], activeSpell: 0, cooldown: 0,
    weapon: { name: 'Fists', glyph: '!', damage: 5 },
  };
  assertThrows(() => normalizeSnapshot({ version: 999, tick: 0, entities: [] }));
  assertThrows(() => normalizeSnapshot({
    version: SIM_SNAPSHOT_VERSION,
    tick: 0,
    revision: 0,
    events: [],
    entities: [
      { id: 'player:a', kind: 'player', owner: 'a', inputSeq: 0, state },
      { id: 'player:b', kind: 'player', owner: 'a', inputSeq: 0, state },
    ],
  }));
  assertThrows(() => normalizeSnapshot({
    version: SIM_SNAPSHOT_VERSION,
    tick: 0,
    revision: 0,
    events: [],
    entities: [{ id: 'player:a', kind: 'player', owner: 'a', inputSeq: 0, state: { ...state, x: Infinity } }],
  }));
});
