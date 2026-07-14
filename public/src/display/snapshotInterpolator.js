// Client-owned render interpolation. Authoritative ECS positions remain exact;
// only presentation samples the in-between positions.
import { Position } from '../rules/components/index.js';

export function createSnapshotInterpolator({ sim, intervalMs = 100, now = () => performance.now() }) {
  const tracks = new Map();

  function applySnapshot(snapshot) {
    const at = now();
    const previous = new Map();
    for (const [entityId, position] of sim.world.query(Position)) {
      previous.set(entityId, sample(entityId, position, at));
    }
    if (!sim.applySnapshot(snapshot)) return false;

    const live = new Set();
    for (const [entityId, position] of sim.world.query(Position)) {
      live.add(entityId);
      const from = previous.get(entityId) || { x: position.x, y: position.y };
      tracks.set(entityId, {
        fromX: from.x,
        fromY: from.y,
        toX: position.x,
        toY: position.y,
        startedAt: at,
      });
    }
    for (const entityId of tracks.keys()) if (!live.has(entityId)) tracks.delete(entityId);
    return true;
  }

  function position(entityId, authoritativePosition) {
    return sample(entityId, authoritativePosition, now());
  }

  function sample(entityId, fallback, at) {
    const track = tracks.get(entityId);
    if (!track) return { x: fallback.x, y: fallback.y };
    const alpha = Math.max(0, Math.min(1, (at - track.startedAt) / intervalMs));
    return {
      x: track.fromX + (track.toX - track.fromX) * alpha,
      y: track.fromY + (track.toY - track.fromY) * alpha,
    };
  }

  return { applySnapshot, position };
}
