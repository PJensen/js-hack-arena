import {
  assert,
  assertAlmostEquals,
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.220.0/assert/mod.ts";
import { AI, Actor, Auras, Conditions, Facing, Gold, Health, Input, ItemInfo, Lifetime, Mana, PointLight, Position, Powerups, Projectile, Ring, Spellbook, Stamina, Collider } from '../public/src/rules/components/index.js';
import { generateArenaCave, generateCave, CaveProfile } from '../public/src/rules/geometry/caveGen.js';
import { GOLD_LIGHT, LOOT_GOBLIN_LIGHT, attachAuraEmitter, spawnAuraField, spawnBat, spawnEpicChest, spawnEpicSword, spawnFlamingBat, spawnFloatingEye, spawnFuryRune, spawnGasSpore, spawnHasteRune, spawnItem, spawnLootGoblin, spawnManaPotion, spawnManaSurge, spawnMelee, spawnPotion, spawnRing, spawnSpider, spawnSpellbook, spawnSword, spawnWardRune } from '../public/src/rules/spawner.js';
import { BAT_SHRIEK_WINDUP, GAZE_CHARGE_SECONDS } from '../public/src/rules/components/AI.js';
import { applyAura, applyCondition, applyDamage } from '../public/src/rules/effects.js';
import { getStatMultiplier } from '../public/src/rules/stats.js';
import { ConditionId } from '../public/src/rules/data/conditionCatalog.js';
import { EffectKind, EffectStat } from '../public/src/rules/data/effectCatalog.js';
import { SpellCastMode, spells as spellCatalog } from '../public/src/rules/data/spellCatalog.js';
import { getPreviewMob, spawnPreviewMob } from '../public/src/runtime/mobPreview.js';
import { createArenaDungeonSimulation } from '../public/src/rules/sim/arenaDungeon.js';
import { getMiningMaterial } from '../public/src/rules/data/miningMaterials.js';
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

Deno.test('loot goblin: sight starts a chase around a hallway bend and escape replicates once', () => {
  const clearance = (x, y, left, top, right, bottom) => Math.min(x - left, y - top, right - x, bottom - y);
  const grid = {
    cellSize: 4,
    distanceMove: (x, y) => Math.max(
      clearance(x, y, 60, 65, 252, 135),
      clearance(x, y, 210, 90, 282, 420),
    ),
  };
  const sim = makeOpenSim(42, { enemyCount: 0, grid, spawns: [{ x: 100, y: 100 }] });
  sim.addPlayer('chaser');
  const goblin = spawnLootGoblin(sim.world, grid, 180, 100, null);
  const position = sim.world.get(goblin, Position);
  const radius = sim.world.get(goblin, Collider).radius;
  for (let i = 0; i < 38; i++) {
    sim.step();
    assert(grid.distanceMove(position.x, position.y) >= radius - 0.01);
  }
  assert(position.y > 160, 'goblin should turn down the hallway away from the player');
  const gold = (snapshot) => snapshot.entities.filter(({ state }) => state.effect === 'gold');
  assert(gold(sim.captureSnapshot()).length > 0);

  for (let i = 38; i < 241; i++) sim.step();
  const stopped = { ...position };
  const windingUp = sim.captureSnapshot();
  const mob = windingUp.entities.find(({ state }) => state.theme === 'loot_goblin');
  assert(mob.state.escapeWindup > 0);
  const replica = makeOpenSim(42, { mode: SIM_MODE.REPLICA, grid });
  const flashes = [];
  replica.world.on('loot_goblin.escaped', ({ x, y }) => flashes.push({ x, y }));
  replica.applySnapshot(windingUp);
  const [copyId, copyAI] = [...replica.world.query(AI)][0];
  assertEquals(copyAI.escapeWindup, mob.state.escapeWindup);
  assertEquals(replica.world.get(copyId, PointLight), { enabled: true, ...LOOT_GOBLIN_LIGHT });
  for (let i = 0; i < 24; i++) sim.step();
  // A loot entity can reuse the ECS slot before the next network snapshot.
  spawnItem(sim.world, stopped.x, stopped.y, { type: 'copper_ore' });
  const escaped = sim.captureSnapshot();
  replica.applySnapshot(escaped);
  assertEquals(replica.world.alive.has(copyId), false);
  assertEquals(replica.applySnapshot(escaped), false);
  assertEquals(flashes, [stopped]);
  assertEquals(gold(escaped).length, gold(windingUp).length);
  assert(escaped.entities.some(({ state }) => getMiningMaterial(state.effect)?.shape === 'gem'));
  assert(escaped.entities.some(({ id, state }) => id.startsWith('item:') && state.effect === 'copper_ore'));
  assert(!escaped.events.some(({ type }) => type === 'entity.died'));
  sim.addPlayer('late');
  assert(!sim.captureSnapshot().entities.some(({ state }) => state.theme === 'loot_goblin'));
});

Deno.test('loot goblin: roams without line of sight and spills treasure on hits and death', () => {
  const grid = {
    cellSize: 4,
    distanceMove: (x) => x >= 130 && x <= 150 ? 0 : Math.min(Math.abs(x - 130), Math.abs(x - 150)),
  };
  const sim = makeOpenSim(42, { enemyCount: 0, grid });
  const player = sim.addPlayer('chaser');
  const goblin = spawnLootGoblin(sim.world, grid, 185, 100, null);
  const position = sim.world.get(goblin, Position);
  for (let i = 0; i < 25; i++) sim.step();
  assert(Math.hypot(position.x - 185, position.y - 100) > 35);
  const loot = () => sim.captureSnapshot().entities.filter(({ kind }) => kind === 'item').map(({ state }) => state);
  assertEquals(loot(), []);

  applyDamage(sim.world, goblin, 1, { sourceId: player, periodic: true });
  assertEquals(loot(), []);
  applyDamage(sim.world, goblin, 5, { sourceId: player });
  assertEquals(loot().filter(({ effect }) => effect === 'gold').length, 1);
  assertEquals(loot().filter(({ effect }) => getMiningMaterial(effect)?.shape === 'gem').length, 1);
  for (let i = 0; i < 241; i++) sim.step();
  assert(sim.world.get(goblin, AI).escapeWindup > 0, 'a hit starts the timer without sight');
  applyDamage(sim.world, goblin, 200, { sourceId: player });
  for (let i = 0; i < 30; i++) sim.step();
  assert(!sim.world.has(goblin, AI));
  assert(loot().some(({ effect, count }) => effect === 'gold' && count === 18));
  assertEquals(sim.captureSnapshot().events.filter(({ type }) => type === 'loot_goblin.escaped'), []);
});

Deno.test("spell catalog: all spells compose a cast mode and global cooldown", () => {
  const modes = new Set();
  for (const spell of Object.values(spellCatalog)) {
    assert(spell.globalCooldown > 0);
    assert(spell.cooldown >= 0);
    assert(spell.targeting?.type);
    assert(spell.delivery?.kind);
    assert(Array.isArray(spell.impacts));
    modes.add(spell.cast.mode);
  }
  assertEquals([...modes].sort(), Object.values(SpellCastMode).sort());
});

function spawnIdleTarget(sim, x, y) {
  const id = spawnMelee(sim.world, { distanceMove: () => 100 }, x, y, null);
  Object.assign(sim.world.get(id, Position), { x, y });
  sim.world.get(id, AI).aggroRange = 0;
  const health = sim.world.get(id, Health);
  health.hp = health.maxHp = 100;
  return { id, health };
}

Deno.test("arena sim: Cleave hits its arc, respects walls and spends replicated stamina", () => {
  const grid = {
    cellSize: 4,
    cols: 256,
    rows: 256,
    moveGrid: new Float32Array(256 * 256).fill(100),
    distanceMove: (x, y) => x > 123 && x < 142 && y < 94 ? 0 : 100,
  };
  const sim = makeOpenSim(915, { enemyCount: 0, grid });
  const playerId = sim.addPlayer('peer-a');
  const front = spawnIdleTarget(sim, 145, 100);
  const flank = spawnIdleTarget(sim, 141, 145);
  const behindWall = spawnIdleTarget(sim, 157, 72);
  const behind = spawnIdleTarget(sim, 60, 100);
  const outOfRange = spawnIdleTarget(sim, 185, 113);
  const book = sim.world.get(playerId, Spellbook);
  const stamina = sim.world.get(playerId, Stamina);
  assertEquals(book.spells.slice(2), ['cleave', 'rend']);
  assertEquals(stamina.stamina, 100);

  sim.setPlayerInput('peer-a', { seq: 1, aimX: 1, fire: true, spellSlot: 2 });
  sim.step();
  assertEquals(book.castPhase, 'charging');
  assertEquals(stamina.stamina, 100);
  assertEquals(front.health.hp, 100);
  sim.setPlayerInput('peer-a', { seq: 2, fire: false });
  sim.step();
  assertEquals([front.health.hp, flank.health.hp], [82, 82]);
  assertEquals([behindWall.health.hp, behind.health.hp, outOfRange.health.hp], [100, 100, 100]);
  assertEquals(stamina.stamina, 75);
  assertEquals(sim.world.get(playerId, Mana).mana, 100);

  const replica = makeOpenSim(915, { mode: SIM_MODE.REPLICA });
  for (let i = 0; i < 12; i++) replica.world.create();
  const casts = [];
  const damage = [];
  replica.world.on('spell.cast', (event) => casts.push(event));
  replica.world.on('damage.dealt', (event) => damage.push(event));
  const snapshot = sim.captureSnapshot();
  replica.applySnapshot(snapshot);
  replica.applySnapshot(snapshot);
  const replicaPlayer = replica.getPlayerEntity('peer-a');
  const replicaStamina = replica.world.get(replicaPlayer, Stamina);
  assertEquals(replicaStamina.stamina, 75);
  assertEquals(casts.map(({ spellId, angle }) => [spellId, angle]), [['cleave', 0]]);
  assert(replicaPlayer !== playerId);
  assertEquals(casts[0].playerId, replicaPlayer);
  assertAlmostEquals(casts[0].meleeArc.halfAngle * 360 / Math.PI, 140.4);
  assertEquals(casts[0].meleeArc.range, 70);
  assertEquals(casts[0].meleeArc.hits.map(({ targetTheme }) => targetTheme), ['fire', 'fire']);
  assertEquals(damage[0].impactAngle, 0);
  assertEquals(damage.map(({ target, meleeArc, hpLost }) => [target, meleeArc, hpLost]),
    casts[0].meleeArc.hits.map(({ target, amount }) => [target, true, amount]));
  assertEquals(casts[0].meleeArc.hits.map(({ target, x, y }) => {
    assert(target !== front.id && target !== flank.id);
    assertEquals(replica.world.get(target, Position), { x, y });
    return replica.world.get(target, Health).hp;
  }), [82, 82]);

  for (let i = 0; i < 13; i++) sim.step();
  assertEquals(stamina.stamina, 75);
  for (let i = 0; i < 20; i++) sim.step();
  assertAlmostEquals(stamina.stamina, 83);
  for (let i = 0; i < 43; i++) sim.step();
  assertEquals(stamina.stamina, 100);
  assertEquals(front.health.hp, 82);
});

Deno.test("arena sim: Rend picks the closest target, applies a finite bleed and denies low stamina", () => {
  const sim = makeOpenSim(916, { enemyCount: 0 });
  const playerId = sim.addPlayer('peer-a');
  const near = spawnIdleTarget(sim, 142, 90);
  const far = spawnIdleTarget(sim, 150, 122);
  const stamina = sim.world.get(playerId, Stamina);
  sim.setPlayerInput('peer-a', { seq: 1, aimX: 1, fire: true, spellSlot: 3 });
  sim.step();
  sim.setPlayerInput('peer-a', { seq: 2, fire: false });
  sim.step();
  assertEquals(stamina.stamina, 80);
  assertEquals(near.health.hp, 88);
  assertEquals(far.health.hp, 100);
  assert(sim.world.get(near.id, Auras).active.some((condition) => condition.id === 'bleeding'));

  for (let i = 0; i < 90; i++) sim.step();
  assertEquals(near.health.hp, 72);
  assertEquals(far.health.hp, 100);
  assertEquals(sim.world.get(near.id, Auras).active, []);
  stamina.stamina = 10;
  stamina.regenPerSecond = 0;
  sim.setPlayerInput('peer-a', { seq: 3, aimX: 1, fire: true });
  sim.step();
  sim.setPlayerInput('peer-a', { seq: 4, fire: false });
  sim.step();
  assertEquals(stamina.stamina, 10);
  assertEquals(near.health.hp, 72);
  assert(sim.captureSnapshot().events.some((event) =>
    event.type === 'spell.denied' && event.payload.reason === 'stamina' && event.payload.spellId === 'rend'
  ));
});

Deno.test('arena sim: melee charges cap while held and resolve once on release', () => {
  for (const [spellId, slot, damage, staminaCost] of [['cleave', 2, 27, 25], ['rend', 3, 15, 20]]) {
    const sim = makeOpenSim(917, { enemyCount: 0 });
    const player = sim.addPlayer('peer-a');
    const target = spawnIdleTarget(sim, 145, 100);
    const book = sim.world.get(player, Spellbook);
    const stamina = sim.world.get(player, Stamina);
    sim.setPlayerInput('peer-a', { seq: 1, aimX: 1, fire: true, spellSlot: slot });
    for (let i = 0; i < 25; i++) sim.step();
    assertEquals(book.charge, spellCatalog[spellId].cast.maxCharge);
    assertEquals(target.health.hp, 100);
    assertEquals(stamina.stamina, 100);
    assertEquals(sim.captureSnapshot().events.filter(({ type }) => type === 'spell.cast'), []);

    sim.setPlayerInput('peer-a', { seq: 2, fire: false });
    sim.step();
    assertEquals(book.castPhase, 'idle');
    assertEquals(target.health.hp, 100 - damage);
    assertEquals(stamina.stamina, 100 - staminaCost);
    assertEquals(sim.captureSnapshot().events.filter(({ type }) => type === 'spell.cast').map(({ payload }) => payload.charge), [1]);
    if (spellId === 'rend') {
      const bleed = sim.world.get(target.id, Auras).active.find(({ id }) => id === 'bleeding');
      assertEquals(bleed.duration, 6);
    }
    sim.step();
    assertEquals(target.health.hp, 100 - damage);
  }
});

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
  Object.assign(sim.world.get(mobId, Position), { x: 180, y: 100 });
  sim.world.get(mobId, AI).target = null;
  const initialHp = sim.world.get(mobId, Health).hp;

  sim.setPlayerInput('peer-a', { seq: 1, aimX: 1, fire: true, spellSlot: 1 });
  for (let i = 0; i < 5; i++) sim.step();
  sim.setPlayerInput('peer-a', { seq: 2, aimX: 0, fire: false, spellSlot: 1 });
  sim.step();
  assert(sim.world.get(mobId, Health).hp < initialHp);
  assert(sim.world.get(mobId, Auras).active.some((aura) => aura.id === 'stunned'));
  assert(sim.captureSnapshot().events.some((event) => event.type === 'spell.bolt'));

  for (let i = 0; i < 4; i++) sim.step();
  sim.setPlayerInput('peer-a', { seq: 3, aimX: 1, fire: true, spellSlot: 0 });
  for (let i = 0; i < 13; i++) sim.step();
  sim.setPlayerInput('peer-a', { seq: 4, aimX: 0, fire: false, spellSlot: 0 });
  for (let i = 0; i < 20; i++) sim.step();
  assert(sim.captureSnapshot().events.some((event) => event.type === 'projectile.hit'));
  assert(sim.world.get(mobId, Auras).active.some((aura) => aura.id === 'frozen'));

  sim.world.get(mobId, Health).hp = 0;
  sim.step();
  const afterDeath = sim.captureSnapshot();
  assertEquals(afterDeath.entities.some((entity) => entity.kind === 'mob'), false);
  assert(afterDeath.entities.some((entity) => entity.kind === 'item'));
  assert(afterDeath.events.some((event) => event.type === 'entity.died'));
});

