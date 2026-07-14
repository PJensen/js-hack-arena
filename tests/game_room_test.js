import { assert, assertEquals } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { MESSAGE, decodeMessage } from '../public/src/shared/net/protocol.js';
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

  room.accept(first);
  const beforeJoin = latestSnapshot(first);
  room.accept(second);
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
