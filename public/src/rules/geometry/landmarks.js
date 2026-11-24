export function findOpen(grid, x, y, radius, clearance = 20) {
  if (grid.distanceMove(x, y) >= clearance) return { x, y };
  for (let distance = 8; distance <= radius; distance += 8) {
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 6) {
      const px = x + Math.cos(angle) * distance;
      const py = y + Math.sin(angle) * distance;
      if (grid.distanceMove(px, py) >= clearance) return { x: px, y: py };
    }
  }
  return null;
}
