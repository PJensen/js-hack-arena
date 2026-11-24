import { assertEquals, assertThrows } from "https://deno.land/std@0.220.0/assert/mod.ts";
import {
  MESSAGE,
  MAX_SAY_LENGTH,
  NET_VERSION,
  decodeMessage,
  encodeMessage,
  makeInputFrame,
  makeRoomSeed,
  normalizeRoomId,
  normalizeSayText,
  normalizePlayerName,
} from '../public/src/shared/net/protocol.js';

Deno.test("normalizeRoomId: keeps room ids URL-safe", () => {
  assertEquals(normalizeRoomId(" The Cave Room!! "), "the-cave-room");
  assertEquals(normalizeRoomId(""), "lobby");
});

Deno.test('normalizePlayerName: produces a compact safe world label', () => {
  assertEquals(normalizePlayerName('  Ada   the\nBold  '), 'Ada theBold');
  assertEquals(normalizePlayerName(''), 'Adventurer');
  assertEquals(normalizePlayerName('abcdefghijklmnopqrstuv'), 'abcdefghijklmnopqrst');
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
    spellCycle: 0,
  });
});

Deno.test('say: accepts bounded single-line text and preserves literal markup', () => {
  assertEquals(normalizeSayText('  Hi\n there\u0000 🦇 <b>\u202e '), 'Hi there 🦇 <b>');
  assertEquals(normalizeSayText('a'.repeat(MAX_SAY_LENGTH)).length, MAX_SAY_LENGTH);
  assertEquals(normalizeSayText('a'.repeat(MAX_SAY_LENGTH + 1)), '');
  assertEquals(normalizeSayText({ text: 'hi' }), '');
  assertEquals(makeInputFrame({ cancelCast: true }).cancelCast, true);
});
