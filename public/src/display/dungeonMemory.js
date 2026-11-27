const CELL_SIZE = 8;
const MAX_CLEARANCE = 255 / 4;

export function createDungeonMemory(bounds, grid) {
  const cols = Math.ceil(bounds.w / CELL_SIZE);
  const rows = Math.ceil(bounds.h / CELL_SIZE);
  // Coverage and clearance are stored together so filtered edges can recover
  // their terrain value without sampling unobserved geometry.
  const cells = new Uint8Array(cols * rows * 2);
  let headingX, headingY, distance, angle;

  function observe(sight, fov, raysChanged) {
    const [x, y, facingX, facingY] = sight.eye;
    if (!raysChanged && headingX === facingX && headingY === facingY &&
        distance === fov.distance && angle === fov.angle) return null;
    headingX = facingX;
    headingY = facingY;
    distance = fov.distance;
    angle = fov.angle;

    const range = Math.max(distance, sight.ranges[0]);
    const left = Math.max(0, Math.floor((x - range) / CELL_SIZE));
    const top = Math.max(0, Math.floor((y - range) / CELL_SIZE));
    const right = Math.min(cols, Math.ceil((x + range) / CELL_SIZE));
    const bottom = Math.min(rows, Math.ceil((y + range) / CELL_SIZE));
    let x0 = right, y0 = bottom, x1 = left - 1, y1 = top - 1;
    for (let row = top; row < bottom; row++) {
      const worldY = Math.min(bounds.h, (row + 0.5) * CELL_SIZE);
      for (let col = left; col < right; col++) {
        const worldX = Math.min(bounds.w, (col + 0.5) * CELL_SIZE);
        if (!sight.contains(worldX, worldY)) continue;
        const index = (row * cols + col) * 2;
        const clearance = Math.round(Math.min(grid.distanceMove(worldX, worldY), MAX_CLEARANCE) * 4);
        if (cells[index] === 255 && cells[index + 1] === clearance) continue;
        cells[index] = 255;
        cells[index + 1] = clearance;
        x0 = Math.min(x0, col);
        y0 = Math.min(y0, row);
        x1 = Math.max(x1, col);
        y1 = Math.max(y1, row);
      }
    }

    if (x1 < x0) return null;
    return { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
  }

  return { cols, rows, cells, cellSize: CELL_SIZE, observe };
}
