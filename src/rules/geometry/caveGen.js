// rules/geometry/caveGen.js
// Procedural cave generation — pure vector SDF.
// Emits circles + capsules directly into a kernel. No grid. No rasterization.
// The SDF primitives ARE the geometry — perfect at any zoom level.

import { createKernel } from './kernel.js';
import { bakeGrid } from './caveGrid.js';

// ── Perlin noise (2D, self-contained) ──────────────────────────

function mulberry32(seed) {
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
    const tmp = base[i]; base[i] = base[j]; base[j] = tmp;
  }
  for (let i = 0; i < 256; i++) { p[i] = base[i]; p[i + 256] = base[i]; }
  return p;
}

const GRAD2 = [[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];

function createPerlin2D(seed) {
  const rng = mulberry32(seed);
  const perm = buildPermutation(rng);
  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function lerp(a, b, t) { return a + t * (b - a); }
  return function noise(x, y) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x), yf = y - Math.floor(y);
    const u = fade(xf), v = fade(yf);
    const aa = perm[perm[X] + Y], ab = perm[perm[X] + Y + 1];
    const ba = perm[perm[X + 1] + Y], bb = perm[perm[X + 1] + Y + 1];
    function dot(hash, fx, fy) { const g = GRAD2[hash & 7]; return g[0] * fx + g[1] * fy; }
    return lerp(
      lerp(dot(aa, xf, yf),     dot(ba, xf - 1, yf),     u),
      lerp(dot(ab, xf, yf - 1), dot(bb, xf - 1, yf - 1), u),
      v
    );
  };
}

function fbm(noise, x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
  let amp = 1, freq = 1, sum = 0, max = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(x * freq, y * freq);
    max += amp;
    freq *= lacunarity;
    amp *= gain;
  }
  return sum / max;
}

// ── Cave profiles ──────────────────────────────────────────────

export const CaveProfile = Object.freeze({
  // Rooms feel BIG when zoomed in. Brush radii are world-units.
  CAVERNS: {
    threshold: -0.08,    // liberal carving → large open areas
    brushMin:  18,       // smallest carve
    brushMax:  52,       // chambers
    octaves: 4,
    scale: 0.012,        // higher freq → tighter features
    passageWidth: 20,    // min corridor width (for connector capsules)
  },
  TUNNELS: {
    threshold: 0.05,
    brushMin:  20,
    brushMax:  50,
    octaves: 5,
    scale: 0.015,
    passageWidth: 22,
  },
  GROTTOS: {
    threshold: -0.15,
    brushMin:  60,
    brushMax: 160,
    octaves: 3,
    scale: 0.004,
    passageWidth: 36,
  },
  WARRENS: {
    threshold: 0.12,
    brushMin:  14,
    brushMax:  32,
    octaves: 6,
    scale: 0.022,
    passageWidth: 18,
  },
});

// ── Vector cave generator ──────────────────────────────────────

/**
 * Sample Perlin noise and emit SDF circles where open.
 * Returns array of { x, y, r } for room centres (used by connector pass).
 */
function carveRooms(kernel, noise, rng, width, height, profile) {
  const { threshold, brushMin, brushMax, octaves, scale } = profile;
  const margin = brushMax + 20;
  const step = brushMin * 0.8;  // overlap ensures smooth walls
  const rooms = [];

  for (let y = margin; y < height - margin; y += step) {
    for (let x = margin; x < width - margin; x += step) {
      const n = fbm(noise, x * scale, y * scale, octaves);

      // Edge fade — close off near world boundaries
      const edgeDist = Math.min(x - margin, width - margin - x,
                                y - margin, height - margin - y);
      const edgeFade = Math.min(1, edgeDist / (brushMax * 2));

      if (n * edgeFade > threshold) {
        const t = (n * edgeFade - threshold) / (1 - threshold);
        const r = brushMin + (brushMax - brushMin) * Math.min(1, t);
        // Jitter for organic edges
        const jx = (rng() - 0.5) * step * 0.5;
        const jy = (rng() - 0.5) * step * 0.5;
        const cx = x + jx, cy = y + jy;
        kernel.carveCircle(cx, cy, r, { affectsMove: true, affectsOccl: true });
        // Track larger carves as room anchors
        if (r > brushMin + (brushMax - brushMin) * 0.3) {
          rooms.push({ x: cx, y: cy, r });
        }
      }
    }
  }
  return rooms;
}

