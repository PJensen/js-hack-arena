import { readGearKey } from '../public/src/rules/gear.js';
import { assert, assertAlmostEquals, assertEquals, assertRejects } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { timingSafeEqual } from 'node:crypto';
import { AI, Actor, Conditions, Health, MaterialStacks, Position, Projectile, Ring, Spellbook } from '../public/src/rules/components/index.js';
import { MINING_SECONDS } from '../public/src/rules/components/Mining.js';
import { SIM_DT, SIM_MODE } from '../public/src/rules/sim/arenaSim.js';
import { createArenaDungeonSimulation } from '../public/src/rules/sim/arenaDungeon.js';
import { GAZE_CHARGE_SECONDS } from '../public/src/rules/components/AI.js';
import { getMiningMaterial } from '../public/src/rules/data/miningMaterials.js';
import { createHandCarvedCave } from '../public/src/rules/geometry/handCarvedDungeon.js';
import { generateArenaCave } from '../public/src/rules/geometry/caveGen.js';
import { canMineOre } from '../public/src/rules/geometry/oreSites.js';
import { sweepMaxFree } from '../public/src/rules/geometry/sweep.js';
import { applyDamage } from '../public/src/rules/effects.js';
import { CampAction } from '../public/src/rules/camp.js';
import { spawnGold, spawnItem, spawnMelee, spawnRing } from '../public/src/rules/spawner.js';
import { MESSAGE, decodeMessage, encodeMessage, makeRoomSeed } from '../public/src/shared/net/protocol.js';
import { createRoomHandoff, verifyRoomHandoff } from '../worker/auth.js';
import { CharacterProgress } from '../worker/characterProgress.js';
import { GameRoom } from '../worker/index.js';

async function verifyTestHandoff(handoff, roomId, env) {
  // Workers extends Web Crypto with timingSafeEqual. Deno exposes it via node:crypto.
  if (crypto.subtle.timingSafeEqual) return verifyRoomHandoff(handoff, roomId, env);
  crypto.subtle.timingSafeEqual = timingSafeEqual;
  try {
    return await verifyRoomHandoff(handoff, roomId, env);
  } finally {
    delete crypto.subtle.timingSafeEqual;
  }
}

class FakeSocket {
  readyState = WebSocket.OPEN;
  sent = [];
  listeners = new Map();

  accept() {}
  send(raw) { this.sent.push(decodeMessage(raw)); }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
}

function makeStorage(records = new Map()) {
  return {
    transactionSync: (action) => action(),
    setAlarm: async () => {},
    kv: {
      get: (key) => structuredClone(records.get(key)),
      put: (key, value) => records.set(key, structuredClone(value)),
      delete: (key) => records.delete(key),
      list: ({ prefix }) => [...records].filter(([key]) => key.startsWith(prefix)).values(),
    },
  };
}

function makeRoomState(records, name = 'lobby') {
  return {
    id: { name, toString: () => name },
    storage: makeStorage(records),
    waitUntil() {},
  };
}

function makeEnv(lobbyState = makeRoomState()) {
  const characters = new Map();
  const env = {
    CHARACTER: {
      getByName(userId) {
        if (!characters.has(userId)) characters.set(userId, new CharacterProgress(makeStorage()));
        return characters.get(userId);
      },
    },
    GAME_ROOM: {
      getByName(name) {
        assertEquals(name, 'lobby');
        return new GameRoom(lobbyState, env);
      },
    },
  };
  return env;
}

Deno.test('game room: every connected socket receives both players immediately', async () => {
  const room = new GameRoom(makeRoomState(), makeEnv());
  const first = new FakeSocket();
  const second = new FakeSocket();

  await room.accept(first, { userId: 'user-1', displayName: 'First' });
  const beforeJoin = latestSnapshot(first);
  await room.accept(second, { userId: 'user-2', displayName: 'Second' });
  const firstView = latestSnapshot(first);
  const secondView = latestSnapshot(second);

  assert(firstView.revision > beforeJoin.revision);
  assertEquals(firstView.tick, beforeJoin.tick);
  assertEquals(firstView.entities.filter((entity) => entity.kind === 'player').length, 2);
  assertEquals(secondView.entities.filter((entity) => entity.kind === 'player').length, 2);
  assertEquals(secondView.entities.filter(({ kind, state }) => kind === 'item' && state.ring).length, 0);

  room.leave(first);
  room.leave(second);
});

