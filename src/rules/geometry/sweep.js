// rules/geometry/sweep.js
// Continuous sweep collision — bisection-based.
// Given a line segment and a bounding radius, finds the max safe travel fraction.

/**
 * Returns the largest fraction t ∈ [0,1] such that a circle of radius `r`
 * can travel from (ax,ay) to (ax + dx*t, ay + dy*t) without colliding.
 *
 * @param {object} kernel  – a geometry kernel (from createKernel)
 * @param {number} ax,ay   – start position
 * @param {number} bx,by   – desired end position
 * @param {number} r       – bounding radius
 * @returns {number}         safe fraction in [0,1]
 */
export function sweepMaxFree(kernel, ax, ay, bx, by, r) {
  const L = Math.hypot(bx - ax, by - ay);
  if (L === 0) return 1;
  const sx = (bx - ax) / L;
  const sy = (by - ay) / L;

  if (!sampleCollides(1)) return 1;   // fully clear — fast path

  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (sampleCollides(mid)) hi = mid; else lo = mid;
  }
  return lo;

  function sampleCollides(t) {
    const steps = Math.max(6, Math.ceil(L * t / Math.max(1, r * 0.5)));
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const x = ax + sx * L * t * u;
      const y = ay + sy * L * t * u;
      if (kernel.distanceMove(x, y) + 1e-3 < r) return true;
    }
    return false;
  }
}

/**
 * Move an actor from (x,y) in direction theta by `dist`, respecting collision.
 * Returns { x, y } — the final position after clamping.
 */
export function moveWithCollision(kernel, x, y, theta, dist, radius) {
  const dx = Math.cos(theta) * dist;
  const dy = Math.sin(theta) * dist;
  const t = sweepMaxFree(kernel, x, y, x + dx, y + dy, radius);
  return { x: x + dx * t, y: y + dy * t };
}
