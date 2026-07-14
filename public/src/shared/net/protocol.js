export const NET_VERSION = '0.3.0';

export const MESSAGE = Object.freeze({
  HELLO: 'hello',
  WELCOME: 'welcome',
  INPUT: 'input',
  SNAPSHOT: 'snapshot',
  PEER_JOINED: 'peer.joined',
  PEER_LEFT: 'peer.left',
  PING: 'ping',
  PONG: 'pong',
  ERROR: 'error',
});

export const DEFAULT_ROOM_ID = 'lobby';

export function normalizeRoomId(raw = DEFAULT_ROOM_ID) {
  return String(raw)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || DEFAULT_ROOM_ID;
}

export function seedFromString(str) {
  let h = 2166136261 >>> 0;
  const text = String(str);
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function makeRoomSeed(roomId = DEFAULT_ROOM_ID) {
  return seedFromString(`room:${normalizeRoomId(roomId)}`);
}

export function normalizeSeed(seed, fallback = 1) {
  const n = Number(seed);
  return (Number.isFinite(n) ? n : fallback) >>> 0;
}

export function encodeMessage(type, payload = {}) {
  return JSON.stringify({
    v: NET_VERSION,
    type,
    t: Date.now(),
    ...payload,
  });
}

export function decodeMessage(raw) {
  const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
  const msg = JSON.parse(text);
  if (!msg || typeof msg !== 'object') throw new Error('message must be an object');
  if (msg.v !== NET_VERSION) throw new Error(`net version mismatch: ${msg.v || 'missing'}`);
  if (typeof msg.type !== 'string' || msg.type.length === 0) throw new Error('message type missing');
  return msg;
}

export function makeInputFrame({
  seq,
  tick,
  moveX = 0,
  moveY = 0,
  aimX = 0,
  aimY = 0,
  fire = false,
  spellSlot = null,
} = {}) {
  return {
    seq: Number.isFinite(seq) ? seq : 0,
    tick: Number.isFinite(tick) ? tick : 0,
    moveX: clampUnit(moveX),
    moveY: clampUnit(moveY),
    aimX: clampUnit(aimX),
    aimY: clampUnit(aimY),
    fire: Boolean(fire),
    spellSlot: Number.isInteger(spellSlot) ? spellSlot : null,
  };
}

function clampUnit(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-1, Math.min(1, n));
}
