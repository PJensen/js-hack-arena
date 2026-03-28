// rules/geometry/sdf.js
// Signed-distance-field primitives. Positive = inside free space.
// Ported from the world-carving-editor (analytic, no grid).

const TAU = Math.PI * 2;

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const len   = (x, y) => Math.hypot(x, y);

/**
 * Closest point on segment AB to point P.
 * Returns { x, y, t } where t ∈ [0,1] is the parametric position.
 */
export function closestOnSeg(px, py, ax, ay, bx, by) {
  const abx = bx - ax, aby = by - ay;
  const apx = px - ax, apy = py - ay;
  const ab2 = abx * abx + aby * aby;
  if (ab2 === 0) return { x: ax, y: ay, t: 0 };
  let t = (apx * abx + apy * aby) / ab2;
  t = clamp(t, 0, 1);
  return { x: ax + abx * t, y: ay + aby * t, t };
}

/** Capsule / line-segment SDF.  Positive inside free-space of radius `r`. */
export function capsule(px, py, ax, ay, bx, by, r) {
  const c = closestOnSeg(px, py, ax, ay, bx, by);
  return r - len(px - c.x, py - c.y);
}

/** Circle SDF.  Positive inside radius `r` centred at (cx,cy). */
export function circle(px, py, cx, cy, r) {
  return r - len(px - cx, py - cy);
}

/** Oriented box SDF.  Negative inside.  hx/hy = half-extents, rot = radians. */
export function obox(px, py, cx, cy, hx, hy, rot) {
  const s = Math.sin(rot), c = Math.cos(rot);
  const dx = px - cx, dy = py - cy;
  const lx = Math.abs(c * dx + s * dy) - hx;
  const ly = Math.abs(-s * dx + c * dy) - hy;
  const ax = Math.max(lx, 0), ay = Math.max(ly, 0);
  const outside = Math.hypot(ax, ay);
  const inside  = Math.max(lx, ly);
  return -(outside) - inside;
}

export { TAU };