Deno.test('game room: /say reaches distant peers and uses the signed character name', async () => {
  const env = { ...makeEnv(), ARENA_SESSION_SECRET: 'test-room-handoff-secret' };
  const room = new GameRoom(makeRoomState(), env);
  const otherRoom = new GameRoom(makeRoomState(undefined, 'other-room'), env);
  const speaker = new FakeSocket();
  const listener = new FakeSocket();
  const outsider = new FakeSocket();
  const account = { sub: 'user-1', name: 'Account Holder' };
  const handoff = await createRoomHandoff(account, room.roomId, '  First  ', env);
  const identity = await verifyTestHandoff(handoff, room.roomId, env);
  const defaultHandoff = await createRoomHandoff(account, room.roomId, null, env);
  assertEquals(await verifyTestHandoff(defaultHandoff, room.roomId, env), {
    userId: 'user-1', displayName: 'Adventurer',
  });
  await room.accept(speaker, identity);
  await room.accept(listener, { userId: 'user-2', displayName: 'Second' });
  await otherRoom.accept(outsider, { userId: 'user-3', displayName: 'Outsider' });
  try {
    const { peerId, peers, snapshot } = speaker.sent.find(({ type }) => type === MESSAGE.WELCOME);
    assertEquals(peers.find(({ id }) => id === peerId).name, 'First');
    assertEquals(snapshot.entities.find(({ owner }) => owner === peerId).state.name, 'First');
    const listenerPeer = listener.sent.find(({ type }) => type === MESSAGE.WELCOME).peerId;
    const sim = room.ensureSim();
    const distant = sim.world.get(sim.getPlayerEntity(listenerPeer), Position);
    distant.x += 5000;
    const say = (socket, payload) => room.handleMessage(socket, encodeMessage(MESSAGE.SAY, payload));
    const messages = (socket) => socket.sent.filter(({ type }) => type === MESSAGE.SAY)
      .map(({ peerId, name, text }) => ({ peerId, name, text }));
    const rejectionCount = (socket) => socket.sent.filter(({ type }) => type === MESSAGE.SAY_ERROR).length;

    say(speaker, { text: 42 });
    say(speaker, { text: ' '.repeat(200) + 'hello' });
    say(speaker, { text: '  hello\n <b> ', peerId: 'fake', name: 'Fake' });
    const delivered = [{ peerId, name: 'First', text: 'hello <b>' }];
    assertEquals(messages(speaker), delivered);
    assertEquals(messages(listener), delivered);
    assertEquals(messages(outsider), []);
    assertEquals(rejectionCount(speaker), 2);
    assertEquals(rejectionCount(listener), 0);

    say(speaker, { text: 'too soon' });
    assertEquals(rejectionCount(speaker), 3);
    assertEquals(messages(listener), delivered);
    say(listener, { text: 'heard you' });
    assertEquals(messages(speaker).at(-1), { peerId: listenerPeer, name: 'Second', text: 'heard you' });
  } finally {
    room.leave(speaker);
    room.leave(listener);
    otherRoom.leave(outsider);
  }
});

Deno.test('game room: opening chat interrupts an in-progress cast before release', async () => {
  const room = new GameRoom(makeRoomState(), makeEnv());
  const socket = new FakeSocket();
  await room.accept(socket, { userId: 'caster', displayName: 'Caster' });
  try {
    const { peerId } = socket.sent.find(({ type }) => type === MESSAGE.WELCOME);
    const sim = room.ensureSim();
    const book = sim.world.get(sim.getPlayerEntity(peerId), Spellbook);
    const input = (frame) => room.handleMessage(socket, encodeMessage(MESSAGE.INPUT, { input: frame }));
    input({ seq: 1, aimX: 1, fire: true });
    for (let i = 0; i < 4; i++) room.step();
    assertEquals(book.castPhase, 'charging');
    input({ seq: 2, cancelCast: true });
    room.step();
    assertEquals(book.castPhase, 'idle');
    assertEquals([...sim.world.query(Projectile)].length, 0);

    input({ seq: 3, aimX: 1, fire: true });
    room.step();
    input({ seq: 4 });
    room.step();
    assertEquals([...sim.world.query(Projectile)].length, 1);
  } finally {
    room.leave(socket);
  }
});

Deno.test('game room: Regeneration uses the selected ally from the socket input', async () => {
  const room = new GameRoom(makeRoomState(), makeEnv());
  const caster = new FakeSocket();
  const ally = new FakeSocket();
  await room.accept(caster, { userId: 'caster', displayName: 'Caster' });
  await room.accept(ally, { userId: 'ally', displayName: 'Ally' });
  try {
    const casterPeer = caster.sent.find(({ type }) => type === MESSAGE.WELCOME).peerId;
    const allyPeer = ally.sent.find(({ type }) => type === MESSAGE.WELCOME).peerId;
    const sim = room.ensureSim();
    const casterId = sim.getPlayerEntity(casterPeer);
    const allyId = sim.getPlayerEntity(allyPeer);
    const book = sim.world.get(casterId, Spellbook);
    const health = sim.world.get(allyId, Health);
    health.hp = 50;
    const spellSlot = book.spells.push('regeneration') - 1;
    const targetId = latestSnapshot(caster).entities.find(({ owner }) => owner === allyPeer).id;
    room.handleMessage(caster, encodeMessage(MESSAGE.INPUT, { input: { seq: 1, spellSlot, targetId, fire: true } }));
    room.step();
    assert(sim.world.get(allyId, Conditions).active.some(({ id }) => id === 'regeneration'));
    assert(!sim.world.get(casterId, Conditions).active.some(({ id }) => id === 'regeneration'));
    for (let i = 0; i < 21; i++) room.step();
    assertEquals(health.hp, 54);
  } finally {
    room.leave(caster);
    room.leave(ally);
  }
});

