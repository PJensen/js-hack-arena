// rules/geometry/carve.js
// Destructible terrain — poke holes in the SDF grid + baked cave canvas.

/**
 * Create a carve function bound to a grid and baked cave canvas.
 *
 * @param {object} grid — { moveGrid, cols, rows, cellSize }
 * @param {{ canvas }} caveBake — the pre-baked cave pass
 * @returns {(wx, wy, radius) => void}
 */
export function createCarver(grid, caveBake) {
  const { moveGrid, cols, rows, cellSize } = grid;
  const bakeCtx = caveBake.canvas.getContext('2d');

  /**
   * Carve a hole in the cave at world position (wx, wy) with given radius.
   * Updates both the collision grid and the visual bake.
   */
  return function carve(wx, wy, radius) {
    const clearance = 40;  // how "open" carved cells become
    const invCell = 1 / cellSize;

    // Grid cells to poke
    const gx0 = Math.max(0, Math.floor((wx - radius) * invCell));
    const gy0 = Math.max(0, Math.floor((wy - radius) * invCell));
    const gx1 = Math.min(cols - 1, Math.ceil((wx + radius) * invCell));
    const gy1 = Math.min(rows - 1, Math.ceil((wy + radius) * invCell));
    const r2 = radius * radius;

    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const dx = gx * cellSize - wx, dy = gy * cellSize - wy;
        if (dx * dx + dy * dy <= r2) {
          moveGrid[gy * cols + gx] = clearance;
        }
      }
    }

    // Paint floor on the baked canvas
    bakeCtx.beginPath();
    bakeCtx.arc(wx, wy, radius, 0, Math.PI * 2);
    // Edge fringe
    bakeCtx.fillStyle = '#0f1a28';
    bakeCtx.arc(wx, wy, radius + 2, 0, Math.PI * 2);
    bakeCtx.fill();
    // Core floor
    bakeCtx.beginPath();
    bakeCtx.arc(wx, wy, radius, 0, Math.PI * 2);
    bakeCtx.fillStyle = '#142030';
    bakeCtx.fill();
  };
}
