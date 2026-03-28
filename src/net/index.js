// net/index.js — placeholder for future networking layer
//
// Planned structure:
//   net/protocol/   – message schemas, serialisation
//   net/client/     – input buffering, interpolation, reconciliation
//   net/server/     – authoritative tick loop, state broadcast
//
// For now the game runs local-only (single client, no server).
// When networking lands, the rules/ layer stays identical —
// the server just runs the same ECS tick, and the client predicts.

export const NET_VERSION = '0.0.0';
