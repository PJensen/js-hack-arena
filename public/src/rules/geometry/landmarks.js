import { ConditionId } from '../data/conditionCatalog.js';

export function findStartingCampfire(grid, start) {
  if (!start) return null;
  // Keep the campfire on open floor in the starting chamber.
  const position = findOpen(grid, start.x, start.y - 76, 24, 38) ??
    findOpen(grid, start.x, start.y + 76, 24, 38);
  return position && Object.freeze({
    ...position,
    contactRadius: 16,
    conditionId: ConditionId.BURNING,
  });
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