Deno.test('game room: authored lava burns on contact, lingers on exit, and can kill', async () => {
  const room = new GameRoom(makeRoomState(), makeEnv());
  room.caveData = createHandCarvedCave({
    schema: 'hack-arena.hand-carved-dungeon', version: 1, id: 'lava-test', name: 'Lava Test',
    width: 1000, height: 1000, start: { x: 500, y: 500 },
    strokes: [
      { id: 'room', type: 'rect', x: 200, y: 200, w: 600, h: 600 },
      { id: 'pool', type: 'rect', x: 520, y: 420, w: 200, h: 160, floor: 'lava' },
    ],
  });
  const socket = new FakeSocket();
  await room.accept(socket, { userId: 'user-1', displayName: 'First' });
  try {
    const { peerId } = socket.sent.find(({ type }) => type === MESSAGE.WELCOME);
    const sim = room.ensureSim();
    const player = sim.getPlayerEntity(peerId);
    const position = sim.world.get(player, Position);
    const snapshot = () => sim.getPlayerSnapshot(peerId).state;
    const isBurning = () => snapshot().conditions.some(({ id }) => id === 'burning');

    room.step();
    assertEquals(snapshot().hp, 100);
    assert(!isBurning());
    room.handleMessage(socket, encodeMessage(MESSAGE.INPUT, { input: { seq: 1, moveX: 1 } }));
    room.step();
    assertEquals(snapshot().hp, 100);
    room.step();
    assertEquals(snapshot().hp, 86);
    assert(isBurning());
    room.handleMessage(socket, encodeMessage(MESSAGE.INPUT, { input: { seq: 2, moveX: 0 } }));
    for (let i = 0; i < 5; i++) room.step();
    assertEquals(snapshot().hp, 72);

    position.x = 500;
    room.step();
    assertEquals(snapshot().hp, 72);
    assert(isBurning());
    for (let i = 0; i < 65; i++) room.step();
    const recovered = snapshot().hp;
    assert(recovered < 72 && recovered > 55);
    assert(!isBurning());
    for (let i = 0; i < 10; i++) room.step();
    assertEquals(snapshot().hp, recovered);

    position.x = 560;
    for (let i = 0; i < 32; i++) room.step();
    const serverPlayer = latestSnapshot(socket).entities.find(({ owner }) => owner === peerId);
    assertEquals(serverPlayer.state.hp, 0);
    assertEquals(serverPlayer.state.dead, true);
  } finally {
    room.leave(socket);
  }
});

Deno.test('game room: initial dungeon setup matches offline play and dead-end chests open once', async () => {
  const room = new GameRoom(makeRoomState(), makeEnv());
  const first = new FakeSocket();
  const second = new FakeSocket();
  await room.accept(first, { userId: 'user-1', displayName: 'First' });
  try {
    const cave = generateArenaCave(room.seed);
    const offline = createArenaDungeonSimulation({ seed: room.seed, cave });
    offline.addPlayer('offline', 0, null, 'First');
    const dungeonEntities = ({ entities }) => entities.filter(({ kind }) => kind !== 'player');
    const roomSnapshot = latestSnapshot(first);
    assertEquals(dungeonEntities(roomSnapshot), dungeonEntities(offline.captureSnapshot()));
    const goblins = (snapshot) => snapshot.entities.filter(({ state }) => state.theme === 'loot_goblin');
    assertEquals(goblins(roomSnapshot).length, 1);
    const [goblin] = goblins(roomSnapshot);
    assert(cave.encounterSites.some(({ x, y }) => Math.hypot(x - goblin.state.x, y - goblin.state.y) <= 97));
    const roomPlayer = roomSnapshot.entities.find(({ kind }) => kind === 'player');
    assertEquals(roomPlayer?.state, offline.getPlayerSnapshot('offline').state);

    const chests = (snapshot) => snapshot.entities.filter(({ state }) => state.effect === 'epic_chest');
    const initial = chests(roomSnapshot);
    assertEquals(initial.length, 1);

    const sim = room.ensureSim();
    const { peerId } = first.sent.find(({ type }) => type === MESSAGE.WELCOME);
    const position = sim.world.get(sim.getPlayerEntity(peerId), Position);
    const [{ id, state: { x, y } }] = initial;
    Object.assign(position, { x, y });
    room.step();
    room.step();
    const snapshot = sim.captureSnapshot();
    assertEquals(chests(snapshot), initial.filter((chest) => chest.id !== id));
    assertEquals(snapshot.events.filter(({ type }) => type === 'chest.opened').length, 1);
    assert(snapshot.entities.some(({ kind, state }) => kind === 'item' && state.tossHeight > 0));

    await room.accept(second, { userId: 'user-2', displayName: 'Second' });
    assertEquals(chests(latestSnapshot(second)), chests(snapshot));
    assertEquals(goblins(latestSnapshot(second)).map(({ id }) => id), [goblin.id]);
    const [goblinId] = [...sim.world.query(Actor)].find(([, actor]) => actor.theme === 'loot_goblin');
    applyDamage(sim.world, goblinId, 200);
    room.step();
    room.step();
    assertEquals(goblins(latestSnapshot(second)), []);
  } finally {
    room.leave(first);
    room.leave(second);
  }
});

Deno.test('game room: Mimics use both encounter site types and share a dungeon cap', async () => {
  // mimic-50 rolls a leaf Mimic and would also roll a regular Mimic without the cap.
  for (const [roomId, leaf] of [['mimic-50', true], ['lobby', false]]) {
    const room = new GameRoom(makeRoomState(), makeEnv());
    room.seed = makeRoomSeed(roomId);
    const socket = new FakeSocket();
    await room.accept(socket, { userId: 'user-1', displayName: 'First' });
    try {
      const cave = room.ensureCave();
      const mimics = (snapshot) => snapshot.entities.filter(({ state }) => state.theme === 'mimic');
      const initial = latestSnapshot(socket);
      const records = mimics(initial);
      assertEquals(records.length, 1);
      const [{ id, kind, state }] = records;
      assertEquals(kind, 'mob');
      assertEquals(state.mimicClosed, true);
      const sites = leaf ? cave.chestSites : cave.encounterSites;
      assert(sites.some(({ x, y }) => x === state.x && y === state.y));
      assertEquals(initial.entities.filter(({ state }) => state.effect === 'epic_chest').length, leaf ? 0 : 1);

      const sim = room.ensureSim();
      const { peerId } = socket.sent.find(({ type }) => type === MESSAGE.WELCOME);
      Object.assign(sim.world.get(sim.getPlayerEntity(peerId), Position), { x: state.x, y: state.y });
      room.step();
      const revealed = mimics(sim.captureSnapshot());
      assertEquals(revealed.length, 1);
      assertEquals(revealed[0].id, id);
      assert(!revealed[0].state.mimicClosed);
      assert(revealed[0].state.mimicWindup > 0);
    } finally {
      room.leave(socket);
    }
  }
});

