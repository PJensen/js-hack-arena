// rules/geometry/kernel.js
// Geometry kernel — stores carved primitives and answers distance queries.
// Ported from the world-carving-editor; now a proper ES module with
// instance-based state (no singletons).

import * as SDF from './sdf.js';

/**
 * Carve primitive types:
 *   circle   – { type, cx, cy, r, affectsMove, affectsOccl }
 *   capsule  – { type, ax, ay, bx, by, r, affectsMove, affectsOccl }
 *   rectslot – same shape as capsule (SDF uses capsule distance)
 *   square   – { type, ax, ay, bx, by, halfW, rot, affectsMove, affectsOccl }
 */

/** Create a fresh geometry kernel instance. */
export function createKernel() {
  const carves = [];

  // ── Carving API ──────────────────────────────────────────────

  function carveCircle(cx, cy, r, flags = {}) {
    carves.push({ type: 'circle', cx, cy, r, ...flags });
    return carves.length - 1;
  }

  function carveCapsule(ax, ay, bx, by, r, flags = {}) {
    carves.push({ type: 'capsule', ax, ay, bx, by, r, ...flags });
    return carves.length - 1;
  }

  function carveRectSlot(ax, ay, bx, by, r, flags = {}) {
    carves.push({ type: 'rectslot', ax, ay, bx, by, r, ...flags });
    return carves.length - 1;
  }

  function carveSquare(ax, ay, bx, by, halfW, rot, flags = {}) {
    carves.push({ type: 'square', ax, ay, bx, by, halfW, rot, ...flags });
    return carves.length - 1;
  }

  function clear() { carves.length = 0; }

  // ── Distance queries ─────────────────────────────────────────

  function _sdfForCarve(g, px, py) {
    switch (g.type) {
      case 'circle':
        return SDF.circle(px, py, g.cx, g.cy, g.r);
      case 'capsule':
      case 'rectslot':
        return SDF.capsule(px, py, g.ax, g.ay, g.bx, g.by, g.r);
      case 'square': {
        const hx = 0.5 * Math.hypot(g.bx - g.ax, g.by - g.ay);
        const hy = g.halfW;
        const cx = (g.ax + g.bx) / 2, cy = (g.ay + g.by) / 2;
        return SDF.obox(px, py, cx, cy, hx, hy, g.rot);
      }
    }
    return -Infinity;
  }

  /** Max penetration depth into any movement-affecting carve (0 = outside all). */
  function distanceMove(px, py) {
    let best = -Infinity;
    for (const g of carves) {
      if (g.affectsMove === false) continue;
      best = Math.max(best, _sdfForCarve(g, px, py));
    }
    return Math.max(0, best);
  }

  /** True if (px,py) is inside free space for occlusion queries. */
  function insideFreeForOccl(px, py) {
    let best = -Infinity;
    for (const g of carves) {
      if (g.affectsOccl === false) continue;
      best = Math.max(best, _sdfForCarve(g, px, py));
    }
    return best > 0;
  }

  /** Distance to nearest carve of any kind (useful for AI / spatial sense). */
  function distanceAny(px, py) {
    let best = -Infinity;
    for (const g of carves) {
      best = Math.max(best, _sdfForCarve(g, px, py));
    }
    return Math.max(0, best);
  }

  // ── Serialization ────────────────────────────────────────────

  function serialize() { return JSON.stringify(carves); }

  function deserialize(json) {
    const arr = JSON.parse(json);
    carves.length = 0;
    for (const g of arr) carves.push(g);
  }

  return {
    carves,
    carveCircle,
    carveCapsule,
    carveRectSlot,
    carveSquare,
    clear,
    distanceMove,
    insideFreeForOccl,
    distanceAny,
    serialize,
    deserialize,
  };
}
