import {
  ACCOUNT_ALREADY_PLAYING,
  DEFAULT_ROOM_ID,
  MESSAGE,
  decodeMessage,
  encodeMessage,
  makeInputFrame,
  normalizeSeed,
  normalizeRoomId,
  normalizePlayerName,
} from './index.js';
import { normalizeSnapshot } from '../rules/sim/arenaSim.js';

const JOIN_TIMEOUT_MS = 15000;
const JOIN_FAILED = 'Could not join the shared dungeon. Check your connection and try again.';

export function createNetClient({
  sendHz = 20,
  onDisconnect = () => {},
} = {}) {
  const peers = new Map();
  const minSendMs = 1000 / Math.max(1, sendHz);
  let socket = null;
  let peerId = null;
  let status = 'idle';
  let statusDetail = '';
  let seq = 0;
  let lastSendAt = 0;
  let room = DEFAULT_ROOM_ID;
  let welcome = null;
  let connectPromise = null;
  let joinController = null;
  let resolveConnect = null;
  let latestSnapshot = null;

  function connect() {
    if (welcome) return Promise.resolve(welcome);
    if (connectPromise) return connectPromise;
    joinController = new AbortController();
    const controller = joinController;
    const timeout = setTimeout(() => controller.abort(), JOIN_TIMEOUT_MS);
    connectPromise = join(controller.signal).finally(() => {
      clearTimeout(timeout);
      joinController = null;
      connectPromise = null;
    });
    return connectPromise;
  }

  async function join(signal) {
    if (!('WebSocket' in globalThis)) {
      setStatus('offline', 'This browser cannot connect to the shared dungeon.');
      return null;
    }

    setStatus('connecting', 'Joining the shared dungeon…');
    try {
      const url = new URL('/api/rooms/default', location.href);
      url.searchParams.set('room', room);
      const response = await fetch(url, { signal });
      if (response.status === 401) {
        setStatus('auth', 'Your sign-in expired. Sign in again to join.');
        return null;
      }
      if (!response.ok) throw new Error(`room lookup failed: ${response.status}`);
      const info = await response.json();
      signal.throwIfAborted();
      const connection = new WebSocket(info.ws);
      socket = connection;
      const joined = new Promise((resolve) => {
        resolveConnect = resolve;
      });

      signal.addEventListener('abort', () => {
        if (socket !== connection) return;
        setStatus('offline', JOIN_FAILED);
        clearConnection();
        connection.close();
      }, { once: true });
      connection.addEventListener('message', (event) => {
        if (socket === connection) handleMessage(event.data);
      });
      connection.addEventListener('close', (event) => {
        if (socket !== connection) return;
        const wasConnected = Boolean(welcome);
        const message = wasConnected
          ? 'Lost connection to the shared dungeon.'
          : event.code === ACCOUNT_ALREADY_PLAYING
          ? 'Your account is already playing. Close Arena on your other device or tab, then try again.'
          : JOIN_FAILED;
        setStatus('offline', message);
        clearConnection();
        if (wasConnected) onDisconnect(message);
      });
      return joined;
    } catch (err) {
      if (!signal.aborted) console.warn('Could not join the shared dungeon', err);
      setStatus('offline', JOIN_FAILED);
      return null;
    }
  }

  function update(tick, sampledInput, pickupIntent = null) {
    const now = performance.now();
    if (!socket || socket.readyState !== WebSocket.OPEN || now - lastSendAt < minSendMs) return false;
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
        spellCycle: sampledInput?.spellCycle,
        pickupX: pickupIntent?.x,
        pickupY: pickupIntent?.y,
      }),
    });
    return true;
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
        name: normalizePlayerName(peer.name),
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
    if (status === 'connected') return `Online · ${remoteCount + 1} ${remoteCount === 0 ? 'player' : 'players'}`;
    return statusDetail;
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
    resolve(value);
  }

  function clearConnection() {
    socket = null;
    peerId = null;
    welcome = null;
    peers.clear();
    latestSnapshot = null;
    resolveWelcome(null);
  }

  function destroy() {
    const connection = socket;
    clearConnection();
    joinController?.abort();
    connection?.close();
  }

  return {
    connect,
    destroy,
    getLocalPeer,
    getLatestSnapshot,
    getRemotePeers,
    getSeed,
    needsSignIn: () => status === 'auth',
    getStatusText,
    update,
  };
}
