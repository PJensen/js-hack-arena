// Deterministic, presentation-only dungeon dressing. Route torches are both
// landmarks and breadcrumbs.
export function createDungeonDecorations({ grid, routes = [], spawns = [], seed = 1 }) {
  const rng = mulberry32(seed ^ 0x51a7f00d);
  const torches = [];

  const placeTorch = (x, y, routeIndex = -1) => {
    const open = findOpen(grid, x, y, 75);
    if (!open) return;
    if (torches.some((torch) => Math.hypot(torch.x - open.x, torch.y - open.y) < 240)) return;
    torches.push({ ...open, routeIndex, phase: rng() * Math.PI * 2 });
  };

  spawns.forEach((spawn, index) => {
    placeTorch(spawn.x, spawn.y - 32, index);
  });
  routes.forEach((route, routeIndex) => {
    route.points.forEach((point) => placeTorch(point.x, point.y, routeIndex));
  });

  return Object.freeze({ torches: Object.freeze(torches) });
}

function findOpen(grid, x, y, radius) {
  if (grid.distanceMove(x, y) >= 20) return { x, y };
  for (let distance = 8; distance <= radius; distance += 8) {
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 6) {
      const px = x + Math.cos(angle) * distance;
      const py = y + Math.sin(angle) * distance;
      if (grid.distanceMove(px, py) >= 20) return { x: px, y: py };
    }
  }
  return null;
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let mixed = Math.imul(value ^ (value >>> 15), 1 | value);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}
