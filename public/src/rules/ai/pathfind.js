// rules/ai/pathfind.js
// A* pathfinding on the SDF distance grid.
// Operates at grid resolution — fast, no allocations beyond the open set.

/**
 * A* from (sx,sy) to (gx,gy) in world coords.
 * Returns array of {x,y} waypoints in world coords, or null if no path.
 *
 * @param {object} grid — { moveGrid, cols, rows, cellSize }
 * @param {number} sx,sy — start (world)
 * @param {number} gx,gy — goal (world)
 * @param {number} radius — actor radius (cells with clearance < radius are walls)
 * @param {number} [maxSteps=600] — search budget
 */
export function astar(grid, sx, sy, gx, gy, radius, maxSteps = 600) {
  const { moveGrid, cols, rows, cellSize } = grid;
  const invCell = 1 / cellSize;

  const startX = (sx * invCell) | 0;
  const startY = (sy * invCell) | 0;
  const goalX  = (gx * invCell) | 0;
  const goalY  = (gy * invCell) | 0;

  if (startX === goalX && startY === goalY) return [];

  // Flat index
  const idx = (x, y) => y * cols + x;

  // Check passable — need clearance > radius
  function passable(gx, gy) {
    if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) return false;
    return moveGrid[gy * cols + gx] > radius;
  }

  if (!passable(goalX, goalY)) return null;

  // Cost maps
  const gCost = new Float32Array(cols * rows);
  gCost.fill(Infinity);
  const cameFrom = new Int32Array(cols * rows);
  cameFrom.fill(-1);

  // Simple binary heap on fCost
  const SQRT2 = 1.414;
  const open = [];  // [{x,y,f}]
  const inOpen = new Uint8Array(cols * rows);

  function heuristic(x, y) {
    const dx = Math.abs(x - goalX), dy = Math.abs(y - goalY);
    return dx + dy - 0.586 * Math.min(dx, dy);  // octile
  }

  gCost[idx(startX, startY)] = 0;
  open.push({ x: startX, y: startY, f: heuristic(startX, startY) });
  inOpen[idx(startX, startY)] = 1;

  // 8-directional neighbors
  const DX = [-1, 0, 1, -1, 1, -1, 0, 1];
  const DY = [-1, -1, -1, 0, 0, 1, 1, 1];
  const DC = [SQRT2, 1, SQRT2, 1, 1, SQRT2, 1, SQRT2];

  let steps = 0;
  while (open.length > 0 && steps++ < maxSteps) {
    // Pop lowest f (simple min-search; fine for ~600 steps)
    let bestI = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i].f < open[bestI].f) bestI = i;
    }
    const cur = open[bestI];
    open[bestI] = open[open.length - 1];
    open.pop();

    const ci = idx(cur.x, cur.y);
    inOpen[ci] = 0;

    if (cur.x === goalX && cur.y === goalY) {
      // Reconstruct path
      const path = [];
      let pi = ci;
      while (pi !== idx(startX, startY) && pi !== -1) {
        const py = (pi / cols) | 0;
        const px = pi - py * cols;
        path.push({ x: px * cellSize + cellSize * 0.5, y: py * cellSize + cellSize * 0.5 });
        pi = cameFrom[pi];
      }
      path.reverse();
      return path;
    }

    const curG = gCost[ci];

    for (let d = 0; d < 8; d++) {
      const nx = cur.x + DX[d], ny = cur.y + DY[d];
      if (!passable(nx, ny)) continue;

      // Diagonal: check both cardinal neighbors are passable (no corner cutting)
      if (DC[d] > 1) {
        if (!passable(cur.x + DX[d], cur.y) || !passable(cur.x, cur.y + DY[d])) continue;
      }

      const ni = idx(nx, ny);
      const ng = curG + DC[d];
      if (ng < gCost[ni]) {
        gCost[ni] = ng;
        cameFrom[ni] = ci;
        if (!inOpen[ni]) {
          open.push({ x: nx, y: ny, f: ng + heuristic(nx, ny) });
          inOpen[ni] = 1;
        }
      }
    }
  }

  return null;  // no path found
}
