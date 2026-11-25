// Client-owned render interpolation. Authoritative ECS positions remain exact;
// only presentation samples the in-between positions.
import { LootToss, Position } from '../rules/components/index.js';

export function createSnapshotInterpolator({ sim, intervalMs = 100, now = () => performance.now() }) {
  const tracks = new Map();

  function applySnapshot(snapshot) {
    const at = now();
    const previous = new Map();
    for (const [entityId, position] of sim.world.query(Position)) {
      previous.set(entityId, sample(entityId, position, currentLootHeight(entityId), at));
    }
    if (!sim.applySnapshot(snapshot)) return false;

    const live = new Set();
    for (const [entityId, position] of sim.world.query(Position)) {
      live.add(entityId);
      const height = currentLootHeight(entityId);
      const from = previous.get(entityId) || { x: position.x, y: position.y, height };
      tracks.set(entityId, {
        fromX: from.x,
        fromY: from.y,
        toX: position.x,
        toY: position.y,
        fromHeight: from.height,
        toHeight: height,
        startedAt: at,
      });
    }
    for (const entityId of tracks.keys()) if (!live.has(entityId)) tracks.delete(entityId);
    return true;
  }

  function position(entityId, authoritativePosition) {
    const { x, y } = sample(entityId, authoritativePosition, 0, now());
    return { x, y };
  }

  function currentLootHeight(entityId) {
    return sim.world.get(entityId, LootToss)?.height ?? 0;
  }

  function lootHeight(entityId) {
    const track = tracks.get(entityId);
    return track ? sampleHeight(track, progress(track, now())) : currentLootHeight(entityId);
  }

  function progress(track, at) {
    return Math.max(0, Math.min(1, (at - track.startedAt) / intervalMs));
  }

  function sampleHeight(track, alpha) {
    return track.fromHeight + (track.toHeight - track.fromHeight) * alpha;
  }

  function sample(entityId, fallback, height, at) {
    const track = tracks.get(entityId);
    if (!track) return { x: fallback.x, y: fallback.y, height };
    const alpha = progress(track, at);
    return {
      x: track.fromX + (track.toX - track.fromX) * alpha,
      y: track.fromY + (track.toY - track.fromY) * alpha,
      height: sampleHeight(track, alpha),
    };
  }

  return { applySnapshot, position, lootHeight };
}