Deno.test('game room: encounters stay spread out while some mobs patrol', async () => {
  const room = new GameRoom(makeRoomState(), makeEnv());
  const socket = new FakeSocket();
  await room.accept(socket, { userId: 'user-1', displayName: 'First' });
  try {
    const cave = room.ensureCave();
    const [entrance] = cave.spawns;
    const sim = room.ensureSim();
    const mobStates = (snapshot) => snapshot.entities.filter(({ kind }) => kind === 'mob').map(({ state }) => state);
    const initialMobs = mobStates(latestSnapshot(socket));
    assertEquals(initialMobs.filter(({ theme }) => theme === 'floating_eye').length, 1);
    assertEquals(initialMobs.filter(({ theme }) => theme === 'gas_spore').length, 1);
    assertEquals(initialMobs.filter(({ theme }) => theme === 'bat').length, 3);
    assertEquals(initialMobs.filter(({ theme }) => theme === 'flaming_bat').length, 1);

    const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const mobs = [...sim.world.query(AI, Position, Actor)]
      .filter(([, , , actor]) => actor.theme !== 'loot_goblin')
      .map(([id, ai, pos, actor]) => ({ id, ai, pos, home: { ...pos }, theme: actor.theme }));
    assertEquals(mobs.length, 11);
    assertEquals(mobs.filter(({ ai }) => ai.patrolPoints.length > 1).length, 3);
    const bats = mobs.filter(({ theme }) => theme === 'bat');
    for (const [index, bat] of bats.entries()) {
      assert(bats.slice(index + 1).every((other) => distance(bat.home, other.home) >= 24 && distance(bat.home, other.home) <= 64));
    }
    const assertSpread = () => {
      for (const [index, { ai, pos, theme }] of mobs.entries()) {
        assertEquals(ai.target, null);
        assert(distance(pos, entrance) > 320);
        assert(cave.grid.distanceMove(pos.x, pos.y) >= 20);
        assert(mobs.slice(index + 1).every((other) =>
          theme === 'bat' && other.theme === 'bat' ? distance(pos, other.pos) <= 96 : distance(pos, other.pos) > 500
        ));
      }
    };
    assertSpread();

    // Patrols have time to turn around repeatedly while the player stays at the entrance.
    const moved = new Set();
    for (let tick = 0; tick < 1200; tick++) {
      room.step();
      for (const { id, ai, pos, home } of mobs) {
        if (ai.patrolPoints.length) {
          assert(distance(pos, home) <= 64);
          if (distance(pos, home) > 32) moved.add(id);
        } else {
          assert(distance(pos, home) < 20);
        }
      }
    }
    assertEquals(moved.size, 3);
    assertSpread();

    const { peerId } = socket.sent.find(({ type }) => type === MESSAGE.WELCOME);
    const playerId = sim.getPlayerEntity(peerId);
    const [nearby] = mobs;
    Object.assign(sim.world.get(playerId, Position), nearby.pos);
    room.step();
    assertEquals(nearby.ai.target, playerId);

    sim.world.get(nearby.id, Health).hp = 0;
    for (let tick = 0; tick < 20; tick++) room.step();
    assertEquals(mobs.filter(({ id }) => sim.world.has(id, AI)).length, 10);

    const eye = mobStates(latestSnapshot(socket)).find(({ theme }) => theme === 'floating_eye');
    const eyeApproach = [[65, 0], [-65, 0], [0, 65], [0, -65]]
      .map(([dx, dy]) => ({ x: eye.x + dx, y: eye.y + dy }))
      .find(({ x, y }) => cave.grid.distanceMove(x, y) >= 14 && sweepMaxFree(cave.grid, eye.x, eye.y, x, y, 5) === 1);
    assert(eyeApproach);
    Object.assign(sim.world.get(playerId, Position), eyeApproach);
    for (let tick = 0; tick < Math.ceil(GAZE_CHARGE_SECONDS / SIM_DT) + 2; tick++) room.step();
    const gazeHit = latestSnapshot(socket);
    const gaze = mobStates(gazeHit).find(({ theme }) => theme === 'floating_eye').gaze;
    const playerRecord = gazeHit.entities.find(({ kind }) => kind === 'player');
    assertEquals(gaze, { target: playerRecord.id, charge: 1 });
    assertEquals(playerRecord.state.conditions.map(({ id }) => id), ['paralyzed']);

    const spore = gazeHit.entities.find(({ state }) => state.theme === 'gas_spore');
    const [sporeId] = [...sim.world.query(Actor)].find(([, actor]) => actor.theme === 'gas_spore');
    applyDamage(sim.world, sporeId, 20, { sourceId: playerId });
    room.step();
    room.step();
    const cloud = latestSnapshot(socket).entities.find(({ state }) => state.auraEmitter?.id === 'spore_cloud');
    assertEquals(cloud?.kind, 'aura_field');
    assertEquals([cloud.state.x, cloud.state.y], [spore.state.x, spore.state.y]);

    const [flamingBat] = [...sim.world.query(Actor)].find(([, actor]) => actor.theme === 'flaming_bat');
    applyDamage(sim.world, flamingBat, 40, { sourceId: playerId });
    room.step();
    room.step();
    const fireSnapshot = latestSnapshot(socket);
    assertEquals(fireSnapshot.entities.some(({ state }) => state.theme === 'flaming_bat'), false);
    assertEquals(fireSnapshot.entities.filter(({ state }) => state.auraEmitter?.id === 'bat_flame_puff').length, 1);
  } finally {
    room.leave(socket);
  }
});

