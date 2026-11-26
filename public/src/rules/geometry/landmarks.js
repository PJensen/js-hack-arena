import { sweepMaxFree } from './sweep.js';

export function findReachableNear(grid, { x, y }, distances, accepts = () => true) {
  for (const distance of distances) {
    for (let direction = 0; direction < 16; direction++) {
      const angle = direction * Math.PI / 8;
      const tx = x + Math.cos(angle) * distance;
      const ty = y + Math.sin(angle) * distance;
      if (grid.distanceMove(tx, ty) < 20) continue;
      if (sweepMaxFree(grid, x, y, tx, ty, 18) < 1) continue;
      const point = { x: tx, y: ty };
      if (accepts(point)) return point;
    }
  }
  return null;
}

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
