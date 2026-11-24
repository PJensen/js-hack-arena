import { assert, assertEquals } from "https://deno.land/std@0.220.0/assert/mod.ts";
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

Deno.test('game room: every connected socket receives both players immediately', () => {
  const room = new GameRoom({ id: { toString: () => 'test-room' } }, {});
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
  const room = new GameRoom({ id: { toString: () => 'test-room' } }, {});
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