/**
 * Connect rooms with capsule corridors so the cave is fully traversable.
 * Uses a greedy nearest-neighbour walk through room centres, then
 * connects any orphaned clusters.
 */
function connectRooms(kernel, rooms, profile) {
  if (rooms.length < 2) return;

  const pw = profile.passageWidth;
  const connected = new Set([0]);
  const unconnected = new Set(rooms.map((_, i) => i));
  unconnected.delete(0);

  // Greedy nearest-neighbour from room 0
  let current = 0;
  while (unconnected.size > 0) {
    let bestDist = Infinity, bestIdx = -1;
    for (const idx of unconnected) {
      const dx = rooms[idx].x - rooms[current].x;
      const dy = rooms[idx].y - rooms[current].y;
      const d = dx * dx + dy * dy;
      if (d < bestDist) { bestDist = d; bestIdx = idx; }
    }
    if (bestIdx === -1) break;

    // Carve a capsule corridor between current and bestIdx
    kernel.carveCapsule(
      rooms[current].x, rooms[current].y,
      rooms[bestIdx].x, rooms[bestIdx].y,
      pw, { affectsMove: true, affectsOccl: true }
    );

    connected.add(bestIdx);
    unconnected.delete(bestIdx);
    current = bestIdx;
  }
}

/**
 * Find spawn points in the widest open areas.
 * Checks actual SDF clearance — no grid approximation.
 */
function findSpawns(kernel, rooms, count, minSpacing) {
  // Sort rooms by radius (biggest = most open)
  const sorted = rooms.slice().sort((a, b) => b.r - a.r);
  const spawns = [];

  for (const room of sorted) {
    if (spawns.length >= count) break;
    // Verify real SDF clearance
    if (kernel.distanceMove(room.x, room.y) < 30) continue;
    // Enforce spacing
    let ok = true;
    for (const s of spawns) {
      if (Math.hypot(s.x - room.x, s.y - room.y) < minSpacing) { ok = false; break; }
    }
    if (ok) spawns.push({ x: room.x, y: room.y });
  }
  return spawns;
}

// ── Main entry ─────────────────────────────────────────────────

/**
 * Generate a vector cave.
 *
 * @param {object}  opts
 * @param {number}  opts.seed
 * @param {number}  [opts.width=4000]     – world-units (bigger = more rooms at zoom)
 * @param {number}  [opts.height=4000]
 * @param {object}  [opts.profile=CaveProfile.CAVERNS]
 * @param {number}  [opts.spawnCount=4]
 * @param {number}  [opts.spawnSpacing=400]
 * @returns {{ kernel, bounds, rooms, spawns }}
 */
export function generateCave(opts) {
  const {
    seed         = 42,
    width        = 4000,
    height       = 4000,
    profile      = CaveProfile.CAVERNS,
    spawnCount   = 4,
    spawnSpacing = 400,
  } = opts;

  const noise  = createPerlin2D(seed);
  const rng    = mulberry32(seed ^ 0xCAFE);
  const kernel = createKernel();

  // 1. Carve rooms (circles from Perlin field)
  const rooms = carveRooms(kernel, noise, rng, width, height, profile);

  // 2. Connect rooms with capsule corridors
  connectRooms(kernel, rooms, profile);

  // 3. Find spawn points
  const spawns = findSpawns(kernel, rooms, spawnCount, spawnSpacing);

  // Fallback: spiral from centre
  if (spawns.length === 0) {
    const cx = width / 2, cy = height / 2;
    for (let r = 0; r < 600; r += 10) {
      for (let a = 0; a < Math.PI * 2; a += 0.3) {
        const sx = cx + Math.cos(a) * r, sy = cy + Math.sin(a) * r;
        if (kernel.distanceMove(sx, sy) >= 30) {
          spawns.push({ x: sx, y: sy });
          r = 999;
          break;
        }
      }
    }
    if (spawns.length === 0) spawns.push({ x: cx, y: cy });
  }

  // Bake SDF → grid for O(1) runtime collision queries
  const grid = bakeGrid(kernel, width, height);

  return {
    kernel,
    grid,
    bounds: { w: width, h: height },
    rooms,
    spawns,
  };
}

export { createPerlin2D, fbm, mulberry32 };
