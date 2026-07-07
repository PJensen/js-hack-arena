// net/index.js
//
// Shared browser/Worker networking entrypoint. The static client can import
// protocol helpers from here, while the Cloudflare Worker imports the same
// message contract directly from protocol.js.

export {
  DEFAULT_ROOM_ID,
  MESSAGE,
  NET_VERSION,
  decodeMessage,
  encodeMessage,
  makeInputFrame,
  normalizeRoomId,
} from './protocol.js';
