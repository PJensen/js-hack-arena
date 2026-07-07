import { assertEquals, assertThrows } from "https://deno.land/std@0.220.0/assert/mod.ts";
import {
  MESSAGE,
  NET_VERSION,
  decodeMessage,
  encodeMessage,
  makeInputFrame,
  makePlayerState,
  makeRoomSeed,
  normalizeRoomId,
} from '../public/src/shared/net/protocol.js';

Deno.test("normalizeRoomId: keeps room ids URL-safe", () => {
  assertEquals(normalizeRoomId(" The Cave Room!! "), "the-cave-room");
  assertEquals(normalizeRoomId(""), "lobby");
});

Deno.test("makeRoomSeed: derives stable seeds from normalized room ids", () => {
  assertEquals(makeRoomSeed(" The Cave Room!! "), makeRoomSeed("the-cave-room"));
  assertEquals(makeRoomSeed("lobby"), makeRoomSeed(""));
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

Deno.test("makePlayerState: normalizes finite position state", () => {
  assertEquals(makePlayerState({ x: "12.5", y: Infinity, facing: Math.PI, hp: "90", maxHp: NaN }), {
    x: 12.5,
    y: 0,
    facing: Math.PI,
    hp: 90,
    maxHp: null,
  });
});
