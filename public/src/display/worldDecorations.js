// Deterministic, presentation-only dungeon dressing. Route torches are both
// landmarks and breadcrumbs; mushrooms form small bioluminescent micro-biomes.
export function createDungeonDecorations({ grid, routes = [], spawns = [], seed = 1 }) {
  const rng = mulberry32(seed ^ 0x51a7f00d);
  const torches = [];
  const mushrooms = [];
  const torchKeys = new Set();

  const placeTorch = (x, y, routeIndex = -1) => {
    const open = findOpen(grid, x, y, 75);
    if (!open) return;
    const key = `${Math.round(open.x / 45)}:${Math.round(open.y / 45)}`;
    if (torchKeys.has(key)) return;
    torchKeys.add(key);
    torches.push({ ...open, routeIndex, phase: rng() * Math.PI * 2 });
  };

  spawns.forEach((spawn, index) => {
    placeTorch(spawn.x + 34, spawn.y, index);
    placeTorch(spawn.x - 34, spawn.y, index);
  });
  routes.forEach((route, routeIndex) => {
    route.points.forEach((point) => placeTorch(point.x, point.y, routeIndex));
  });

  // Cluster mushrooms into broad zones instead of uniform visual noise.
  const clusterCount = Math.max(10, Math.round((grid.width * grid.height) / 600000));
  for (let cluster = 0; cluster < clusterCount; cluster++) {
    const center = findOpen(grid, 120 + rng() * (grid.width - 240), 120 + rng() * (grid.height - 240), 180);
    if (!center) continue;
    const hue = ['frost', 'shadow', 'electric'][cluster % 3];
    const count = 4 + Math.floor(rng() * 8);
    for (let index = 0; index < count; index++) {
      const angle = rng() * Math.PI * 2;
      const distance = 8 + rng() * 62;
      const open = findOpen(grid, center.x + Math.cos(angle) * distance, center.y + Math.sin(angle) * distance, 25);
      if (!open) continue;
      mushrooms.push({ ...open, theme: hue, size: 4 + rng() * 4, phase: rng() * Math.PI * 2 });
    }
  }
  return Object.freeze({ torches: Object.freeze(torches), mushrooms: Object.freeze(mushrooms) });
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
