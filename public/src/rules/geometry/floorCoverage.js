// Floor paint masks are sampled at grid intersections and filtered like the terrain texture.
export function hasFloorCoverage(grid, mask, point) {
  if (!mask || !point) return false;
  const { cols, rows, cellSize } = grid;
  const gx = point.x / cellSize, gy = point.y / cellSize;
  const x = Math.floor(gx), y = Math.floor(gy);
  if (x < 0 || y < 0 || x >= cols - 1 || y >= rows - 1) return false;
  const tx = gx - x, ty = gy - y, i = y * cols + x;
  const north = mask[i] * (1 - tx) + mask[i + 1] * tx;
  const south = mask[i + cols] * (1 - tx) + mask[i + cols + 1] * tx;
  return north * (1 - ty) + south * ty >= 128;
}