Deno.test('game room: gear is carried, deposited and never equips inside an expedition', async () => {
  const env = makeEnv();
  const room = new GameRoom(makeRoomState(), env);
  const socket = new FakeSocket();
  const back = new FakeSocket();
  const identity = { userId: 'user-1', displayName: 'First' };
  await room.accept(socket, identity);
  try {
    const { peerId } = socket.sent.find(({ type }) => type === MESSAGE.WELCOME);
    const sim = room.ensureSim();
    const player = sim.getPlayerEntity(peerId);
    const pos = sim.world.get(player, Position);
    const { x, y } = pos;
    for (const [seq, type] of [[1, 'frostband'], [2, 'rimeband'], [3, 'godslayer']]) {
      spawnItem(sim.world, x, y, { type });
      room.handleMessage(socket, encodeMessage(MESSAGE.INPUT, { input: { seq, pickupX: x, pickupY: y } }));
      room.step();
    }
    room.broadcastSnapshot();
    const snapshot = latestSnapshot(socket);
    const record = snapshot.entities.find(({ owner }) => owner === peerId);
    assertEquals(record.state.ring, null);
    assertEquals(record.state.weapon.name, 'Fists');
    const carried = Object.entries(record.state.materials);
    assertEquals(carried.length, 3);
    const frost = carried.find(([key]) => readGearKey(key).name === 'Frostband');
    assertEquals(readGearKey(frost[0]).modifiers[0].value, 1.05);
    const replica = createArenaDungeonSimulation({ seed: room.seed, cave: generateArenaCave(room.seed), mode: SIM_MODE.REPLICA });
    replica.applySnapshot(snapshot);
    assertEquals(replica.world.get(replica.getPlayerEntity(peerId), MaterialStacks).counts, record.state.materials);
    assertEquals(await room.readCharacterProgress(identity.userId), { gold: 0 });
    const request = action => room.handleMessage(socket, encodeMessage(MESSAGE.CAMP_ACTION, { action }));
    Object.assign(pos, room.ensureCave().camp.portal);
    await request(CampAction.EXIT);
    assert(socket.sent.at(-1).error.includes('first'));
    Object.assign(pos, room.ensureCave().camp.bank);
    await request(CampAction.DEPOSIT);
    assertEquals(sim.world.get(player, MaterialStacks).counts, {});
    const secured = await room.readCharacterProgress(identity.userId);
    assertEquals(secured.gear, record.state.materials);
    Object.assign(pos, room.ensureCave().camp.portal);
    await request(CampAction.EXIT);
    await room.accept(back, identity);
    assertEquals(await room.readCharacterProgress(identity.userId), secured);
    const returned = latestSnapshot(back).entities.find(({ owner }) => owner === back.sent[0].peerId);
    assertEquals(returned.state.ring, null);
    assertEquals(returned.state.materials, {});
  } finally {
    room.leave(socket);
    room.leave(back);
  }
});

Deno.test('game room: dying with unsecured gear does not credit the bank', async () => {
  const env = makeEnv();
  const room = new GameRoom(makeRoomState(), env);
  const socket = new FakeSocket();
  await room.accept(socket, { userId: 'user-1', displayName: 'First' });
  try {
    const { peerId } = socket.sent.find(({ type }) => type === MESSAGE.WELCOME);
    const sim = room.ensureSim();
    const player = sim.getPlayerEntity(peerId);
    const { x, y } = sim.world.get(player, Position);
    spawnRing(sim.world, x, y);
    room.handleMessage(socket, encodeMessage(MESSAGE.INPUT, { input: { seq: 1, pickupX: x, pickupY: y } }));
    room.step();
    assertEquals(Object.keys(sim.world.get(player, MaterialStacks).counts).length, 1);
    sim.world.get(player, Health).hp = 0;
    room.step();
    await room.handleMessage(socket, encodeMessage(MESSAGE.CAMP_ACTION, { action: CampAction.DEPOSIT }));
    assert(socket.sent.at(-1).error);
    await room.handleMessage(socket, encodeMessage(MESSAGE.CAMP_ACTION, { action: CampAction.EXIT }));
    assertEquals(await room.readCharacterProgress('user-1'), { gold: 0 });
  } finally { room.leave(socket); }
});

function latestSnapshot(socket) {
  const message = [...socket.sent].reverse().find((entry) => entry.type === MESSAGE.SNAPSHOT || entry.type === MESSAGE.WELCOME);
  assert(message?.snapshot);
  return message.snapshot;
}

