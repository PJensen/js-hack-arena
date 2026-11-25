import { createChamberField } from './chamberField.js';
import { sweepMaxFree } from './sweep.js';

const WALL_CLEARANCE = 18;
const DEPOSIT_SPACING = 200;
const ORE_DISTRIBUTION = ['copper', 'tin', 'copper', 'tin', 'gold'];
const MINING_RANGE = 92;

function isOreWall(grid, { x, y, normalX, normalY }) {
  const step = grid.cellSize;
  return grid.distanceMove(x + normalX * step, y + normalY * step) < WALL_CLEARANCE &&
    grid.distanceMove(x - normalX * step, y - normalY * step) > WALL_CLEARANCE;
}

export function isOreExposed(grid, site) {
  return site.buried ? grid.distanceMove(site.x, site.y) > WALL_CLEARANCE : isOreWall(grid, site);
}

export function canMineOre(grid, { x, y }, site) {
  return Math.hypot(site.x - x, site.y - y) <= MINING_RANGE &&
    sweepMaxFree(grid, x, y, site.x, site.y, 3) === 1;
}

function findWall(grid, chamber, field, heading) {
  const { x, y, r, aspect } = chamber;
  const reach = r * Math.max(aspect, 1 / aspect) + 24;
  const rayX = Math.cos(heading);
  const rayY = Math.sin(heading);
  const dx = rayX * reach;
  const dy = rayY * reach;
  const hit = sweepMaxFree(grid, x, y, x + dx, y + dy, WALL_CLEARANCE);
  if (hit === 1) return null;

  const wallX = x + dx * hit;
  const wallY = y + dy * hit;
  // Rays can leave a chamber through a passage. Keep contacts on the room's rim.
  if (field(wallX, wallY) < -8) return null;
  const step = grid.cellSize;
  const nx = grid.distanceMove(wallX - step, wallY) - grid.distanceMove(wallX + step, wallY);
  const ny = grid.distanceMove(wallX, wallY - step) - grid.distanceMove(wallX, wallY + step);
  const length = Math.hypot(nx, ny);
  if (length === 0) return null;
  const wall = { x: wallX, y: wallY, normalX: nx / length, normalY: ny / length };
  if (wall.normalX * rayX + wall.normalY * rayY < 0.7) return null;
  return isOreWall(grid, wall) ? wall : null;
}

function buryOre(grid, wall) {
  for (const cells of [3, 4]) {
    const depth = grid.cellSize * cells;
    const x = wall.x + wall.normalX * depth;
    const y = wall.y + wall.normalY * depth;
    if (grid.distanceMove(x, y) === 0 &&
      grid.distanceMove(x - wall.normalX * grid.cellSize, y - wall.normalY * grid.cellSize) < WALL_CLEARANCE) {
      return { ...wall, x, y, buried: true };
    }
  }
  return null;
}

export function placeArenaOre({ grid, chambers, spawns: [start] }, reserved = []) {
  if (!start) return [];
  const sites = [];
  const near = (a, b, distance) => Math.hypot(a.x - b.x, a.y - b.y) < distance;
  const distanceFromStart = ({ x, y }) => Math.hypot(x - start.x, y - start.y);
  const rooms = [...chambers].sort((a, b) => distanceFromStart(a) - distanceFromStart(b));
  for (const [index, room] of rooms.entries()) {
    if (grid.distanceMove(room.x, room.y) <= WALL_CLEARANCE) continue;
    const field = createChamberField(room);
    const walls = Array.from({ length: 16 }, (_, direction) => findWall(grid, room, field, direction * Math.PI / 8))
      .filter(Boolean);
    const roomDistance = ({ x, y }) => Math.hypot(x - room.x, y - room.y);
    walls.sort((a, b) => roomDistance(a) - roomDistance(b));
    for (const wall of walls) {
      const site = index % 3 === 2 ? buryOre(grid, wall) : wall;
      if (!site || sites.some((other) => near(site, other, DEPOSIT_SPACING)) ||
        reserved.some((other) => near(site, other, 72))) continue;
      sites.push({ ...site, kind: ORE_DISTRIBUTION[sites.length % ORE_DISTRIBUTION.length] });
      break;
    }
  }
  return sites;
}
