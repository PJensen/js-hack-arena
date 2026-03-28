// display/passes/cavePass.js
// Pre-bakes cave geometry into an offscreen canvas once at generation time.
// The game loop then just drawImage() — one call per frame, no per-carve paths.

const WALL_COLOR   = '#0b0f12';   // solid rock (matches body bg)
const FLOOR_COLOR  = '#142030';   // carved open space
const EDGE_COLOR   = '#1a2a3f';   // lighter fringe at cave edges
const EDGE_INNER   = '#0f1a28';   // darker transition band

/**
 * Bake cave geometry into an offscreen canvas.
 *
 * @param {object} caveData – output of generateCave()
 * @returns {{ canvas: OffscreenCanvas|HTMLCanvasElement, draw(ctx) }}
 */
export function bakeCavePass(caveData) {
  const { field, cols, rows, cellSize, bounds } = caveData;
  const w = bounds.w;
  const h = bounds.h;

  // Use OffscreenCanvas if available, else fallback
  const offscreen = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(w, h)
    : (() => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; })();
  const octx = offscreen.getContext('2d');

  // Fill solid rock
  octx.fillStyle = WALL_COLOR;
  octx.fillRect(0, 0, w, h);

  // Draw floor cells
  // Two passes: first the edge band, then the core floor
  // This gives a natural rock-edge look without per-pixel SDF sampling

  // Pass 1: edge fringe (slightly larger, lighter tint)
  octx.fillStyle = EDGE_COLOR;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (field[row * cols + col] === 0) continue;
      const x = col * cellSize;
      const y = row * cellSize;
      // Check if this cell borders a wall
      let isEdge = false;
      for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]) {
        const nc = col + dc, nr = row + dr;
        if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) { isEdge = true; break; }
        if (field[nr * cols + nc] === 0) { isEdge = true; break; }
      }
      if (isEdge) {
        // Rounded edge cell — slightly oversized for soft border
        octx.beginPath();
        octx.arc(x + cellSize / 2, y + cellSize / 2, cellSize * 0.75, 0, Math.PI * 2);
        octx.fill();
      }
    }
  }

  // Pass 2: inner edge transition
  octx.fillStyle = EDGE_INNER;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const v = field[row * cols + col];
      if (v === 0) continue;
      // Only cells that are NOT edge but neighbor an edge cell
      let nearEdge = false;
      let isEdge = false;
      for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nc = col + dc, nr = row + dr;
        if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) { isEdge = true; break; }
        if (field[nr * cols + nc] === 0) { isEdge = true; break; }
      }
      if (isEdge) continue;  // skip actual edge cells
      for (const [dc, dr] of [[2,0],[-2,0],[0,2],[0,-2],[1,1],[-1,1],[1,-1],[-1,-1]]) {
        const nc = col + dc, nr = row + dr;
        if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
        if (field[nr * cols + nc] === 0) { nearEdge = true; break; }
      }
      if (nearEdge) {
        const x = col * cellSize, y = row * cellSize;
        octx.fillRect(x, y, cellSize, cellSize);
      }
    }
  }

  // Pass 3: core floor
  octx.fillStyle = FLOOR_COLOR;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const v = field[row * cols + col];
      if (v === 0) continue;
      // Interior cells (not edge, not near-edge) get full floor color
      let isNearWall = false;
      for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1],
                               [2,0],[-2,0],[0,2],[0,-2]]) {
        const nc = col + dc, nr = row + dr;
        if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) { isNearWall = true; break; }
        if (field[nr * cols + nc] === 0) { isNearWall = true; break; }
      }
      if (!isNearWall) {
        const x = col * cellSize, y = row * cellSize;
        octx.fillRect(x, y, cellSize, cellSize);
      }
    }
  }

  return {
    canvas: offscreen,
    width: w,
    height: h,
  };
}