Deno.test('game room: a mining command drops ore and a gem and late joins see the spent vein', async () => {
  const room = new GameRoom(makeRoomState(), makeEnv());
  room.seed = 42;
  const miner = new FakeSocket();
  const late = new FakeSocket();
  await room.accept(miner, { userId: 'miner', displayName: 'Miner' });
  try {
    const sim = room.ensureSim();
    const site = sim.getMineableOre()[0];
    assertEquals(site.id, 0);
    const mine = (seq) => room.handleMessage(miner, encodeMessage(MESSAGE.INPUT, {
      input: { seq, pickupX: site.x, pickupY: site.y, mine: true },
    }));
    const { peerId } = miner.sent.find(({ type }) => type === MESSAGE.WELCOME);
    const pos = sim.world.get(sim.getPlayerEntity(peerId), Position);
    const grid = room.ensureCave().grid;
    const stand = [36, 24].map((distance) => ({
      x: site.x - distance * site.normalX, y: site.y - distance * site.normalY,
    })).find((point) => grid.distanceMove(point.x, point.y) >= 20 && canMineOre(grid, point, site));
    assert(stand);

    mine(1);
    room.step();
    assert(sim.getMineableOre().some(({ id }) => id === site.id));
    Object.assign(pos, stand);
    mine(2);
    room.step();
    room.broadcastSnapshot();
    const active = latestSnapshot(miner);
    assertEquals(active.entities.find((entity) => entity.kind === 'player').state.mining,
      { siteId: site.id, remaining: MINING_SECONDS });
    assert(active.oreAvailable.includes(site.id));
    assert(!active.entities.some(({ state }) => getMiningMaterial(state.effect)));

    for (let i = 1; i < MINING_SECONDS / SIM_DT; i++) room.step();
    assert(sim.getMineableOre().some(({ id }) => id === site.id));
    room.step();

    await room.accept(late, { userId: 'late', displayName: 'Late' });
    const joined = latestSnapshot(late);
    const drops = joined.entities.filter(({ state }) => getMiningMaterial(state.effect));
    assertEquals(drops.filter(({ state }) => state.effect === 'copper_ore').length, 3);
    assertEquals(drops.filter(({ state }) => getMiningMaterial(state.effect).shape === 'gem').length, 1);
    assert(drops.every(({ state }) => state.tossHeight === 0));
    assert(!joined.oreAvailable.includes(site.id));
  } finally {
    room.leave(miner);
    room.leave(late);
  }
});

Deno.test('game room: walking through the campfire applies and replicates timed burning', async () => {
  const room = new GameRoom(makeRoomState(), makeEnv());
  const socket = new FakeSocket();
  await room.accept(socket, { userId: 'user-1', displayName: 'First' });
  try {
    const { peerId } = socket.sent.find(({ type }) => type === MESSAGE.WELCOME);
    const { campfires: [campfire] } = room.ensureCave();
    assert(campfire);
    const field = latestSnapshot(socket).entities.find(({ state }) => state.auraEmitter?.id === 'campfire');
    assert(field);
    assertEquals(field.kind, 'aura_field');
    assertEquals([field.state.x, field.state.y], [campfire.x, campfire.y]);
    assertEquals(field.state.auraEmitter.effects[0].conditionId, 'burning');
    const sim = room.ensureSim();
    const position = sim.world.get(sim.getPlayerEntity(peerId), Position);
    const distance = () => Math.hypot(campfire.x - position.x, campfire.y - position.y);
    const startDistance = distance();
    const moveX = (campfire.x - position.x) / startDistance;
    const moveY = (campfire.y - position.y) / startDistance;
    let seq = 0;
    const move = (x, y) => room.handleMessage(socket, encodeMessage(MESSAGE.INPUT, {
      input: { seq: ++seq, moveX: x, moveY: y },
    }));
    const playerState = () => latestSnapshot(socket).entities.find(({ owner }) => owner === peerId).state;
    room.step();
    room.broadcastSnapshot();
    assertEquals(playerState().conditions, []);
    const initialHp = playerState().hp;

    move(moveX, moveY);
    for (let i = 0; i < 12 && distance() > 8; i++) room.step();
    assert(distance() <= 8);
    move(0, 0);
    for (let i = 0; i < 15; i++) room.step();
    room.broadcastSnapshot();
    assertEquals(playerState().conditions, [{
      id: 'burning', name: 'Burning', glyph: '🔥', visual: 'burning', disposition: 'harmful',
      remaining: 3, duration: 3, stacks: 1,
    }]);
    assert(playerState().hp < initialHp);
    assert(latestSnapshot(socket).events.some(({ type, payload }) =>
      type === 'damage.dealt' && payload.damageType === 'fire' && payload.periodic && payload.amount === 2
    ));

    move(moveX, moveY);
    for (let i = 0; i < 8; i++) room.step();
    move(0, 0);
    room.broadcastSnapshot();
    assert(playerState().conditions[0].remaining < 3);
    const cave = generateArenaCave(room.seed);
    const replica = createArenaDungeonSimulation({ seed: room.seed, cave, mode: SIM_MODE.REPLICA });
    assertEquals(replica.world.alive.size, 0);
    replica.applySnapshot(latestSnapshot(socket));
    const replicaConditions = replica.world.get(replica.getPlayerEntity(peerId), Conditions);
    assertEquals(replicaConditions.active[0].id, 'burning');
    assertEquals(replicaConditions.active[0].remaining, playerState().conditions[0].remaining);

    for (let i = 0; i < 61; i++) room.step();
    room.broadcastSnapshot();
    assertEquals(playerState().conditions, []);
    replica.applySnapshot(latestSnapshot(socket));
    assertEquals(replicaConditions.active, []);
  } finally {
    room.leave(socket);
  }
});

