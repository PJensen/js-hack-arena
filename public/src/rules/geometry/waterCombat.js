// Game-wide tuning for electric hits against actors standing in shallow water.
export const WATER_COMBAT = Object.freeze({ damage: 2, critChance: 1, stunDuration: 1 });

export function isStandingInWater(grid, point) {
  if (!grid?.waterGrid || !point) return false;
  const { waterGrid, cols, rows, cellSize } = grid;
  const gx = point.x / cellSize, gy = point.y / cellSize;
  const x = Math.floor(gx), y = Math.floor(gy);
  if (x < 0 || y < 0 || x >= cols - 1 || y >= rows - 1) return false;
  const tx = gx - x, ty = gy - y, i = y * cols + x;
  const north = waterGrid[i] * (1 - tx) + waterGrid[i + 1] * tx;
  const south = waterGrid[i + cols] * (1 - tx) + waterGrid[i + cols + 1] * tx;
  return north * (1 - ty) + south * ty >= 128;
}
