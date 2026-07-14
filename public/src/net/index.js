// net/index.js
//
// Browser networking entrypoint. Shared protocol helpers live under
// src/shared so the Worker can import the same contract without depending on
// browser-only client modules.

export {
  DEFAULT_ROOM_ID,
  MESSAGE,
  NET_VERSION,
  decodeMessage,
  encodeMessage,
  makeInputFrame,
  makeRoomSeed,
  normalizeRoomId,
  normalizeSeed,
  seedFromString,
} from '../shared/net/protocol.js';
