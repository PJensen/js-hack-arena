// rules/geometry/caveGen.js
// Natural cave generation: grow a connected, branching cave skeleton, then
// erode its chambers and passages with coherent noise before baking clearance.

import { findOpen, findReachableNear } from './landmarks.js';
import { createChamberField } from './chamberField.js';
import { placeArenaOre } from './oreSites.js';
import { sweepMaxFree } from './sweep.js';

export function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6D2B79F5) | 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function buildPermutation(rng) {
  const p = new Uint8Array(512);
  const base = new Uint8Array(256);
  for (let i = 0; i < 256; i++) base[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    [base[i], base[j]] = [base[j], base[i]];
  }
  for (let i = 0; i < 256; i++) p[i] = p[i + 256] = base[i];
  return p;
}

const GRAD2 = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [
  0,
  -1,
]];

export function createPerlin2D(seed) {
  const perm = buildPermutation(mulberry32(seed));
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + t * (b - a);
  return function noise(x, y) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x), yf = y - Math.floor(y);
    const u = fade(xf), v = fade(yf);
    const dot = (hash, fx, fy) => {
      const g = GRAD2[hash & 7];
      return g[0] * fx + g[1] * fy;
    };
    const aa = perm[perm[X] + Y], ab = perm[perm[X] + Y + 1];
    const ba = perm[perm[X + 1] + Y], bb = perm[perm[X + 1] + Y + 1];
    return lerp(
      lerp(dot(aa, xf, yf), dot(ba, xf - 1, yf), u),
      lerp(dot(ab, xf, yf - 1), dot(bb, xf - 1, yf - 1), u),
      v,
    );
  };
}

export function fbm(noise, x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
  let amp = 1, freq = 1, sum = 0, max = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(x * freq, y * freq);
    max += amp;
    freq *= lacunarity;
    amp *= gain;
  }
  return sum / max;
}

// Morphology, rather than arbitrary open-space thresholds. Passage widths are
// intentionally substantial: walls should dominate the map without becoming
// frustrating to navigate.
export const CaveProfile = Object.freeze({
  CAVERNS: {
    chamberRadius: [92, 180],
    passageRadius: [34, 58],
    branchiness: 0.42,
    turn: 0.65,
  },
  TUNNELS: {
    chamberRadius: [64, 112],
    passageRadius: [26, 42],
    branchiness: 0.28,
    turn: 0.82,
  },
  GROTTOS: {
    chamberRadius: [120, 220],
    passageRadius: [38, 68],
    branchiness: 0.34,
    turn: 0.52,
  },
  WARRENS: {
    chamberRadius: [52, 92],
    passageRadius: [23, 36],
    branchiness: 0.62,
    turn: 0.95,
  },
});

