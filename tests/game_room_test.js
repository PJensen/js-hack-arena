import { assert, assertEquals } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { Health, Position } from '../public/src/rules/components/index.js';
import { spawnGold } from '../public/src/rules/spawner.js';
import { MESSAGE, decodeMessage, encodeMessage } from '../public/src/shared/net/protocol.js';
import { GameRoom } from '../worker/index.js';

class FakeSocket {
  readyState = WebSocket.OPEN;
  sent = [];
  listeners = new Map();

  accept() {}
  send(raw) { this.sent.push(decodeMessage(raw)); }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
}

function makeRoomState(kv = new Map()) {
  return {
    id: { toString: () => 'test-room' },
    storage: {
      kv: {
        get: (key) => structuredClone(kv.get(key)),
        put: (key, value) => kv.set(key, structuredClone(value)),
      },
    },
  };
}

Deno.test('game room: every connected socket receives both players immediately', () => {
  const room = new GameRoom(makeRoomState(), {});
  const first = new FakeSocket();
  const second = new FakeSocket();

  room.accept(first, { userId: 'user-1', displayName: 'First' });
  const beforeJoin = latestSnapshot(first);
  room.accept(second, { userId: 'user-2', displayName: 'Second' });
  const firstView = latestSnapshot(first);
  const secondView = latestSnapshot(second);

  assert(firstView.revision > beforeJoin.revision);
  assertEquals(firstView.tick, beforeJoin.tick);
  assertEquals(firstView.entities.filter((entity) => entity.kind === 'player').length, 2);
  assertEquals(secondView.entities.filter((entity) => entity.kind === 'player').length, 2);

  room.leave(first);
  room.leave(second);
});

function latestSnapshot(socket) {
  const message = [...socket.sent].reverse().find((entry) => entry.type === MESSAGE.SNAPSHOT || entry.type === MESSAGE.WELCOME);
  assert(message?.snapshot);
  return message.snapshot;
}

Deno.test('game room: a starter Cleave consumes stamina and broadcasts the swing', () => {
  const room = new GameRoom(makeRoomState(), {});
  const socket = new FakeSocket();
  room.accept(socket, { userId: 'user-1', displayName: 'First' });
  try {
    const initial = latestSnapshot(socket).entities.find((entity) => entity.kind === 'player').state;
    assertEquals(initial.spells.slice(2), ['cleave', 'rend']);
    assertEquals(initial.stamina, 100);
    room.handleMessage(socket, encodeMessage(MESSAGE.INPUT, {
      input: { seq: 1, aimX: 1, fire: true, spellSlot: 2 },
    }));
    room.step();
    room.broadcastSnapshot();
    const snapshot = latestSnapshot(socket);
    const player = snapshot.entities.find((entity) => entity.kind === 'player').state;
    assertEquals(player.stamina, 75);
    assertEquals(player.mana, initial.mana);
    const swing = snapshot.events.find(({ type, payload }) => type === 'spell.cast' && payload.spellId === 'cleave');
    assert(swing);
    assertEquals(swing.payload.meleeArc.hits, []);
    assert(swing.payload.caster.startsWith('player:'));
  } finally {
    room.leave(socket);
  }
});

Deno.test('game room: earned gold follows the account into a fresh run', () => {
  const key = 'player-progress:user-1';
  const saved = new Map([[key, { unlocks: ['example'] }]]);
  const room = new GameRoom(makeRoomState(saved), {});
  const first = new FakeSocket();
  room.accept(first, { userId: 'user-1', displayName: 'First' });
  try {
    const welcome = first.sent.find(({ type }) => type === MESSAGE.WELCOME);
    const { peerId } = welcome;
    assertEquals(welcome.snapshot.entities.find(({ owner }) => owner === peerId).state.gold, 0);
    const sim = room.ensureSim();
    const player = sim.getPlayerEntity(peerId);
    const { x, y } = sim.world.get(player, Position);
    spawnGold(sim.world, x, y);
    room.step();
    assertEquals(saved.get(key), { unlocks: ['example'], gold: 1 });

    sim.world.get(player, Health).hp = 0;
    room.step();
    room.broadcastSnapshot();
    const { state } = latestSnapshot(first).entities.find(({ owner }) => owner === peerId);
    assertEquals(state.hp, 0);
    assertEquals(state.gold, 1);
  } finally {
    room.leave(first);
  }

  const nextRoom = new GameRoom(makeRoomState(saved), {});
  const returning = new FakeSocket();
  const otherAccount = new FakeSocket();
  try {
    nextRoom.accept(returning, { userId: 'user-1', displayName: 'Renamed' });
    const restored = returning.sent.find(({ type }) => type === MESSAGE.WELCOME);
    const player = restored.snapshot.entities.find(({ owner }) => owner === restored.peerId).state;
    assertEquals(player.gold, 1);
    assertEquals(player.hp, player.maxHp);
    nextRoom.accept(otherAccount, { userId: 'user-2', displayName: 'Renamed' });
    const other = otherAccount.sent.find(({ type }) => type === MESSAGE.WELCOME);
    assertEquals(other.snapshot.entities.find(({ owner }) => owner === other.peerId).state.gold, 0);
  } finally {
    nextRoom.leave(returning);
    nextRoom.leave(otherAccount);
  }
});