Deno.test('arena sim: mobs drop one pile worth 1–3 gold', () => {
  const amounts = new Set();
  for (let seed = 1; seed <= 12; seed++) {
    const sim = makeOpenSim(seed, { enemyCount: 0 });
    sim.addPlayer('peer-a');
    spawnIdleTarget(sim, 300, 300).health.hp = 0;
    sim.step();
    const drops = sim.captureSnapshot().entities.filter(({ state }) => state.effect === 'gold');
    assertEquals(drops.length, 1);
    assertEquals(drops[0].state.count, drops[0].state.potency);
    amounts.add(drops[0].state.count);
  }
  assertEquals(amounts, new Set([1, 2, 3]));
});

Deno.test('arena sim: gold drops once, lights replicas and credits the collecting player', () => {
  const sim = makeOpenSim(123, { enemyCount: 1 });
  const player = sim.addPlayer('peer-a');
  const [[mob, , mobPosition]] = sim.world.query(AI, Position);
  Object.assign(mobPosition, { x: 300, y: 300 });
  sim.world.get(mob, Health).hp = 0;
  sim.step();
  sim.step();
  const snapshot = sim.captureSnapshot();
  const drops = snapshot.entities.filter(record => record.state.effect === 'gold');
  assertEquals(drops.length, 1);
  assertEquals(drops[0].state.glyph, '$');

  const replica = makeOpenSim(123, { mode: SIM_MODE.REPLICA });
  replica.applySnapshot(snapshot);
  const [, , light] = [...replica.world.query(ItemInfo, PointLight)].find(([, info]) => info.glyph === '$');
  assertEquals({ radius: light.radius, r: light.r, g: light.g, b: light.b }, GOLD_LIGHT);

  const { x, y, count } = drops[0].state;
  Object.assign(sim.world.get(player, Position), { x, y });
  sim.step();
  const collected = sim.captureSnapshot();
  assert(!collected.entities.some(record => record.state.effect === 'gold'));
  const pickups = [];
  replica.world.on('item.pickup', ({ gold }) => pickups.push(gold));
  replica.applySnapshot(collected);
  replica.applySnapshot(collected);
  assertEquals(replica.world.get(replica.getPlayerEntity('peer-a'), Gold).count, count);
  assertEquals(pickups, [count]);
});

Deno.test('arena sim: epic chest loot arcs around blocked exits and can only be equipped on landing', () => {
  const grid = {
    cellSize: 4,
    cols: 256,
    rows: 256,
    moveGrid: new Float32Array(256 * 256).fill(100),
    distanceMove: (x) => Math.max(0, 130 - x),
  };
  const sim = makeOpenSim(123, { enemyCount: 0, grid });
  const player = sim.addPlayer('peer-a');
  sim.world.rand = () => 0.1;
  spawnEpicChest(sim.world, 100, 100);
  sim.step();
  const items = () => sim.captureSnapshot().entities.filter(({ kind }) => kind === 'item');
  assertEquals(items().length, 1);
  const [drop] = items();
  assertEquals(drop.state.name, 'Void Reaver');
  assertEquals(drop.state.tossHeight, 0);
  sim.setPlayerInput('peer-a', { seq: 1, pickupX: 100, pickupY: 138 });
  sim.step(0.275);
  const airborne = items()[0].state;
  assertAlmostEquals(airborne.tossHeight, 30);
  assertAlmostEquals(airborne.x, 100);
  assertAlmostEquals(airborne.y, 138);
  assertEquals(sim.getPlayerSnapshot('peer-a').state.weapon.name, 'Fists');
  sim.step(0.275);
  const landed = items()[0].state;
  assertEquals(landed.tossHeight, undefined);
  assertAlmostEquals(landed.y, 176);
  assert(grid.distanceMove(landed.x, landed.y) >= 14);
  sim.setPlayerInput('peer-a', { seq: 2, pickupX: landed.x, pickupY: landed.y });
  sim.step();
  assertEquals(sim.getPlayerSnapshot('peer-a').state.weapon.name, 'Void Reaver');
  assertEquals(items().length, 0);
});