const mix = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function growTopology(seed, width, height, profile, chamberTarget, passageLength) {
  const rng = mulberry32(seed ^ 0xC4A9E5);
  const margin = Math.min(180, Math.min(width, height) * 0.14);
  const root = {
    x: width * (0.46 + rng() * 0.08),
    y: height * (0.46 + rng() * 0.08),
    depth: 0,
  };
  const chambers = [{
    ...root,
    r: mix(...profile.chamberRadius, rng()),
    aspect: mix(0.72, 1.3, rng()),
    angle: rng() * Math.PI,
  }];
  const routes = [];
  const frontier = [{ node: root, angle: rng() * Math.PI * 2, depth: 0 }];
  const target = chamberTarget ?? clamp(Math.round(Math.min(width, height) / 270), 4, 15);

  while (frontier.length && chambers.length < target) {
    const current = frontier.shift();
    const children = current.depth === 0
      ? 3
      : (rng() < profile.branchiness ? 2 : 1);
    const attempts = chamberTarget == null ? children : children + 4;
    for (let attempt = 0, accepted = 0; attempt < attempts && accepted < children && chambers.length < target; attempt++) {
      const child = chamberTarget == null ? attempt : accepted;
      let angle = current.angle + (rng() - 0.5) * profile.turn +
        (children > 1 ? (child - (children - 1) / 2) * 1.05 : 0);
      const length = mix(...passageLength, rng());
      let x = current.node.x, y = current.node.y;
      const points = [{ x, y }];
      const steps = Math.max(4, Math.round(length / 55));
      for (let step = 1; step <= steps; step++) {
        angle += (rng() - 0.5) * profile.turn * 0.28;
        const stride = length / steps;
        x = clamp(x + Math.cos(angle) * stride, margin, width - margin);
        y = clamp(y + Math.sin(angle) * stride, margin, height - margin);
        points.push({ x, y });
      }
      // Reject branches that fold back into an existing chamber; this leaves
      // readable wall masses between neighboring limbs.
      if (
        chambers.some((room, index) =>
          index > 0 && Math.hypot(room.x - x, room.y - y) < room.r * 1.35
        )
      ) continue;
      const node = { x, y, depth: current.depth + 1 };
      const radius = mix(...profile.chamberRadius, rng()) *
        (rng() < 0.22 ? 1.3 : 1);
      chambers.push({
        ...node,
        r: radius,
        aspect: mix(0.68, 1.35, rng()),
        angle: angle + (rng() - 0.5),
      });
      routes.push({
        from: { x: current.node.x, y: current.node.y },
        to: { x, y },
        points,
        radius: mix(...profile.passageRadius, rng()),
      });
      frontier.push({ node, angle, depth: current.depth + 1 });
      accepted++;
    }
  }
  return { chambers, routes };
}

function distanceToSegment(px, py, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = clamp(
    ((px - a.x) * dx + (py - a.y) * dy) / (dx * dx + dy * dy || 1),
    0,
    1,
  );
  return Math.hypot(px - a.x - dx * t, py - a.y - dy * t);
}

function bakeGrid(seed, width, height, topology, cellSize) {
  const cols = Math.ceil(width / cellSize) + 1,
    rows = Math.ceil(height / cellSize) + 1;
  const densityGrid = new Float32Array(cols * rows);
  const moveGrid = new Float32Array(cols * rows);
  densityGrid.fill(-120);
  const boundaryNoise = createPerlin2D(seed ^ 0x71F04D);
  const detailNoise = createPerlin2D(seed ^ 0xB52AC1);
  const segments = topology.routes.flatMap((route) =>
    route.points.slice(1).map((point, i) => ({
      a: route.points[i],
      b: point,
      radius: route.radius *
        mix(0.86, 1.14, i / Math.max(1, route.points.length - 2)),
    }))
  );

  function visitBounds(minX, minY, maxX, maxY, sample) {
    const fromX = clamp(Math.floor(minX / cellSize), 0, cols - 1);
    const toX = clamp(Math.ceil(maxX / cellSize), 0, cols - 1);
    const fromY = clamp(Math.floor(minY / cellSize), 0, rows - 1);
    const toY = clamp(Math.ceil(maxY / cellSize), 0, rows - 1);
    for (let gy = fromY; gy <= toY; gy++) {
      for (let gx = fromX; gx <= toX; gx++) {
        const index = gy * cols + gx;
        densityGrid[index] = Math.max(
          densityGrid[index],
          sample(gx * cellSize, gy * cellSize),
        );
      }
    }
  }

  for (const room of topology.chambers) {
    const reach = room.r * Math.max(room.aspect, 1 / room.aspect) + 36;
    visitBounds(
      room.x - reach,
      room.y - reach,
      room.x + reach,
      room.y + reach,
      createChamberField(room),
    );
  }
  for (const segment of segments) {
    const reach = segment.radius + 36;
    visitBounds(
      Math.min(segment.a.x, segment.b.x) - reach,
      Math.min(segment.a.y, segment.b.y) - reach,
      Math.max(segment.a.x, segment.b.x) + reach,
      Math.max(segment.a.y, segment.b.y) + reach,
      (x, y) => segment.radius - distanceToSegment(x, y, segment.a, segment.b),
    );
  }

  for (let gy = 0; gy < rows; gy++) {
    const y = gy * cellSize;
    for (let gx = 0; gx < cols; gx++) {
      const x = gx * cellSize;
      let field = densityGrid[gy * cols + gx];
      // Broad strata make walls swell and recede; fine erosion roughens edges.
      const erosion = fbm(boundaryNoise, x * 0.006, y * 0.006, 3) * 25 +
        detailNoise(x * 0.021, y * 0.021) * 7;
      const edge = Math.min(x, y, width - x, height - y);
      field = Math.min(field + erosion, edge - 70);
      densityGrid[gy * cols + gx] = field / 90;
      moveGrid[gy * cols + gx] = field > 0 ? field : 0;
    }
  }

  const invCell = 1 / cellSize;
  function distanceMove(px, py) {
    const fx = px * invCell,
      fy = py * invCell,
      gx = Math.floor(fx),
      gy = Math.floor(fy);
    if (gx < 0 || gy < 0 || gx >= cols - 1 || gy >= rows - 1) return 0;
    const tx = fx - gx, ty = fy - gy, i = gy * cols + gx;
    const top = mix(moveGrid[i], moveGrid[i + 1], tx);
    const bottom = mix(moveGrid[i + cols], moveGrid[i + cols + 1], tx);
    return mix(top, bottom, ty);
  }
  return {
    distanceMove,
    cellSize,
    cols,
    rows,
    width,
    height,
    moveGrid,
    densityGrid,
  };
}