Deno.test('game room: a starter Cleave consumes stamina, broadcasts the swing and recovers gradually', async () => {
  const room = new GameRoom(makeRoomState(), makeEnv());
  const socket = new FakeSocket();
  await room.accept(socket, { userId: 'user-1', displayName: 'First' });
  try {
    const initial = latestSnapshot(socket).entities.find((entity) => entity.kind === 'player').state;
    assertEquals(initial.spells.slice(2), ['cleave', 'rend']);
    assertEquals(initial.stamina, 100);
    room.handleMessage(socket, encodeMessage(MESSAGE.INPUT, {
      input: { seq: 1, aimX: 1, fire: true, spellSlot: 2 },
    }));
    for (let i = 0; i < 18; i++) room.step();
    room.broadcastSnapshot();
    const held = latestSnapshot(socket);
    const charging = held.entities.find((entity) => entity.kind === 'player').state;
    assertEquals(charging.castPhase, 'charging');
    assertEquals(charging.stamina, 100);
    assertEquals(held.events.filter(({ type }) => type === 'spell.cast'), []);
    room.handleMessage(socket, encodeMessage(MESSAGE.INPUT, { input: { seq: 2, fire: false } }));
    room.step();
    room.broadcastSnapshot();
    const snapshot = latestSnapshot(socket);
    const player = snapshot.entities.find((entity) => entity.kind === 'player').state;
    assertEquals(player.stamina, 75);
    assertEquals(player.mana, initial.mana);
    const swing = snapshot.events.find(({ type, payload }) => type === 'spell.cast' && payload.spellId === 'cleave');
    assert(swing);
    assertEquals(swing.payload.charge, 1);
    assertEquals(swing.payload.meleeArc.hits, []);
    assert(swing.payload.caster.startsWith('player:'));

    for (let i = 0; i < 33; i++) room.step();
    room.broadcastSnapshot();
    const recovering = latestSnapshot(socket).entities.find((entity) => entity.kind === 'player').state;
    assertAlmostEquals(recovering.stamina, 83);
  } finally {
    room.leave(socket);
  }
});

Deno.test('game room: a character carries legacy and earned gold across independent rooms', async () => {
  const key = 'player-progress:user-1';
  const saved = new Map([[key, { gold: 7 }]]);
  const lobby = makeRoomState(saved);
  const env = makeEnv(lobby);
  const quarry = new GameRoom(makeRoomState(undefined, 'quarry'), env);
  const first = new FakeSocket();
  const returning = new FakeSocket();
  const otherAccount = new FakeSocket();
  const identity = { userId: 'user-1', displayName: 'First' };
  const welcome = (socket) => socket.sent.find(({ type }) => type === MESSAGE.WELCOME);
  const playerState = (socket) => latestSnapshot(socket).entities.find(({ owner }) => owner === welcome(socket).peerId).state;
  const lobbyRoom = new GameRoom(lobby, env);
  try {
    // The first visit can be to a different room than the one holding legacy gold.
    await quarry.accept(first, identity);
    assertEquals(welcome(first).roomId, 'quarry');
    assertEquals(playerState(first).gold, 7);
    const sim = quarry.ensureSim();
    const player = sim.getPlayerEntity(welcome(first).peerId);
    const { x, y } = sim.world.get(player, Position);
    spawnGold(sim.world, x, y, 3);
    quarry.step();
    quarry.broadcastSnapshot();
    assertEquals(playerState(first).gold, 7);
    await quarry.flushGold(identity.userId);
    sim.world.get(player, Health).hp = 0;
    quarry.step();
    quarry.broadcastSnapshot();
    assertEquals(playerState(first).hp, 0);
    assertEquals(playerState(first).gold, 10);
    quarry.leave(first);

    await lobbyRoom.accept(returning, { ...identity, displayName: 'Renamed' });
    assertEquals(playerState(returning).gold, 10);
    assertEquals(playerState(returning).hp, playerState(returning).maxHp);
    await lobbyRoom.accept(otherAccount, { userId: 'user-2', displayName: 'Renamed' });
    assertEquals(playerState(otherAccount).gold, 0);
    assertEquals(saved.get(key), { gold: 7 });
  } finally {
    quarry.leave(first);
    lobbyRoom.leave(returning);
    lobbyRoom.leave(otherAccount);
  }
});

Deno.test('game room: pending gold survives a restart after an ambiguous credit response', async () => {
  const state = makeRoomState();
  const env = makeEnv(state);
  const character = env.CHARACTER.getByName('miner');
  const credit = character.creditGold.bind(character);
  let loseResponse = true;
  character.creditGold = (roomId, earned) => {
    const gold = credit(roomId, earned);
    if (loseResponse) throw new Error('response lost after commit');
    return gold;
  };
  const room = new GameRoom(state, env);
  const socket = new FakeSocket();
  await room.accept(socket, { userId: 'miner', displayName: 'Miner' });
  try {
    const sim = room.ensureSim();
    const { peerId } = socket.sent.find(({ type }) => type === MESSAGE.WELCOME);
    const { x, y } = sim.world.get(sim.getPlayerEntity(peerId), Position);
    spawnGold(sim.world, x, y, 3);
    room.step();
    await assertRejects(() => room.flushGold('miner'), Error, 'response lost');
  } finally {
    room.leave(socket);
  }
  loseResponse = false;
  const restarted = new GameRoom(state, env);
  await restarted.alarm();
  assertEquals(character.read(), { gold: 3 });
  assertEquals([...state.storage.kv.list({ prefix: 'pending-character-gold:' })], []);
});