Deno.test("arena sim: replica re-emits new presentation events once", () => {
  const authority = makeOpenSim(456, { enemyCount: 1 });
  authority.addPlayer('peer-a');
  const replica = makeOpenSim(456, { mode: SIM_MODE.REPLICA });
  replica.applySnapshot(authority.captureSnapshot());
  let bolts = 0;
  replica.world.on('spell.bolt', () => bolts++);

  authority.setPlayerInput('peer-a', { seq: 1, aimX: 1, fire: true, spellSlot: 1 });
  for (let i = 0; i < 5; i++) authority.step();
  authority.setPlayerInput('peer-a', { seq: 2, fire: false, spellSlot: 1 });
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
  const replica = makeOpenSim(789, { mode: SIM_MODE.REPLICA });
  assertEquals(replica.applySnapshot(authority.captureSnapshot()), true);
  const [[replicaCaster]] = [...replica.world.query(AI)];
  const [[, shadowBolt, lifetime]] = [...replica.world.query(Projectile, Lifetime)];
  assertEquals(shadowBolt.style, 'shadow');
  assertEquals(shadowBolt.owner, replicaCaster);
  const initialTtl = lifetime.ttl;

  authority.world.get(mobId, Health).hp = 0;
  authority.step();

  const snapshot = authority.captureSnapshot();
  const enemyProjectile = snapshot.entities.find((entity) => entity.kind === 'projectile' && entity.state.team === 'enemies');
  assert(enemyProjectile);
  assert(enemyProjectile.state.owner.startsWith('mob:'));
  assertEquals(replica.applySnapshot(snapshot), true);
  assert(lifetime.ttl < initialTtl);
});