export function generateCave(opts = {}) {
  const {
    seed = 42,
    width = 4000,
    height = 4000,
    profile = CaveProfile.CAVERNS,
    cellSize = 4,
    spawnCount = 4,
    spawnSpacing = 400,
    chamberTarget,
    passageLength = [250, 470],
  } = opts;
  const topology = growTopology(seed, width, height, profile, chamberTarget, passageLength);
  const grid = bakeGrid(seed, width, height, topology, cellSize);
  const candidates = [...topology.chambers].sort((a, b) => b.r - a.r);
  const spawns = [];
  for (const room of candidates) {
    if (spawns.length >= spawnCount) break;
    if (grid.distanceMove(room.x, room.y) < 20) continue;
    if (
      spawns.every((spawn) =>
        Math.hypot(spawn.x - room.x, spawn.y - room.y) >= spawnSpacing
      )
    ) spawns.push({ x: room.x, y: room.y });
  }
  if (!spawns.length) {
    spawns.push({ x: topology.chambers[0].x, y: topology.chambers[0].y });
  }
  // Decoration landmarks are sparse samples; the complete curved route remains
  // encoded by the floor itself.
  const routes = topology.routes.map((route) => ({
    ...route,
    points: route.points.filter((_, i) =>
      i === 0 || i === route.points.length - 1 || i % 6 === 0
    ),
  }));
  return { grid, bounds: { w: width, h: height }, spawns, routes, chambers: topology.chambers };
}

const ARENA_ENEMY_COUNT = 9;
const ENTRANCE_EXCLUSION_RADIUS = 320;
const PATROL_DISTANCE = 64;
const MOB_CLEARANCE = 20;
const CHEST_CLEARANCE = 20;
const CHEST_DISTANCE = 48;
const pointDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function placeArenaEncounters({ grid, routes, spawns: [start] }) {
  const candidates = routes.map(({ to }) => to);
  if (routes.length) candidates.push(routes[0].from);
  const rooms = candidates.filter((room) =>
    pointDistance(room, start) > ENTRANCE_EXCLUSION_RADIUS + PATROL_DISTANCE + MOB_CLEARANCE &&
    grid.distanceMove(room.x, room.y) >= MOB_CLEARANCE
  ).sort((a, b) => pointDistance(a, start) - pointDistance(b, start));
  const sites = [];
  while (sites.length < ARENA_ENEMY_COUNT && rooms.length) {
    // Start near the entrance, then fill the largest gaps between encounters.
    let next = 0;
    let bestSpacing = 0;
    if (sites.length) {
      for (const [index, room] of rooms.entries()) {
        const spacing = Math.min(...sites.map((site) => pointDistance(room, site)));
        if (spacing > bestSpacing) {
          next = index;
          bestSpacing = spacing;
        }
      }
    }
    const [room] = rooms.splice(next, 1);
    const patrolEnd = sites.length % 3 === 1 ? findPatrolEnd(grid, room) : null;
    sites.push({ ...room, patrolPoints: patrolEnd ? [patrolEnd, room] : [] });
  }
  return sites;
}

