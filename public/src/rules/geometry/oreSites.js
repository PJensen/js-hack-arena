import { sweepMaxFree } from './sweep.js';

const WALL_CLEARANCE = 18;
const WALL_SEARCH_DISTANCE = 240;
const DEPOSIT_SPACING = 200;
const ORE_DISTRIBUTION = ['copper', 'tin', 'copper', 'tin', 'gold'];

export function isOreWall(grid, { x, y, normalX, normalY }) {
  const step = grid.cellSize;
  return grid.distanceMove(x + normalX * step, y + normalY * step) < WALL_CLEARANCE &&
    grid.distanceMove(x - normalX * step, y - normalY * step) > WALL_CLEARANCE;
}

function findWall(grid, { x, y }, heading) {
  if (grid.distanceMove(x, y) <= WALL_CLEARANCE) return null;
  const dx = Math.cos(heading) * WALL_SEARCH_DISTANCE;
  const dy = Math.sin(heading) * WALL_SEARCH_DISTANCE;
  const hit = sweepMaxFree(grid, x, y, x + dx, y + dy, WALL_CLEARANCE);
  if (hit === 1) return null;

  const wallX = x + dx * hit;
  const wallY = y + dy * hit;
  const step = grid.cellSize;
  const nx = grid.distanceMove(wallX - step, wallY) - grid.distanceMove(wallX + step, wallY);
  const ny = grid.distanceMove(wallX, wallY - step) - grid.distanceMove(wallX, wallY + step);
  const length = Math.hypot(nx, ny);
  if (length === 0) return null;
  const wall = { x: wallX, y: wallY, normalX: nx / length, normalY: ny / length };
  return isOreWall(grid, wall) ? wall : null;
}

export function placeArenaOre({ grid, routes, spawns: [start] }, reserved = []) {
  const sites = [];
  const near = (a, b, distance) => Math.hypot(a.x - b.x, a.y - b.y) < distance;

  function place(wall) {
    if (!wall || sites.some((site) => near(site, wall, DEPOSIT_SPACING)) ||
      reserved.some((site) => near(site, wall, 72))) return false;
    sites.push({ ...wall, kind: ORE_DISTRIBUTION[sites.length % ORE_DISTRIBUTION.length] });
    return true;
  }

  if (start) {
    // Prefer the nearest clear stretch of the entrance chamber's wall.
    const distance = (wall) => Math.hypot(wall.x - start.x, wall.y - start.y);
    const entranceWalls = Array.from({ length: 8 }, (_, direction) => findWall(grid, start, direction * Math.PI / 4))
      .filter(Boolean).sort((a, b) => distance(a) - distance(b));
    entranceWalls.some(place);
  }
  for (const [index, { from, to, points }] of routes.entries()) {
    const flank = Math.atan2(to.y - from.y, to.x - from.x) + (index % 2 ? -1 : 1) * Math.PI / 2;
    const midpoint = points[Math.floor(points.length / 2)];
    for (const anchor of [midpoint, to]) {
      if (place(findWall(grid, anchor, flank)) || place(findWall(grid, anchor, flank + Math.PI))) break;
    }
  }
  return sites;
}
