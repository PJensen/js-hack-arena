// rules/geometry/caveGrid.js
// Bakes SDF kernel distance fields into a flat grid for O(1) runtime queries.
// The SDF primitives remain the source of truth for generation and rendering;
// this grid is a read-only acceleration structure sampled once at load time.

/**
 * Bake a kernel's distance field into a grid.
 *
 * @param {object}  kernel   – from createKernel (must already contain carves)
 * @param {number}  width    – world width in units
 * @param {number}  height   – world height in units
 * @param {number}  [cellSize=4] – grid resolution (world-units per cell)
 * @returns {object} grid with distanceMove(px,py) and insideFreeForOccl(px,py)
 */
export function bakeGrid(kernel, width, height, cellSize = 4) {
  const cols = Math.ceil(width / cellSize) + 1;
  const rows = Math.ceil(height / cellSize) + 1;
  const moveGrid = new Float32Array(cols * rows);
  const occlGrid = new Uint8Array(cols * rows);

  // Sample the SDF at every grid node
  for (let gy = 0; gy < rows; gy++) {
    const wy = gy * cellSize;
    for (let gx = 0; gx < cols; gx++) {
      const wx = gx * cellSize;
      const idx = gy * cols + gx;
      moveGrid[idx] = kernel.distanceMove(wx, wy);
      occlGrid[idx] = kernel.insideFreeForOccl(wx, wy) ? 1 : 0;
    }
  }

  const invCell = 1 / cellSize;

  /** Bilinear-interpolated movement clearance at (px, py). */
  function distanceMove(px, py) {
    const fx = px * invCell;
    const fy = py * invCell;
    const gx = Math.floor(fx);
    const gy = Math.floor(fy);

    // Clamp to grid bounds
    if (gx < 0 || gy < 0 || gx >= cols - 1 || gy >= rows - 1) return 0;

    const tx = fx - gx;
    const ty = fy - gy;
    const i00 = gy * cols + gx;
    const i10 = i00 + 1;
    const i01 = i00 + cols;
    const i11 = i01 + 1;

    // Bilinear interpolation
    const top    = moveGrid[i00] * (1 - tx) + moveGrid[i10] * tx;
    const bottom = moveGrid[i01] * (1 - tx) + moveGrid[i11] * tx;
    return top * (1 - ty) + bottom * ty;
  }

  /** True if (px, py) is inside free space for occlusion. */
  function insideFreeForOccl(px, py) {
    const gx = Math.round(px * invCell);
    const gy = Math.round(py * invCell);
    if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) return false;
    return occlGrid[gy * cols + gx] === 1;
  }

  return {
    distanceMove,
    insideFreeForOccl,
    cellSize,
    cols,
    rows,
    moveGrid,   // exposed for future lighting passes
    occlGrid,
  };
}