function findPatrolEnd(grid, room) {
  for (const [dx, dy] of [[PATROL_DISTANCE, 0], [0, PATROL_DISTANCE], [-PATROL_DISTANCE, 0], [0, -PATROL_DISTANCE]]) {
    const end = { x: room.x + dx, y: room.y + dy };
    if (sweepMaxFree(grid, room.x, room.y, end.x, end.y, MOB_CLEARANCE) === 1) return end;
  }
  return null;
}

function placeArenaChests({ grid, routes, spawns: [start] }, seed) {
  const leafEnds = new Map();
  for (const { from, to, points } of routes) {
    for (const [room, approach] of [[from, points[1]], [to, points.at(-2)]]) {
      const key = `${room.x},${room.y}`;
      // A room with more than one passage is no longer a dead end.
      leafEnds.set(key, leafEnds.has(key) ? null : { room, approach });
    }
  }

  const candidates = [...leafEnds.values()].filter((end) => end &&
    pointDistance(end.room, start) > 0 &&
    grid.distanceMove(end.room.x, end.room.y) >= CHEST_CLEARANCE
  );
  if (!candidates.length) return [];

  const random = mulberry32(seed ^ 0x9360C1);
  const { room, approach } = candidates[Math.floor(random() * candidates.length)];
  const distance = pointDistance(room, approach);
  const offset = distance > 0 ? CHEST_DISTANCE / distance : 0;
  const back = {
    x: room.x + (room.x - approach.x) * offset,
    y: room.y + (room.y - approach.y) * offset,
  };
  const clear = sweepMaxFree(grid, room.x, room.y, back.x, back.y, CHEST_CLEARANCE) === 1;
  return [clear ? back : room];
}

// Shared by the browser and authoritative rooms. Keep the field dimensions
// close to the original grid while doubling the world scale.
export function generateArenaCave(seed) {
  const cave = generateCave({
    seed, width: 8000, height: 8000, cellSize: 8,
    chamberTarget: 42, passageLength: [350, 640],
    spawnCount: 8, spawnSpacing: 650,
  });
  const start = cave.spawns[0];
  const hearth = findOpen(cave.grid, start.x, start.y - 76, 24, 38) ??
    findOpen(cave.grid, start.x, start.y + 76, 24, 38);
  const campfires = hearth ? [hearth] : [];
  const bank = findReachableNear(cave.grid, start, [66, 54, 42, 30],
    (point) => !hearth || pointDistance(point, hearth) >= 48) ?? start;
  const portal = findReachableNear(cave.grid, start, [76, 64, 52, 40, 28],
    (point) => pointDistance(point, bank) >= 58 && (!hearth || pointDistance(point, hearth) >= 48)) ??
    findReachableNear(cave.grid, start, [42, 30, 18], (point) => pointDistance(point, bank) >= 24) ?? start;
  const chestSites = placeArenaChests(cave, seed);
  return {
    ...cave,
    campfires,
    camp: { bank, portal },
    encounterSites: placeArenaEncounters(cave),
    chestSites,
    oreSites: placeArenaOre(cave, [...campfires, bank, portal, ...chestSites]),
  };
}
