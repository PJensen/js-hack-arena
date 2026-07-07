import { assertEquals, assertThrows } from "https://deno.land/std@0.220.0/assert/mod.ts";
import {
  MESSAGE,
  NET_VERSION,
  decodeMessage,
  encodeMessage,
  makeInputFrame,
  normalizeRoomId,
} from '../src/net/protocol.js';

Deno.test("normalizeRoomId: keeps room ids URL-safe", () => {
  assertEquals(normalizeRoomId(" The Cave Room!! "), "the-cave-room");
  assertEquals(normalizeRoomId(""), "lobby");
});

Deno.test("protocol: encode/decode roundtrip", () => {
  const raw = encodeMessage(MESSAGE.PING, { nonce: "abc" });
  const msg = decodeMessage(raw);
  assertEquals(msg.v, NET_VERSION);
  assertEquals(msg.type, MESSAGE.PING);
  assertEquals(msg.nonce, "abc");
});

Deno.test("protocol: rejects version mismatch", () => {
  assertThrows(() => decodeMessage(JSON.stringify({ v: "old", type: MESSAGE.PING })));
});

Deno.test("makeInputFrame: clamps analog values", () => {
  assertEquals(makeInputFrame({ moveX: 2, moveY: -2, fire: 1 }), {
    seq: 0,
    tick: 0,
    moveX: 1,
    moveY: -1,
    aimX: 0,
    aimY: 0,
    fire: true,
    spellSlot: null,
  });
});
