import {
  DEFAULT_ROOM_ID,
  MESSAGE,
  decodeMessage,
  encodeMessage,
  makeInputFrame,
  normalizeSeed,
  normalizeRoomId,
} from './index.js';
import { normalizeSnapshot } from '../rules/sim/arenaSim.js';

export function createNetClient({
  roomId = DEFAULT_ROOM_ID,
  sendHz = 20,
} = {}) {
  const peers = new Map();
  const minSendMs = 1000 / Math.max(1, sendHz);
  let socket = null;
  let peerId = null;
  let status = 'idle';
  let statusDetail = '';
  let seq = 0;
  let lastSendAt = 0;
  let room = normalizeRoomId(roomId);
  let welcome = null;
  let connectPromise = null;
  let resolveConnect = null;
  let latestSnapshot = null;

  async function connect() {
    if (!('WebSocket' in globalThis)) {
      setStatus('offline', 'websocket unavailable');
      return null;
    }
    if (welcome) return welcome;
    if (connectPromise) return connectPromise;
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return null;

    setStatus('connecting', room);
    try {
      const url = new URL('/api/rooms/default', location.href);
      url.searchParams.set('room', room);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`room lookup failed: ${response.status}`);
      const info = await response.json();
      socket = new WebSocket(info.ws);
      connectPromise = new Promise((resolve) => {
        resolveConnect = resolve;
      });

      socket.addEventListener('open', () => {
        setStatus('joining', room);
        send(MESSAGE.HELLO, {});
      });
      socket.addEventListener('message', (event) => {
        handleMessage(event.data);
      });
      socket.addEventListener('close', () => {
        socket = null;
        peers.clear();
        latestSnapshot = null;
        setStatus('offline', 'socket closed');
        resolveWelcome(null);
      });
      socket.addEventListener('error', () => {
        setStatus('error', 'socket error');
        resolveWelcome(null);
      });
      return connectPromise;
    } catch (err) {
      socket = null;
      peers.clear();
      latestSnapshot = null;
      setStatus('offline', err.message);
      resolveWelcome(null);
      return null;
    }
  }

  function update(tick, sampledInput) {
    const now = performance.now();
    if (!socket || socket.readyState !== WebSocket.OPEN || now - lastSendAt < minSendMs) return;
    lastSendAt = now;
    send(MESSAGE.INPUT, {
      input: makeInputFrame({
        seq: ++seq,
        tick,
        moveX: sampledInput?.intent?.moveX,
        moveY: sampledInput?.intent?.moveY,
        aimX: sampledInput?.intent?.aimX,
        aimY: sampledInput?.intent?.aimY,
        fire: sampledInput?.intent?.fire,
        spellSlot: sampledInput?.spellSlot,
      }),
    });
  }

  function handleMessage(raw) {
    let msg;
    try {
      msg = decodeMessage(raw);
    } catch (err) {
      setStatus('error', err.message);
      return;
    }

    if (msg.type === MESSAGE.WELCOME) {
      peerId = msg.peerId;
      welcome = {
        ...msg,
        seed: normalizeSeed(msg.seed),
        roomId: normalizeRoomId(msg.roomId || room),
        snapshot: acceptSnapshot(msg.snapshot),
      };
      room = welcome.roomId;
      applyPeerList(msg.peers);
      setStatus('connected', room);
      resolveWelcome(welcome);
      return;
    }

    if (msg.type === MESSAGE.SNAPSHOT) {
      acceptSnapshot(msg.snapshot);
      return;
    }

    if (msg.type === MESSAGE.PEER_JOINED) {
      applyPeerList(msg.peers);
      return;
    }

    if (msg.type === MESSAGE.PEER_LEFT) {
      if (msg.peerId) peers.delete(msg.peerId);
      applyPeerList(msg.peers);
      return;
    }

    if (msg.type === MESSAGE.ERROR) {
      setStatus('error', msg.error || 'server error');
    }
  }

  function applyPeerList(peerList = []) {
    const live = new Set();
    for (const peer of peerList) {
      if (!peer?.id) continue;
      live.add(peer.id);
      peers.set(peer.id, {
        id: peer.id,
        joinedAt: peer.joinedAt,
        lastSeenAt: peer.lastSeenAt,
      });
    }
    for (const id of peers.keys()) {
      if (!live.has(id)) peers.delete(id);
    }
  }

  function getRemotePeers() {
    return [...peers.values()].filter((peer) => peer.id !== peerId);
  }

  function getLocalPeer() {
    return peerId ? peers.get(peerId) || null : null;
  }

  function getStatusText() {
    const remoteCount = getRemotePeers().length;
    if (status === 'connected') return `net:${room} seed:${welcome?.seed?.toString(16) || '-'} peers:${remoteCount}`;
    return `net:${status}${statusDetail ? ' ' + statusDetail : ''}`;
  }

  function getSeed() {
    return welcome?.seed ?? null;
  }

  function getLatestSnapshot() {
    return latestSnapshot;
  }

  function acceptSnapshot(snapshot) {
    if (!snapshot) return latestSnapshot;
    try {
      const normalized = normalizeSnapshot(snapshot);
      if (!latestSnapshot || normalized.revision > latestSnapshot.revision) latestSnapshot = normalized;
    } catch (err) {
      setStatus('error', err.message);
    }
    return latestSnapshot;
  }

  function send(type, payload) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(encodeMessage(type, payload));
  }

  function setStatus(next, detail = '') {
    status = next;
    statusDetail = detail;
  }

  function resolveWelcome(value) {
    if (!resolveConnect) return;
    const resolve = resolveConnect;
    resolveConnect = null;
    connectPromise = null;
    resolve(value);
  }

  function destroy() {
    if (socket) socket.close();
    socket = null;
    peers.clear();
    latestSnapshot = null;
  }

  return {
    connect,
    destroy,
    getLocalPeer,
    getLatestSnapshot,
    getRemotePeers,
    getSeed,
    getStatusText,
    update,
  };
}