Deno.test('character: initialization and cumulative credits merge once per room', async () => {
  const storage = makeStorage();
  const first = new CharacterProgress(storage);
  const second = new CharacterProgress(storage);
  assertEquals(await Promise.all([first.initialize(12), second.initialize(12)]), [{ gold: 12 }, { gold: 12 }]);
  assertEquals(first.creditGold('lobby', 5), 17);
  assertEquals(second.creditGold('quarry', 3), 20);
  assertEquals(first.creditGold('lobby', 5), 20);
  assertEquals(second.creditGold('lobby', 2), 20);
  assertEquals(second.creditGold('lobby', 7), 22);
  assertEquals(first.initialize(12), { gold: 22 });
});

Deno.test('game room: bank ore and gems at camp, then exit without removing the other player', async () => {
  const env = makeEnv();
  const room = new GameRoom(makeRoomState(), env);
  const miner = new FakeSocket();
  const teammate = new FakeSocket();
  const back = new FakeSocket();
  const minerIdentity = { userId: 'miner', displayName: 'Miner' };
  const request = (action) => room.handleMessage(miner, encodeMessage(MESSAGE.CAMP_ACTION, {
    action, deposited: { gold_ore: 999 }, // The room takes counts from the player entity.
  }));
  const lastResult = () => miner.sent.filter(({ type }) => type === MESSAGE.CAMP_RESULT).at(-1);
  await room.accept(miner, minerIdentity);
  await room.accept(teammate, { userId: 'teammate', displayName: 'Teammate' });
  try {
    const sim = room.ensureSim();
    const player = sim.getPlayerEntity(miner.sent[0].peerId);
    const pos = sim.world.get(player, Position);
    const pack = sim.world.get(player, MaterialStacks);
    const { bank, portal } = room.ensureCave().camp;
    pack.counts = { copper_ore: 3, aquamarine: 1 };

    Object.assign(pos, portal);
    await request(CampAction.DEPOSIT);
    assert(lastResult().error.includes('camp chest'));
    await request(CampAction.EXIT);
    assert(lastResult().error.includes('first'));
    assertEquals(pack.counts, { copper_ore: 3, aquamarine: 1 });

    Object.assign(pos, bank);
    await request(CampAction.EXIT);
    assert(lastResult().error.includes('camp portal'));
    const saving = request(CampAction.DEPOSIT);
    await request(CampAction.DEPOSIT);
    await saving;
    assertEquals(lastResult().deposited, { copper_ore: 3, aquamarine: 1 });
    assertEquals(pack.counts, {});
    assertEquals(await room.readCharacterProgress('miner'), { gold: 0, materials: { copper_ore: 3, aquamarine: 1 } });
    assertEquals(await room.readCharacterProgress('teammate'), { gold: 0 });

    Object.assign(pos, portal);
    await request(CampAction.EXIT);
    assertEquals(lastResult().action, CampAction.EXIT);
    assertEquals(lastResult().error, undefined);
    assertEquals(latestSnapshot(teammate).entities.filter(({ kind }) => kind === 'player').length, 1);
    assertEquals(room.ensureSim(), sim);
    await room.accept(back, minerIdentity);
    assertEquals(latestSnapshot(back).entities.find(({ owner }) => owner === back.sent[0].peerId).state.materials, {});
    assertEquals(await room.readCharacterProgress('miner'), { gold: 0, materials: { copper_ore: 3, aquamarine: 1 } });
  } finally {
    room.leave(miner);
    room.leave(teammate);
    room.leave(back);
  }
});

Deno.test('game room: a disconnected deposit is recovered once after an ambiguous credit response', async () => {
  const state = makeRoomState();
  const env = makeEnv(state);
  const character = env.CHARACTER.getByName('miner');
  const credit = character.creditMaterials.bind(character);
  character.creditMaterials = (roomId, earned) => {
    credit(roomId, earned);
    throw new Error('response lost after bank commit');
  };
  const room = new GameRoom(state, env);
  const socket = new FakeSocket();
  await room.accept(socket, { userId: 'miner', displayName: 'Miner' });
  try {
    const sim = room.ensureSim();
    const player = sim.getPlayerEntity(socket.sent[0].peerId);
    sim.world.get(player, MaterialStacks).counts = { tin_ore: 3 };
    Object.assign(sim.world.get(player, Position), room.ensureCave().camp.bank);
    const flush = room.handleMessage(socket, encodeMessage(MESSAGE.CAMP_ACTION, { action: CampAction.DEPOSIT }));
    Object.assign(sim.world.get(player, Position), room.ensureCave().camp.portal);
    room.handleMessage(socket, encodeMessage(MESSAGE.CAMP_ACTION, { action: CampAction.EXIT }));
    assert(socket.sent.at(-1).error.includes('finish saving'));
    room.leave(socket);
    await flush;
  } finally {
    room.leave(socket);
  }
  character.creditMaterials = credit;
  const restarted = new GameRoom(state, env);
  await restarted.alarm();
  assertEquals(await restarted.readCharacterProgress('miner'), { gold: 0, materials: { tin_ore: 3 } });
  assertEquals([...state.storage.kv.list({ prefix: 'pending-character-materials:' })], []);
});