Deno.test("arena sim: snapshot records are versioned and validated", () => {
  const state = {
    x: 0, y: 0, vx: 0, vy: 0, facing: 0, radius: 14, hp: 100, maxHp: 100, dead: false,
    mana: 100, maxMana: 100, manaRegen: 5,
    manaRegenMultiplier: 1, manaRegenSeconds: 0,
    hasteMultiplier: 1, hasteSeconds: 0,
    furyMultiplier: 1, furySeconds: 0,
    wardMultiplier: 1, wardSeconds: 0,
    spells: ['frost_bolt'], activeSpell: 0, cooldown: 0,
    charge: 0, charging: false, chargeAimX: 0, chargeAimY: 0, chargeSpellIndex: 0,
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

Deno.test("arena sim: charged spells spend mana and mana regenerates", () => {
  const sim = makeOpenSim(900, { enemyCount: 0 });
  const playerId = sim.addPlayer('peer-a');
  const mana = sim.world.get(playerId, Mana);
  const book = sim.world.get(playerId, Spellbook);
  assertEquals(mana.mana, 100);

  sim.setPlayerInput('peer-a', { seq: 1, aimX: 0.5, fire: true, spellSlot: 0 });
  for (let i = 0; i < 6; i++) sim.step();
  assert(book.charging);
  assert(book.charge > 0);
  sim.setPlayerInput('peer-a', { seq: 2, fire: false });
  sim.step();
  assertEquals(book.charging, false);
  assert(mana.mana < mana.maxMana);

  const afterCast = mana.mana;
  for (let i = 0; i < 10; i++) sim.step();
  assertAlmostEquals(mana.mana - afterCast, 1.5);
  for (let i = 0; i < 100; i++) sim.step();
  assertEquals(mana.mana, 100);
});

Deno.test("arena sim: direct hits pause passive mana recovery for five seconds", () => {
  const sim = makeOpenSim(902, { enemyCount: 0 });
  const playerId = sim.addPlayer('peer-a');
  const mana = sim.world.get(playerId, Mana);
  const position = sim.world.get(playerId, Position);
  const mob = spawnIdleTarget(sim, 145, 100);
  mana.mana = 20;

  sim.setPlayerInput('peer-a', { seq: 1, aimX: 1, fire: true, spellSlot: 2 });
  sim.step();
  sim.setPlayerInput('peer-a', { seq: 2, fire: false });
  sim.step();
  assert(mob.health.hp < mob.health.maxHp);
  const manaAfterHit = mana.mana;
  for (let i = 0; i < 60; i++) sim.step();
  assertEquals(mana.mana, manaAfterHit);

  applyDamage(sim.world, playerId, 1, { sourceId: mob.id });
  spawnManaPotion(sim.world, position.x, position.y);
  spawnManaSurge(sim.world, position.x, position.y);
  sim.step();
  const manaAfterPotion = manaAfterHit + 30;
  assertEquals(mana.mana, manaAfterPotion);
  for (let i = 0; i < 79; i++) sim.step();
  assertEquals(mana.mana, manaAfterPotion);

  applyDamage(sim.world, playerId, 1, { sourceId: mob.id, periodic: true });
  for (let i = 0; i < 20; i++) sim.step();
  assertEquals(mana.mana, manaAfterPotion);
  sim.step();
  assertAlmostEquals(mana.mana - manaAfterPotion, 7.5 * SIM_DT);
});

Deno.test("arena sim: spell cycle advances the active spell", () => {
  const sim = makeOpenSim(904, { enemyCount: 0 });
  const playerId = sim.addPlayer('peer-a');
  const book = sim.world.get(playerId, Spellbook);
  assertEquals(book.activeIndex, 0);
  for (let seq = 1; seq <= book.spells.length; seq++) {
    sim.setPlayerInput('peer-a', { seq, spellCycle: 1 });
    assertEquals(book.activeIndex, seq % book.spells.length);
  }
});

Deno.test("arena sim: generic aura effects modify rules and expire", () => {
  const sim = makeOpenSim(905, { enemyCount: 0 });
  const playerId = sim.addPlayer('peer-a');
  const position = sim.world.get(playerId, Position);
  const health = sim.world.get(playerId, Health);

  applyAura(sim.world, playerId, 'frozen', playerId, 0.2);
  assertAlmostEquals(getStatMultiplier(sim.world, playerId, 'damageTaken', { damageType: 'fire' }), 1.1);
  sim.setPlayerInput('peer-a', { seq: 1, moveX: 1 });
  sim.step(0.05);
  assertAlmostEquals(position.x, 102.5, 0.01);
  for (let i = 0; i < 4; i++) sim.step(0.05);
  assertEquals(sim.world.get(playerId, Auras).active.some((aura) => aura.id === 'frozen'), false);

  const beforePoison = health.hp;
  applyAura(sim.world, playerId, 'poisoned', playerId, 1);
  for (let i = 0; i < 13; i++) sim.step(0.05);
  assert(health.hp < beforePoison);
});

Deno.test('arena sim: multiple campfires and a temporary area can apply the same burning condition', () => {
  const campfires = [{ x: 185, y: 100 }, { x: 260, y: 100 }];
  const sim = makeOpenSim(905, { campfires, enemyCount: 0 });
  const id = sim.addPlayer('peer-a');
  const position = sim.world.get(id, Position);
  const health = sim.world.get(id, Health);
  const burning = () => sim.getPlayerSnapshot('peer-a').state.conditions;
  assertEquals(sim.captureSnapshot().entities.filter(({ kind }) => kind === 'aura_field').length, 2);
  sim.step();
  assertEquals(burning(), []);

  for (const { x } of campfires) {
    position.x = x + 25;
    sim.step();
    assertEquals(burning().map(({ id }) => id), ['burning']);
    position.x = 100;
    for (let i = 0; i < 61; i++) sim.step();
    assertEquals(burning(), []);
  }

  spawnAuraField(sim.world, 125, 100, {
    id: 'burning_pool',
    radius: 28,
    effects: [{ kind: 'apply_condition', conditionId: 'burning', duration: 1 }],
  }, { duration: 0.8 });
  const hpBeforePool = health.hp;
  for (let i = 0; i < 21; i++) sim.step();
  assertEquals(burning().map(({ id, duration }) => [id, duration]), [['burning', 1]]);
  assertEquals(health.hp, hpBeforePool - 2);
  for (let i = 0; i < 21; i++) sim.step();
  assertEquals(burning(), []);
});

Deno.test("arena sim: '?' spellbooks teach mana-powered abilities", () => {
  const sim = makeOpenSim(906, { enemyCount: 0 });
  const playerId = sim.addPlayer('peer-a');
  const position = sim.world.get(playerId, Position);
  const itemId = spawnSpellbook(sim.world, position.x, position.y);
  assertEquals(sim.world.get(itemId, ItemInfo).glyph, '?');

  sim.step();
  const book = sim.world.get(playerId, Spellbook);
  assert(book.spells.includes('poison_orb'));
  const mana = sim.world.get(playerId, Mana);
  const beforeMana = mana.mana;
  sim.setPlayerInput('peer-a', { seq: 1, aimX: 1, fire: true, spellSlot: book.spells.indexOf('poison_orb') });
  for (let i = 0; i < 14; i++) sim.step();
  sim.setPlayerInput('peer-a', { seq: 2, aimX: 0, fire: false, spellSlot: book.spells.indexOf('poison_orb') });
  sim.step();
  assert(mana.mana < beforeMana);
  assert([...sim.world.query(Projectile)].some(([, projectile]) => projectile.auraId === 'poisoned'));
});

Deno.test("arena sim: every spell uses the global cooldown and its own cooldown", () => {
  const sim = makeOpenSim(907, { enemyCount: 1, respawnEnemies: false });
  const playerId = sim.addPlayer('peer-a');
  const mobId = [...sim.world.query(AI)][0][0];
  Object.assign(sim.world.get(mobId, Position), { x: 180, y: 100 });
  sim.world.get(mobId, AI).target = null;
  const book = sim.world.get(playerId, Spellbook);

  sim.setPlayerInput('peer-a', { seq: 1, aimX: 1, fire: true, spellSlot: 1 });
  sim.step();
  assert(book.cooldown > 0);
  assert(book.cooldowns.lightning > 0);
  sim.setPlayerInput('peer-a', { seq: 2, fire: false, spellSlot: 0 });
  sim.step();
  sim.setPlayerInput('peer-a', { seq: 3, aimX: 1, fire: true, spellSlot: 0 });
  sim.step();
  assertEquals(book.castPhase, 'idle');
  assert(sim.captureSnapshot().events.some((event) => event.type === 'spell.denied' && event.payload.reason === 'global_cooldown'));
});

Deno.test('arena sim: ring haste changes follow-up timing and retains individual cooldowns', () => {
  const cases = [
    [0, 0.45, 9],
    [0.05, 0.45 / 1.05, 9],
    [0.125, 0.4, 8],
    [1, 0.25, 5],
  ];
  for (const [haste, cooldown, followUpTick] of cases) {
    for (const followUp of ['rend', 'ice_armor']) {
      const sim = makeOpenSim(123, { enemyCount: 0 });
      const player = sim.addPlayer('peer-a');
      const book = sim.world.get(player, Spellbook);
      if (!book.spells.includes(followUp)) book.spells.push(followUp);
      const slot = book.spells.indexOf(followUp);
      if (haste) {
        spawnRing(sim.world, 130, 100, { haste });
        sim.setPlayerInput('peer-a', { seq: 1, pickupX: 130, pickupY: 100 });
        sim.step();
      }

      sim.setPlayerInput('peer-a', { seq: 2, aimX: 1, fire: true, spellSlot: 2 });
      sim.step();
      sim.setPlayerInput('peer-a', { seq: 3, fire: false });
      sim.step();
      assertAlmostEquals(book.cooldown, cooldown, 1e-9);
      assertEquals(book.cooldowns.cleave, 1.4);
      for (let i = 1; i < followUpTick; i++) sim.step();
      assert(book.cooldown > 0);

      sim.setPlayerInput('peer-a', { seq: 4, aimX: 1, fire: true, spellSlot: slot });
      sim.step();
      assertAlmostEquals(book.cooldowns.cleave, 1.4 - followUpTick * SIM_DT, 1e-9);
      if (followUp === 'rend') {
        sim.setPlayerInput('peer-a', { seq: 5, fire: false });
        sim.step();
      }
      const snapshot = sim.captureSnapshot();
      assert(snapshot.events.some(({ type, payload }) => type === 'spell.cast' && payload.spellId === followUp));

      const replica = makeOpenSim(123, { mode: SIM_MODE.REPLICA });
      replica.applySnapshot(snapshot);
      assertEquals(replica.world.get(replica.getPlayerEntity('peer-a'), Ring).haste, haste);
    }
  }
});

Deno.test("arena sim: fixed cast-time spells can be interrupted before resolution", () => {
  const sim = makeOpenSim(908, { enemyCount: 0 });
  const playerId = sim.addPlayer('peer-a');
  const book = sim.world.get(playerId, Spellbook);
  book.spells.push('poison_orb');
  const mana = sim.world.get(playerId, Mana);

  sim.setPlayerInput('peer-a', { seq: 1, aimX: 1, fire: true, spellSlot: book.spells.indexOf('poison_orb') });
  for (let i = 0; i < 4; i++) sim.step();
  assertEquals(book.castPhase, 'casting');
  sim.setPlayerInput('peer-a', { seq: 2, aimX: 1, fire: false, spellSlot: book.spells.indexOf('poison_orb') });
  sim.step();
  assertEquals(book.castPhase, 'idle');
  assertEquals(mana.mana, mana.maxMana);
  assertEquals([...sim.world.query(Projectile)].some(([, projectile]) => projectile.style === 'poison'), false);
  assert(sim.captureSnapshot().events.some((event) => event.type === 'spell.interrupted'));

  sim.setPlayerInput('peer-a', { seq: 3, aimX: 1, fire: true, spellSlot: book.spells.indexOf('poison_orb') });
  sim.step();
  applyDamage(sim.world, playerId, 1, { damageType: 'physical' });
  sim.step();
  assertEquals(book.castPhase, 'idle');
  assert(sim.captureSnapshot().events.some((event) => event.type === 'spell.interrupted' && event.payload.reason === 'damage'));
});

Deno.test('arena sim: Frozen duration uses equipped source modifiers on direct application', () => {
  for (const [item, duration] of [['frostband', 2.52], ['rimeband', 2.64]]) {
    const sim = makeOpenSim(910, { enemyCount: 0 });
    const source = sim.addPlayer('peer-a');
    const { id: target } = spawnIdleTarget(sim, 180, 100);
    const active = (conditionId) => sim.world.get(target, Conditions)?.active.find(({ id }) => id === conditionId);

    const ring = spawnItem(sim.world, 100, 100, { type: item });
    assert(applyCondition(sim.world, target, ConditionId.FROZEN, ring));
    assertAlmostEquals(active(ConditionId.FROZEN).duration, 2.4);
    assert(applyCondition(sim.world, target, ConditionId.FROZEN, source));
    assertAlmostEquals(active(ConditionId.FROZEN).duration, 2.4);

    sim.setPlayerInput('peer-a', { seq: 1, pickupX: 100, pickupY: 100 });
    sim.step();
    assert(applyCondition(sim.world, target, ConditionId.FROZEN, source));
    assertAlmostEquals(active(ConditionId.FROZEN).remaining, duration);
    assert(applyCondition(sim.world, target, ConditionId.BLEEDING, source, 1));
    assertAlmostEquals(active(ConditionId.BLEEDING).remaining, 1);

    spawnItem(sim.world, 100, 100, { type: 'haste_ring' });
    sim.setPlayerInput('peer-a', { seq: 2, pickupX: 100, pickupY: 100 });
    sim.step();
    assertAlmostEquals(active(ConditionId.FROZEN).remaining, duration - SIM_DT);
    sim.step(duration);
    assertEquals(active(ConditionId.FROZEN), undefined);
    assert(applyCondition(sim.world, target, ConditionId.FROZEN, source));
    assertAlmostEquals(active(ConditionId.FROZEN).duration, 2.4);
  }
});

Deno.test('arena sim: an active effect and equipped item compose on the same condition stat', () => {
  const sim = makeOpenSim(912, { enemyCount: 0 });
  const source = sim.addPlayer('peer-a');
  const { id: target } = spawnIdleTarget(sim, 180, 100);
  const frozen = () => sim.world.get(target, Conditions)?.active.find(({ id }) => id === ConditionId.FROZEN);

  spawnItem(sim.world, 100, 100, { type: 'frostband' });
  sim.setPlayerInput('peer-a', { seq: 1, pickupX: 100, pickupY: 100 });
  attachAuraEmitter(sim.world, source, {
    radius: 30, targets: 'friendly', duration: 0.2,
    effects: [{
      kind: EffectKind.STAT_MULTIPLIER, stat: EffectStat.CONDITION_DURATION_DEALT,
      conditionId: ConditionId.FROZEN, value: 1.2,
    }],
  });
  sim.step();
  assert(applyCondition(sim.world, target, ConditionId.FROZEN, source, 1));
  assertAlmostEquals(frozen().remaining, 1.26);

  sim.step(0.2);
  assert(applyCondition(sim.world, target, ConditionId.FROZEN, source, 1));
  assertAlmostEquals(frozen().remaining, 1.06);
  sim.step(0.1);
  assert(applyCondition(sim.world, target, ConditionId.FROZEN, source, 1));
  assertAlmostEquals(frozen().remaining, 1.05);
});

Deno.test('arena sim: condition duration modifiers also apply on aura refresh', () => {
  const sim = makeOpenSim(911, { enemyCount: 0 });
  const player = sim.addPlayer('peer-a');
  const { id: target } = spawnIdleTarget(sim, 150, 100);
  spawnRing(sim.world, 100, 100, {
    name: 'Bleeding Ring', haste: 0,
    modifiers: [{
      kind: EffectKind.STAT_MULTIPLIER, stat: EffectStat.CONDITION_DURATION_DEALT,
      conditionId: ConditionId.BLEEDING, value: 1.1,
    }],
  });
  sim.setPlayerInput('peer-a', { seq: 1, pickupX: 100, pickupY: 100 });
  sim.step();
  attachAuraEmitter(sim.world, player, {
    radius: 75, targets: 'hostile', effects: [
      { kind: EffectKind.APPLY_CONDITION, conditionId: ConditionId.BLEEDING, duration: 1 },
      { kind: EffectKind.APPLY_CONDITION, conditionId: ConditionId.FROZEN, duration: 1 },
    ],
  });
  for (let tick = 0; tick < 3; tick++) {
    sim.step();
    const active = sim.world.get(target, Auras).active;
    assertAlmostEquals(active.find(({ id }) => id === ConditionId.BLEEDING).remaining, 1.1);
    assertAlmostEquals(active.find(({ id }) => id === ConditionId.FROZEN).remaining, 1);
  }
});

Deno.test("arena sim: Blizzard channels once per global tick and movement interrupts it", () => {
  const sim = makeOpenSim(909, { enemyCount: 1, respawnEnemies: false });
  const playerId = sim.addPlayer('peer-a');
  const book = sim.world.get(playerId, Spellbook);
  book.spells.push('blizzard');
  const mobId = [...sim.world.query(AI)][0][0];
  Object.assign(sim.world.get(mobId, Position), { x: 270, y: 100 });
  sim.world.get(mobId, AI).target = null;
  const health = sim.world.get(mobId, Health);
  const mana = sim.world.get(playerId, Mana);
  mana.regenPerSecond = 0;

  spawnItem(sim.world, 100, 100, { type: 'rimeband' });
  sim.setPlayerInput('peer-a', { seq: 1, pickupX: 100, pickupY: 100 });
  sim.step();
  sim.setPlayerInput('peer-a', { seq: 2, aimX: 1, fire: true, spellSlot: book.spells.indexOf('blizzard') });
  sim.step();
  assertEquals(book.castPhase, 'channeling');
  const manaAtStart = mana.mana;
  const hpAtStart = health.hp;
  for (let i = 0; i < 3; i++) sim.step();
  assertEquals(mana.mana, manaAtStart - 3);
  assertEquals(health.hp, hpAtStart - 3);
  const frozen = sim.world.get(mobId, Auras).active.find(({ id }) => id === ConditionId.FROZEN);
  assert(frozen);
  assertAlmostEquals(frozen.remaining, 0.385);

  sim.setPlayerInput('peer-a', { seq: 3, moveX: 1, aimX: 1, fire: true, spellSlot: book.spells.indexOf('blizzard') });
  sim.step();
  assertEquals(book.castPhase, 'idle');
  assert(sim.captureSnapshot().events.some((event) => event.type === 'spell.interrupted' && event.payload.reason === 'moved'));
});

Deno.test("arena sim: Ice Armor is an instant buff with mitigation and an individual cooldown", () => {
  const sim = makeOpenSim(910, { enemyCount: 0 });
  const playerId = sim.addPlayer('peer-a');
  const book = sim.world.get(playerId, Spellbook);
  book.spells.push('ice_armor');
  const mana = sim.world.get(playerId, Mana);
  const health = sim.world.get(playerId, Health);

  sim.setPlayerInput('peer-a', { seq: 1, fire: true, spellSlot: book.spells.indexOf('ice_armor') });
  sim.step();
  assert(sim.world.get(playerId, Auras).active.some((aura) => aura.id === 'ice_armor'));
  assertEquals(book.castPhase, 'idle');
  assert(book.cooldown > 0);
  assert(book.cooldowns.ice_armor > 7);
  assertEquals(mana.mana, 76);
  applyDamage(sim.world, playerId, 20, { damageType: 'physical' });
  assertEquals(health.hp, 87);
});

Deno.test("arena sim: Regeneration authors healing over time as a buff effect", () => {
  const sim = makeOpenSim(911, { enemyCount: 0 });
  const playerId = sim.addPlayer('peer-a');
  const book = sim.world.get(playerId, Spellbook);
  book.spells.push('regeneration');
  const mana = sim.world.get(playerId, Mana);
  const health = sim.world.get(playerId, Health);
  mana.regenPerSecond = 0;
  health.hp = 50;

  sim.setPlayerInput('peer-a', { seq: 1, fire: true, spellSlot: book.spells.indexOf('regeneration') });
  sim.step();
  assert(sim.world.get(playerId, Auras).active.some((aura) => aura.id === 'regeneration'));
  for (let i = 0; i < 21; i++) sim.step();
  assertEquals(health.hp, 54);
  assertEquals(mana.mana, 74);
});

Deno.test('arena sim: Agony locks onto the backline and its ticks grow over time', () => {
  const sim = makeOpenSim(912, { enemyCount: 0 });
  const player = sim.addPlayer('caster');
  const front = spawnIdleTarget(sim, 170, 100);
  const back = spawnIdleTarget(sim, 235, 100);
  const book = sim.world.get(player, Spellbook);
  const mana = sim.world.get(player, Mana);
  mana.regenPerSecond = 0;
  const slot = book.spells.push('curse_of_agony') - 1;
  const ticks = [];
  sim.world.on('damage.dealt', ({ target, periodic, hpLost, damageType }) => {
    if (target === back.id && periodic) ticks.push({ hpLost, damageType });
  });
  sim.setPlayerInput('caster', { spellSlot: slot, targetId: sim.getActorNetworkId(back.id), fire: true });
  sim.step();
  assertEquals(book.castTargetId, back.id);
  sim.setPlayerInput('caster', { targetId: sim.getActorNetworkId(front.id) });
  for (let i = 0; i < 145; i++) sim.step();
  assertEquals(ticks, [2, 3, 4, 5, 6, 7].map((hpLost) => ({ hpLost, damageType: 'shadow' })));
  assertEquals(front.health.hp, 100);
  assertEquals(mana.mana, 78);
  assertEquals(sim.world.get(back.id, Conditions).active.length, 0);
});

Deno.test('arena sim: selected-unit casts require an eligible recipient and recheck walls and range', () => {
  let blocked = false;
  const grid = {
    cellSize: 4,
    distanceMove: (x) => blocked && x > 130 && x < 150 ? 0 : 100,
  };
  const sim = makeOpenSim(913, { enemyCount: 0, grid });
  const player = sim.addPlayer('caster');
  const ally = sim.addPlayer('ally');
  const enemy = spawnIdleTarget(sim, 200, 100);
  const book = sim.world.get(player, Spellbook);
  const mana = sim.world.get(player, Mana);
  mana.regenPerSecond = 0;
  const slot = book.spells.push('curse_of_agony') - 1;
  for (const targetId of [null, 'missing', sim.getActorNetworkId(ally)]) {
    sim.setPlayerInput('caster', { spellSlot: slot, targetId, fire: true });
    sim.step();
    assertEquals(book.castPhase, 'idle');
    sim.setPlayerInput('caster');
    sim.step();
  }
  const targetId = sim.getActorNetworkId(enemy.id);
  for (const change of [
    () => { blocked = true; },
    () => { sim.world.get(enemy.id, Position).x = 500; },
    () => { sim.world.destroy(enemy.id); },
  ]) {
    blocked = false;
    sim.world.get(enemy.id, Position).x = 200;
    sim.setPlayerInput('caster', { targetId, fire: true });
    sim.step();
    assertEquals(book.castPhase, 'casting');
    change();
    sim.setPlayerInput('caster');
    for (let i = 0; i < 12; i++) sim.step();
    assertEquals(book.castPhase, 'idle');
    assertEquals(book.cooldowns.curse_of_agony, undefined);
    assertEquals(mana.mana, 100);
  }
  assertEquals(enemy.health.hp, 100);
});

Deno.test('arena sim: projectile aim ignores the selected unit', () => {
  const sim = makeOpenSim(914, { enemyCount: 0 });
  const player = sim.addPlayer('caster');
  const enemy = spawnIdleTarget(sim, 200, 100);
  sim.setPlayerInput('caster', { spellSlot: 0, aimY: 1, fire: true, targetId: sim.getActorNetworkId(enemy.id) });
  sim.step();
  sim.setPlayerInput('caster');
  sim.step();
  const projectile = sim.captureSnapshot().entities.find(({ kind }) => kind === 'projectile');
  assertEquals(projectile.state.owner, sim.getActorNetworkId(player));
  assertAlmostEquals(projectile.state.vx, 0);
  assert(projectile.state.vy > 0);
});

Deno.test('arena sim: swapping weapons preserves their names, glyphs, rarity, and damage', () => {
  const sim = makeOpenSim(123, { enemyCount: 0 });
  sim.addPlayer('peer-a');
  spawnEpicSword(sim.world, 130, 100);
  spawnSword(sim.world, 100, 135);

  sim.setPlayerInput('peer-a', { seq: 1, pickupX: 130, pickupY: 100 });
  sim.step();
  const epic = { name: 'Void Reaver', glyph: '†', rarity: 'epic', damage: 42 };
  assertEquals(sim.captureSnapshot().entities.find(({ kind }) => kind === 'player').state.weapon, epic);

  sim.setPlayerInput('peer-a', { seq: 2, pickupX: 100, pickupY: 135 });
  sim.step();
  const { entities } = sim.captureSnapshot();
  assertEquals(entities.find(({ kind }) => kind === 'player').state.weapon.name, 'Steel Blade');
  const drops = entities.filter(({ kind }) => kind === 'item');
  assertEquals(drops.length, 1);
  const { name, glyph, rarity, weapon } = drops[0].state;
  assertEquals({ name, glyph, rarity, damage: weapon.damage }, epic);
});

Deno.test("arena sim: common health potions heal in five ticks and cannot stack", () => {
  const sim = makeOpenSim(901, { enemyCount: 0 });
  const playerId = sim.addPlayer('peer-a');
  const position = sim.world.get(playerId, Position);
  const health = sim.world.get(playerId, Health);
  const potionId = spawnPotion(sim.world, position.x, position.y);

  sim.step();
  assert(sim.world.alive.has(potionId));
  health.hp = 60;
  sim.step();
  assertEquals(sim.world.alive.has(potionId), false);
  assertEquals(health.hp, 60);

  const secondPotion = spawnPotion(sim.world, position.x, position.y);
  for (let i = 0; i < 19; i++) sim.step();
  assertEquals(health.hp, 60);
  assert(sim.world.alive.has(secondPotion));
  sim.step();
  assertEquals(health.hp, 65);
  sim.world.get(secondPotion, Position).x += 100;

  for (let i = 0; i < 60; i++) sim.step();
  assertEquals(health.hp, 80);
  sim.step(2); // Only the last second of the effect is still active.
  assertEquals(health.hp, 85);
  assertEquals(sim.world.get(playerId, Auras).active.length, 0);
});

Deno.test("arena sim: Epic Chests can drop an instant health potion", () => {
  const sim = makeOpenSim(901, { enemyCount: 0 });
  const playerId = sim.addPlayer('peer-a');
  const position = sim.world.get(playerId, Position);
  const health = sim.world.get(playerId, Health);
  sim.world.rand = () => 0.69;
  spawnEpicChest(sim.world, position.x, position.y);
  sim.step();

  const potion = sim.captureSnapshot().entities.find(({ kind }) => kind === 'item');
  assertEquals(potion.state.name, 'Instant Health Potion');
  assertEquals(potion.state.potency, 50);
  health.hp = 60;
  sim.step(0.1);
  assertEquals(health.hp, 60);
  sim.step(0.5);
  const landed = sim.captureSnapshot().entities.find(({ id }) => id === potion.id);
  assertEquals(landed.state.tossHeight, undefined);
  Object.assign(position, { x: landed.state.x, y: landed.state.y });
  sim.step();
  assertEquals(health.hp, 100);
  assertEquals(sim.world.get(playerId, Auras).active.length, 0);
});

Deno.test("arena sim: confirmed damage and healing retain their amounts and target across replicas", () => {
  const authority = makeOpenSim(920, { enemyCount: 0 });
  const player = authority.addPlayer('peer-a');
  const position = authority.world.get(player, Position);
  applyDamage(authority.world, player, 19, { damageType: 'poison', periodic: true });
  spawnPotion(authority.world, position.x, position.y);
  authority.step();
  for (let i = 0; i < 20; i++) authority.step();
  applyDamage(authority.world, player, 120);
  authority.step();

  const replica = makeOpenSim(920, { mode: SIM_MODE.REPLICA });
  replica.world.create();
  const events = [];
  replica.world.on('damage.dealt', (event) => events.push(event));
  const snapshot = authority.captureSnapshot();
  replica.applySnapshot(snapshot);
  replica.applySnapshot(snapshot);
  const local = replica.getPlayerEntity('peer-a');
  assert(local !== player);
  assertEquals(events.map(({ target, amount, hpLost, periodic, killed }) =>
    [target, amount, hpLost, periodic, killed]), [
    [local, 19, 19, true, false],
    [local, -5, undefined, true, undefined],
    [local, 120, 86, false, true],
  ]);
});

Deno.test("arena sim: mana potions restore mana and wait when mana is full", () => {
  const sim = makeOpenSim(903, { enemyCount: 0 });
  const playerId = sim.addPlayer('peer-a');
  const position = sim.world.get(playerId, Position);
  const mana = sim.world.get(playerId, Mana);
  const potionId = spawnManaPotion(sim.world, position.x, position.y, 30);

  sim.step();
  assert(sim.world.alive.has(potionId));
  mana.mana = 60;
  sim.step();
  assertAlmostEquals(mana.mana, 90, 0.3);
  assertEquals(sim.world.alive.has(potionId), false);
});

Deno.test("arena sim: frost projectile size scales with cast investment", () => {
  const low = makeOpenSim(902, { enemyCount: 0 });
  const high = makeOpenSim(902, { enemyCount: 0 });
  for (const sim of [low, high]) sim.addPlayer('peer-a');

  low.setPlayerInput('peer-a', { seq: 1, aimX: 1, fire: true, spellSlot: 0 });
  low.step();
  low.setPlayerInput('peer-a', { seq: 2, fire: false });
  low.step();

  high.setPlayerInput('peer-a', { seq: 1, aimX: 1, fire: true, spellSlot: 0 });
  for (let i = 0; i < 20; i++) high.step();
  high.setPlayerInput('peer-a', { seq: 2, fire: false });
  high.step();

  const lowShot = [...low.world.query(Projectile, Collider)][0];
  const highShot = [...high.world.query(Projectile, Collider)][0];
  assert(lowShot && highShot);
  assert(highShot[2].radius > lowShot[2].radius * 1.5);
  assert(highShot[1].power > lowShot[1].power);
});

Deno.test("arena sim: mana surge powerup boosts regeneration and expires visibly", () => {
  const sim = makeOpenSim(903, { enemyCount: 0 });
  const playerId = sim.addPlayer('peer-a');
  const position = sim.world.get(playerId, Position);
  const mana = sim.world.get(playerId, Mana);
  mana.mana = 0;
  spawnManaSurge(sim.world, position.x, position.y, 1);
  sim.step();

  const powerups = sim.world.get(playerId, Powerups);
  assertEquals(powerups.manaRegenMultiplier, 2.5);
  assert(powerups.manaRegenSeconds > 0);
  const boostedMana = mana.mana;
  sim.step();
  assert(mana.mana - boostedMana > mana.regenPerSecond * SIM_DT);
  for (let i = 0; i < 20; i++) sim.step();
  assertEquals(powerups.manaRegenMultiplier, 1);
  assertEquals(powerups.manaRegenSeconds, 0);
});

Deno.test("arena sim: zero-health players die once and cannot act", () => {
  const sim = makeOpenSim(904, { enemyCount: 0 });
  const playerId = sim.addPlayer('peer-a');
  const health = sim.world.get(playerId, Health);
  const before = { ...sim.world.get(playerId, Position) };
  health.hp = 0;
  sim.step();

  assertEquals(health.dead, true);
  assertEquals(sim.world.alive.has(playerId), true);
  assertEquals(sim.setPlayerInput('peer-a', { seq: 1, moveX: 1, aimX: 1, fire: true }), false);
  for (let i = 0; i < 4; i++) sim.step();
  assertEquals(sim.world.get(playerId, Position), before);
  const deaths = sim.captureSnapshot().events.filter((event) => event.type === 'entity.died' && event.payload.kind === 'player');
  assertEquals(deaths.length, 1);
  assertEquals(sim.captureSnapshot().entities.find((entity) => entity.kind === 'player').state.dead, true);
});

Deno.test("arena sim: authored encounters include a spider and a bat flock", () => {
  const sim = makeOpenSim(905, { enemyCount: 3, enemyGroupSize: 3, enemySpawnExclusionRadius: 320 });
  sim.addPlayer('peer-a');
  const mobs = [...sim.world.query(AI, Actor, Health, Position)].map(([, ai, actor, health, position]) => ({ ai, actor, health, position }));
  assertEquals(mobs.length, 11);
  assertEquals(mobs.filter(({ actor }) => actor.theme === 'bat').length, 3);
  assertEquals([...new Set(mobs.map((mob) => mob.actor.name))].sort(), ['Bat', 'Cave Spider', 'Flaming Bat', 'Floating Eye', 'Gas Spore', 'Gelatinous Cube', 'Goblin Raider', 'Wraith']);
  assert(mobs.find((mob) => mob.actor.name === 'Gelatinous Cube').health.maxHp >= 180);
  assertEquals(mobs.find((mob) => mob.actor.name === 'Gelatinous Cube').actor.glyph, '■');
  const spider = mobs.find((mob) => mob.actor.theme === 'spider');
  assert(Math.hypot(spider.position.x - 100, spider.position.y - 100) > 320);
  assertEquals(spider.ai.target, null);

  const replica = makeOpenSim(905, { mode: SIM_MODE.REPLICA });
  replica.applySnapshot(sim.captureSnapshot());
  assert([...replica.world.query(Actor)].some(([, actor]) => actor.theme === 'spider'));
});

Deno.test('arena sim: Bat warns, slows exposed players, and alerts nearby allies', () => {
  let wall = false;
  const grid = {
    cellSize: 8,
    distanceMove: (x, y) => (wall && Math.abs(x - 140) < 11) || (x < 155 && Math.abs(y - 150) < 8) ? 0 : 100,
  };
  const sim = makeOpenSim(926, { grid, enemyCount: 0 });
  const player = sim.addPlayer('peer-a');
  const bat = spawnBat(sim.world, grid, 180, 100, null);
  const ally = spawnMelee(sim.world, grid, 300, 100, null);
  const distant = spawnMelee(sim.world, grid, 385, 100, null);
  const ai = sim.world.get(bat, AI);
  const allyAI = sim.world.get(ally, AI);
  const distantAI = sim.world.get(distant, AI);
  allyAI.aggroRange = distantAI.aggroRange = 170;
  const replica = makeOpenSim(926, { mode: SIM_MODE.REPLICA });
  const batState = () => sim.captureSnapshot().entities.find(({ state }) => state.theme === 'bat').state;
  const step = (ticks) => {
    for (let i = 0; i < ticks; i++) sim.step();
  };

  step(1);
  assertEquals(ai.target, player);
  assertEquals(batState().shriekWindup, BAT_SHRIEK_WINDUP);
  assertEquals(allyAI.investigate, null);
  replica.applySnapshot(sim.captureSnapshot());
  assertEquals(replica.captureSnapshot().entities.find(({ state }) => state.theme === 'bat').state.shriekWindup, BAT_SHRIEK_WINDUP);

  wall = true;
  step(1);
  assertEquals(ai.shriekWindup, 0);
  assertEquals(allyAI.investigate, null);
  assertEquals(getStatMultiplier(sim.world, player, 'movementSpeed'), 1);
  wall = false;
  const exposed = sim.addPlayer('exposed');
  const covered = sim.addPlayer('covered');
  const outside = sim.addPlayer('outside');
  Object.assign(sim.world.get(exposed, Position), { x: 90, y: 115 });
  Object.assign(sim.world.get(covered, Position), { x: 85, y: 190 });
  Object.assign(sim.world.get(outside, Position), { x: 20, y: 100 });
  step(1 + Math.round(BAT_SHRIEK_WINDUP / SIM_DT));
  assert(batState().shriekPulse > 0);
  assertEquals(allyAI.target, null);
  assertEquals([allyAI.investigate.x, allyAI.investigate.y], [180, 100]);
  assertEquals(distantAI.investigate, null);
  assertEquals(sim.world.get(player, Health).hp, 100);
  assertEquals(getStatMultiplier(sim.world, player, 'movementSpeed'), 0.65);
  assertEquals(getStatMultiplier(sim.world, exposed, 'movementSpeed'), 0.65);
  assertEquals(getStatMultiplier(sim.world, covered, 'movementSpeed'), 1);
  assertEquals(getStatMultiplier(sim.world, outside, 'movementSpeed'), 1);
  replica.applySnapshot(sim.captureSnapshot());
  const replicaPlayer = replica.getPlayerEntity('peer-a');
  assertEquals(getStatMultiplier(replica.world, replicaPlayer, 'movementSpeed'), 0.65);

  wall = true;
  step(4);
  assert(sim.world.get(ally, Position).x < 300);
  assertEquals(allyAI.target, null);
  applyDamage(sim.world, bat, 30, { sourceId: player });
  step(1);
  assertEquals(sim.world.alive.has(bat), false);
  step(55);
  assertEquals(getStatMultiplier(sim.world, player, 'movementSpeed'), 1);
  assertEquals(allyAI.investigate, null);
  assertEquals(allyAI.target, null);
  assertEquals([...sim.world.query(AI)].length, 2);
});

Deno.test('arena sim: a passive Gas Spore ruptures once and the cloud only damages actors inside', () => {
  const sim = makeOpenSim(925, { enemyCount: 0 });
  const player = sim.addPlayer('peer-a');
  const position = sim.world.get(player, Position);
  const health = sim.world.get(player, Health);
  const spore = spawnGasSpore(sim.world, { distanceMove: () => 100 }, 180, 100, null, [{ x: 240, y: 100 }]);
  const sporePosition = sim.world.get(spore, Position);
  const ai = sim.world.get(spore, AI);
  const replica = makeOpenSim(925, { mode: SIM_MODE.REPLICA });
  const sporeClouds = (snapshot) => snapshot.entities.filter(({ state }) => state.auraEmitter?.id === 'spore_cloud');
  const step = (ticks) => {
    for (let i = 0; i < ticks; i++) sim.step();
  };
  step(10);
  assertEquals(ai.target, null);
  assert(sporePosition.x > 180 && sporePosition.x < 190);
  assertEquals([...sim.world.query(Projectile)].length, 0);
  assertEquals(sporeClouds(sim.captureSnapshot()).length, 0);

  // Body contact still lets the player strike, but the spore deals no melee damage.
  position.x = sporePosition.x - 25;
  const sporeHealth = sim.world.get(spore, Health);
  const beforeContact = sporeHealth.hp;
  step(1);
  assert(sporeHealth.hp < beforeContact);
  assertEquals(health.hp, 100);
  position.x = 100;

  applyDamage(sim.world, spore, 20, { sourceId: player, damageType: 'physical' });
  step(1);
  assertEquals(sim.world.alive.has(spore), false);
  const deathSnapshot = sim.captureSnapshot();
  const [cloud] = sporeClouds(deathSnapshot);
  assertEquals(sporeClouds(deathSnapshot).length, 1);
  assertEquals([cloud.state.x, cloud.state.y], [sporePosition.x, sporePosition.y]);
  assertEquals(cloud.state.auraEmitter.duration, 6);
  replica.applySnapshot(deathSnapshot);
  assertEquals(sporeClouds(replica.captureSnapshot()), [cloud]);
  const { radius } = cloud.state.auraEmitter;

  position.x = cloud.state.x - radius - 1;
  step(16);
  assertEquals(health.hp, 100);
  position.x = cloud.state.x - radius + 1;
  step(16);
  assertEquals(health.hp, 94);
  assert(sim.captureSnapshot().events.some(({ type, payload }) =>
    type === 'damage.dealt' && payload.periodic && payload.damageType === 'poison'));
  position.x = cloud.state.x - radius - 1;
  step(16);
  assertEquals(health.hp, 94);
  step(75);
  const expiredSnapshot = sim.captureSnapshot();
  replica.applySnapshot(expiredSnapshot);
  assertEquals(sporeClouds(expiredSnapshot), []);
  assertEquals(sporeClouds(replica.captureSnapshot()), []);
  position.x = cloud.state.x - radius + 1;
  step(16);
  assertEquals(health.hp, 94);
  assertEquals([...sim.world.query(AI)].length, 0);
});

Deno.test('arena sim: Flaming Bat ignites on contact and leaves one short-lived fire hazard', () => {
  const sim = makeOpenSim(927, { enemyCount: 0 });
  const player = sim.addPlayer('peer-a');
  const bat = spawnFlamingBat(sim.world, { distanceMove: () => 100 }, 180, 100, null);
  const position = sim.world.get(player, Position);
  const health = sim.world.get(player, Health);
  const replica = makeOpenSim(927, { mode: SIM_MODE.REPLICA });
  const puffs = ({ entities }) => entities.filter(({ state }) => state.auraEmitter?.id === 'bat_flame_puff');
  const fireTicks = () => sim.captureSnapshot().events.filter(({ type, payload }) =>
    type === 'damage.dealt' && payload.periodic && payload.damageType === 'fire');
  const step = (ticks) => {
    for (let i = 0; i < ticks; i++) sim.step();
  };

  step(11);
  assertEquals(sim.world.get(bat, AI).target, player);
  assert(health.hp < 100);
  assertEquals(sim.getPlayerSnapshot('peer-a').state.conditions.map(({ id }) => id), ['burning']);
  assertEquals(puffs(sim.captureSnapshot()), []);
  sim.world.get(player, Auras).active = [];
  applyDamage(sim.world, bat, 100, { sourceId: player });
  step(1);
  assertEquals(sim.world.alive.has(bat), false);

  const snapshot = sim.captureSnapshot();
  const [puff] = puffs(snapshot);
  assertEquals(puffs(snapshot).length, 1);
  replica.applySnapshot(snapshot);
  assertEquals(puffs(replica.captureSnapshot()), [puff]);
  const { radius } = puff.state.auraEmitter;
  position.x = puff.state.x - radius - 1;
  step(6);
  assertEquals(fireTicks(), []);
  position.x = puff.state.x - radius + 1;
  step(6);
  assertEquals(fireTicks().map(({ payload }) => payload.hpLost), [3]);
  position.x = puff.state.x - radius - 1;
  step(20);
  assertEquals(fireTicks().length, 1);
  const expired = sim.captureSnapshot();
  replica.applySnapshot(expired);
  assertEquals(puffs(replica.captureSnapshot()), []);
  assertEquals([...sim.world.query(AI)].length, 0);
});

Deno.test('arena sim: floating eye gaze needs sustained sight and replicates timed paralysis', () => {
  let wall = false;
  const grid = {
    cellSize: 8,
    distanceMove: (x) => wall && Math.abs(x - 153) < 2 ? 0 : 100,
  };
  const sim = makeOpenSim(923, { grid, enemyCount: 0 });
  const player = sim.addPlayer('peer-a');
  const eye = spawnFloatingEye(sim.world, grid, 230, 100, null, [{ x: 290, y: 100 }]);
  const position = sim.world.get(player, Position);
  const eyePosition = sim.world.get(eye, Position);
  const ai = sim.world.get(eye, AI);
  const replica = makeOpenSim(923, { mode: SIM_MODE.REPLICA });
  const chargeTicks = Math.round(GAZE_CHARGE_SECONDS / SIM_DT);
  const step = (ticks) => {
    for (let i = 0; i < ticks; i++) sim.step();
  };
  const sync = () => {
    replica.applySnapshot(sim.captureSnapshot());
    return [...replica.world.query(AI)][0][1];
  };
  const conditionIds = (simulation) => simulation.getPlayerSnapshot('peer-a').state.conditions.map(({ id }) => id);

  wall = true;
  step(4);
  assertEquals(ai.gazeCharge, 0);
  assert(eyePosition.x > 230 && eyePosition.x - 230 < 4);
  wall = false;
  const anchor = { ...eyePosition };
  step(chargeTicks - 1);
  const replicated = sync();
  assert(replicated.gazeCharge > 0 && replicated.gazeCharge < 1);
  assertEquals(replicated.target, replica.getPlayerEntity('peer-a'));
  assertEquals(eyePosition, anchor);
  assertEquals(conditionIds(sim), []);

  wall = true;
  step(1);
  assertEquals(sync().gazeCharge, 0);
  assertEquals(conditionIds(replica), []);
  wall = false;
  step(chargeTicks - 1);
  assertEquals(conditionIds(sim), []);
  step(1);
  assertEquals(sync().gazeCharge, 1);
  assertEquals(conditionIds(replica), ['paralyzed']);
  assertEquals(replica.getPlayerSnapshot('peer-a').state.conditions[0].duration, 5);
  assertEquals([...sim.world.query(Projectile)].length, 0);

  sim.setPlayerInput('peer-a', { moveY: 1, aimX: 1, spellSlot: 2, fire: true });
  step(1);
  assertEquals(position.y, 100);
  sim.setPlayerInput('peer-a', { moveY: 1 });
  step(1);
  assert(sim.captureSnapshot().events.some(({ type }) => type === 'spell.cast'));
  step(96);
  assertEquals(conditionIds(sim), ['paralyzed']);
  assertEquals(position.y, 100);
  step(3);
  assertEquals(conditionIds(sim), []);
  assert(position.y > 100);
  applyDamage(sim.world, eye, sim.world.get(eye, Health).hp, { sourceId: player, damageType: 'physical' });
  step(1);
  assertEquals(sim.world.alive.has(eye), false);
  const kills = [];
  replica.world.on('damage.dealt', (event) => { if (event.killed) kills.push(event.targetTheme); });
  replica.applySnapshot(sim.captureSnapshot());
  assertEquals(kills, ['floating_eye']);
  step(chargeTicks);
  assertEquals([...sim.world.query(AI)].length, 0);
});

Deno.test('arena sim: goblin closes at 90 units per second and replicated melee identifies the attacker', () => {
  const sim = makeOpenSim(921, { enemyCount: 0 });
  sim.addPlayer('peer-a');
  const goblin = spawnMelee(sim.world, { distanceMove: () => 100 }, 137, 100, null);
  const replica = makeOpenSim(921, { mode: SIM_MODE.REPLICA });
  for (let i = 0; i < 12; i++) replica.world.create();
  const swings = [];
  replica.world.on('melee.hit', (event) => {
    if (event.sourceTheme === 'fire') swings.push(event.source);
  });

  replica.applySnapshot(sim.captureSnapshot());
  assertEquals(swings, []);
  const [replicaGoblin] = [...replica.world.query(Actor)]
    .find(([, actor]) => actor.name === 'Goblin Raider');
  assert(replicaGoblin !== goblin);

  const position = sim.world.get(goblin, Position);
  const startX = position.x;
  sim.step();
  assertAlmostEquals(startX - position.x, 90 * SIM_DT);
  for (let i = 0; i < 4; i++) sim.step();
  const snapshot = sim.captureSnapshot();
  replica.applySnapshot(snapshot);
  replica.applySnapshot(snapshot);
  assertEquals(swings, [replicaGoblin]);
});

Deno.test("arena sim: a spider patrols, chases, poisons on contact, and stays dead", () => {
  const sim = makeOpenSim(921, { enemyCount: 0 });
  const player = sim.addPlayer('peer-a');
  const playerPosition = sim.world.get(player, Position);
  const health = sim.world.get(player, Health);
  const spider = spawnSpider(sim.world, { distanceMove: () => 100 }, 450, 100, null, [{ x: 560, y: 100 }]);
  const ai = sim.world.get(spider, AI);
  const position = sim.world.get(spider, Position);
  Object.assign(position, { x: 450, y: 100 });
  const meleeHits = [];
  sim.world.on('melee.hit', (event) => meleeHits.push(event));

  for (let i = 0; i < 5; i++) sim.step();
  assertEquals(ai.target, null);
  assert(position.x > 450);
  assertEquals(meleeHits.length, 0);
  playerPosition.x = position.x - 48;
  const startX = playerPosition.x;
  const chaseStart = position.x;
  sim.step();
  assertAlmostEquals(chaseStart - position.x, 90 * SIM_DT);
  for (let i = 0; i < 6; i++) sim.step();
  assertEquals(ai.target, player);
  assert(health.hp < 100);
  assert(sim.world.get(player, Auras).active.some((condition) => condition.id === 'poisoned'));
  const bites = meleeHits.filter(({ sourceTheme }) => sourceTheme === 'spider');
  assertEquals(bites.map(({ source, target }) => [source, target]), [[spider, player]]);
  assertEquals(bites[0].conditionId, 'poisoned');
  assertEquals(playerPosition.x, startX);
  const plantedX = position.x;
  sim.setPlayerInput('peer-a', { moveX: 1 });
  sim.step();
  assertEquals(playerPosition.x, startX + 200 * SIM_DT);
  assertEquals(position.x, plantedX);
  sim.setPlayerInput('peer-a', {});

  playerPosition.x = 100;
  applyDamage(sim.world, spider, 1000);
  const hpAfterBite = health.hp;
  for (let i = 0; i < 14; i++) sim.step();
  assert(health.hp < hpAfterBite);
  assertEquals([...sim.world.query(AI)].length, 0);
  const replica = makeOpenSim(921, { mode: SIM_MODE.REPLICA });
  const replayedBites = [];
  replica.world.on('melee.hit', (event) => {
    if (event.sourceTheme === 'spider') replayedBites.push(event);
  });
  const snapshot = sim.captureSnapshot();
  replica.applySnapshot(snapshot);
  replica.applySnapshot(snapshot);
  assertEquals(replayedBites.map(({ x, y }) => [x, y]), bites.map(({ x, y }) => [x, y]));
  assertEquals(replayedBites[0].conditionId, 'poisoned');
});

Deno.test('arena sim: a web shot roots on impact, permits casting, and wears off', () => {
  const sim = makeOpenSim(922, { enemyCount: 0 });
  const player = sim.addPlayer('peer-a');
  const spider = spawnSpider(sim.world, { distanceMove: () => 100 }, 260, 100, null);
  const position = sim.world.get(player, Position);
  const events = [];
  sim.world.on('projectile.hit', (event) => events.push(event));
  // Hold the spider in place to isolate the projectile from contact melee.
  const spiderPosition = sim.world.get(spider, Position);
  Object.assign(spiderPosition, { x: 260, y: 100 });
  applyAura(sim.world, spider, 'immobilized', null, 3);

  sim.step();
  assertEquals([...sim.world.query(Projectile)].length, 0);
  const replica = makeOpenSim(922, { mode: SIM_MODE.REPLICA });
  replica.applySnapshot(sim.captureSnapshot());
  assert([...replica.world.query(AI)].some(([, ai]) => ai.webWindup > 0));
  for (let i = 0; i < 6; i++) sim.step();
  assertEquals([...sim.world.query(Projectile)].length, 0);
  sim.step();
  assertEquals([...sim.world.query(Projectile)].map(([, shot]) => shot.style), ['web']);
  assertEquals(sim.getPlayerSnapshot('peer-a').state.conditions, []);
  for (let i = 0; i < 15; i++) sim.step();
  assertEquals(events.map(({ target, style }) => [target, style]), [[player, 'web']]);
  assertEquals(sim.world.get(player, Health).hp, 100);
  replica.applySnapshot(sim.captureSnapshot());
  assertEquals(replica.getPlayerSnapshot('peer-a').state.conditions.map(({ id }) => id), ['immobilized']);
  assert([...replica.world.query(AI)].every(([, ai]) => ai.webWindup === 0));

  const casts = [];
  sim.world.on('spell.cast', ({ spellId }) => casts.push(spellId));
  sim.setPlayerInput('peer-a', { moveX: 1, aimX: 1, spellSlot: 2, fire: true });
  sim.step();
  sim.setPlayerInput('peer-a', { moveX: 1 });
  sim.step();
  assertEquals(casts, ['cleave']);
  assertEquals(position.x, 100);
  sim.setPlayerInput('peer-a', { moveY: 1 });
  for (let i = 0; i < 24; i++) sim.step();
  assertEquals(sim.getPlayerSnapshot('peer-a').state.conditions, []);
  assert(position.y > 100);
});

Deno.test('arena sim: a web shot misses a sidestep and stops at intervening walls', () => {
  for (const dodge of [true, false]) {
    let wall = false;
    const grid = {
      cellSize: 4, cols: 256, rows: 256,
      moveGrid: new Float32Array(256 * 256).fill(100),
      distanceMove: (x) => wall ? Math.min(100, Math.abs(x - 170) - 2) : 100,
    };
    const sim = makeOpenSim(923, { enemyCount: 0, grid });
    sim.addPlayer('peer-a');
    const spider = spawnSpider(sim.world, grid, 260, 100, null);
    Object.assign(sim.world.get(spider, Position), { x: 260, y: 100 });
    applyAura(sim.world, spider, 'immobilized', null, 3);
    const walls = [];
    sim.world.on('projectile.wall', (event) => walls.push(event));
    for (let i = 0; i < 8; i++) sim.step();
    assertEquals([...sim.world.query(Projectile)].length, 1);
    wall = !dodge;
    if (dodge) sim.setPlayerInput('peer-a', { moveY: 1 });
    for (let i = 0; i < 19; i++) sim.step();
    assertEquals([...sim.world.query(Projectile)].length, 0);
    assertEquals(sim.getPlayerSnapshot('peer-a').state.conditions, []);
    assertEquals(walls.map(({ style, radius }) => [style, radius]), dodge ? [] : [['web', 0]]);
  }
});

Deno.test('arena sim: the spider plants its feet and commits its aim during Web Spit', () => {
  const sim = makeOpenSim(925, { enemyCount: 0 });
  sim.addPlayer('peer-a');
  const spider = spawnSpider(sim.world, { distanceMove: () => 100 }, 260, 100, null);
  const position = sim.world.get(spider, Position);
  Object.assign(position, { x: 260, y: 100 });
  sim.step();
  assert(sim.world.get(spider, AI).webWindup > 0);
  sim.setPlayerInput('peer-a', { moveY: 1 });
  for (let i = 0; i < 7; i++) sim.step();
  assertEquals(position, { x: 260, y: 100 });
  assert([...sim.world.query(Projectile, Position)].some(([, shot, pos]) => shot.style === 'web' && pos.y === 100));
  sim.setPlayerInput('peer-a', {});
  sim.step();
  assert(position.x < 260);
});

Deno.test('dungeon preview: preserves the campfire and skips normal population', () => {
  const seed = 42;
  const cave = generateArenaCave(seed);
  assert(cave.chestSites.length > 0);
  assert(cave.encounterSites.length > 0);
  const sim = createArenaDungeonSimulation({ seed, cave, preview: true });
  sim.addPlayer('local');
  const { entities } = sim.captureSnapshot();
  assertEquals(entities.filter(({ kind }) => kind !== 'player').map(({ kind, state }) => [
    kind, state.auraEmitter?.id,
  ]), [['aura_field', 'campfire']]);
});

Deno.test('mob preview: spawns the selected mob once on reachable ground near the player', () => {
  const grid = {
    cellSize: 4, cols: 256, rows: 256,
    moveGrid: new Float32Array(256 * 256).fill(100),
    distanceMove: (x) => 122 - x,
  };
  const names = {
    spider: 'Cave Spider', goblin: 'Goblin Raider', wraith: 'Wraith', cube: 'Gelatinous Cube',
    floating_eye: 'Floating Eye', gas_spore: 'Gas Spore', bat: 'Bat', flaming_bat: 'Flaming Bat',
  };
  for (const [key, name] of Object.entries(names)) {
    const sim = makeOpenSim(924, { grid, enemyCount: 0 });
    const player = sim.addPlayer('peer-a');
    const start = sim.world.get(player, Position);
    const mob = spawnPreviewMob(sim.world, grid, start, getPreviewMob(key));
    assert(mob != null);
    const mobs = [...sim.world.query(AI, Actor, Position)];
    assertEquals(mobs.length, 1);
    const [[id, ai, actor, position]] = mobs;
    assertEquals([id, ai.target, actor.name], [mob, null, name]);
    assertAlmostEquals(Math.hypot(position.x - start.x, position.y - start.y), 82);
    assert(grid.distanceMove(position.x, position.y) >= 20);
    sim.step();
    assertEquals(ai.target, key === 'gas_spore' ? null : player);
  }
  assertEquals(getPreviewMob('constructor'), undefined);
});

Deno.test('mimic: contact reveals the same mob, which jumps and bites only at landing', () => {
  for (const dodge of [false, true]) {
    const sim = makeOpenSim(924, { enemyCount: 0 });
    const player = sim.addPlayer('peer-a');
    const position = sim.world.get(player, Position);
    const mimic = getPreviewMob('mimic')(sim.world, { distanceMove: () => 100 }, 150, 100, null);
    const mimicPosition = sim.world.get(mimic, Position);
    const ai = sim.world.get(mimic, AI);
    const health = sim.world.get(player, Health);
    const mobRecord = () => sim.captureSnapshot().entities.find(({ state }) => state.theme === 'mimic');
    const replica = makeOpenSim(924, { mode: SIM_MODE.REPLICA });

    sim.step();
    const closed = mobRecord();
    assertEquals(closed.state.mimicClosed, true);
    assertEquals(ai.target, null);
    assertEquals(mimicPosition.x, 150);
    replica.applySnapshot(sim.captureSnapshot());
    assertEquals(replica.captureSnapshot().entities.find(({ id }) => id === closed.id).state.mimicClosed, true);

    position.x = 118;
    sim.step();
    assertEquals(mobRecord().id, closed.id);
    assert(!mobRecord().state.mimicClosed);
    assertEquals(ai.target, player);
    assert(ai.mimicWindup > 0);
    assertEquals(health.hp, 100);

    position.x = 104;
    for (let i = 0; i < 10 && ai.mimicLeap === 0; i++) sim.step();
    assert(ai.mimicLeap > 0);
    assert(mimicPosition.x < 150);
    assertEquals(health.hp, 100);
    replica.applySnapshot(sim.captureSnapshot());
    assertEquals(replica.captureSnapshot().entities.find(({ id }) => id === closed.id).state.mimicLeap, ai.mimicLeap);

    if (dodge) position.y += 80;
    for (let i = 0; i < 10 && ai.mimicLeap > 0; i++) sim.step();
    assertEquals(ai.mimicLeap, 0);
    const events = sim.captureSnapshot().events;
    assertEquals(events.filter(({ type }) => type === 'mimic.awakened').length, 1);
    assertEquals(events.filter(({ type, payload }) => type === 'melee.hit' && payload.sourceTheme === 'mimic').length, dodge ? 0 : 1);
    assertEquals(health.hp === 100, dodge);

    applyDamage(sim.world, mimic, 200, { sourceId: player });
    for (let i = 0; i < 25; i++) sim.step();
    assertEquals(mobRecord(), undefined);
    assert(sim.captureSnapshot().entities.some(({ state }) => state.effect === 'gold'));
  }
});

Deno.test("arena sim: unalerted patrol mobs stay dormant and dead mobs stay dead", () => {
  const sim = makeOpenSim(907, {
    enemyCount: 1,
    enemyGroupSize: 1,
    patrolRoutes: [{ points: [{ x: 1000, y: 100 }] }],
    enemySpawnExclusionRadius: 320,
  });
  const playerId = sim.addPlayer('peer-a');
  const mobId = [...sim.world.query(AI)][0][0];
  assertEquals(sim.world.get(mobId, AI).target, null);
  assertEquals(sim.world.get(playerId, Position).x, 100);
  const mobPosition = sim.world.get(mobId, Position);
  assert(Math.hypot(mobPosition.x - 100, mobPosition.y - 100) > 320);
  sim.world.get(mobId, Health).hp = 0;
  sim.step();
  assertEquals([...sim.world.query(AI)].length, 0);
});

Deno.test("arena sim: haste, fury, and ward pickups author distinct timed boosts", () => {
  const sim = makeOpenSim(906, { enemyCount: 0 });
  const playerId = sim.addPlayer('peer-a');
  const position = sim.world.get(playerId, Position);
  const powerups = sim.world.get(playerId, Powerups);
  const spawners = [spawnHasteRune, spawnFuryRune, spawnWardRune];
  for (const spawn of spawners) {
    spawn(sim.world, position.x, position.y, 2);
    sim.step();
  }
  assertEquals(powerups.hasteMultiplier, 1.45);
  assertEquals(powerups.furyMultiplier, 1.6);
  assertEquals(powerups.wardMultiplier, 0.5);
  assert(powerups.hasteSeconds > 0 && powerups.furySeconds > 0 && powerups.wardSeconds > 0);
});
