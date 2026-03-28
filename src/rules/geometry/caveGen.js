// rules/geometry/caveGen.js
// Procedural cave generation using Perlin noise to guide SDF carving.
// Produces organic, continuous geometry — no tile grid.

import { createKernel } from './kernel.js';

// ── Perlin noise (2D, self-contained) ──────────────────────────

/** Mulberry32 PRNG — matches ecs-js/rng.js for seed compatibility. */
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

// ── Fractal Brownian Motion ────────────────────────────────────

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
  CAVERNS:  { threshold: -0.05, brushMin: 18, brushMax: 50, octaves: 4, scale: 0.012 },
  TUNNELS:  { threshold:  0.08, brushMin: 10, brushMax: 24, octaves: 5, scale: 0.025 },
  GROTTOS:  { threshold: -0.12, brushMin: 24, brushMax: 64, octaves: 3, scale: 0.008 },
  WARRENS:  { threshold:  0.15, brushMin:  8, brushMax: 16, octaves: 6, scale: 0.035 },
});

// ── Density field (the readable form of the cave) ──────────────

/**
 * Build a 2D Uint8 density grid.  255 = open, 0 = solid.
 * This is the source of truth for both the SDF kernel and the renderer.
 */
function buildDensityField(noise, width, height, profile, cellSize) {
  const { threshold, octaves, scale } = profile;
  const cols = Math.ceil(width / cellSize);
  const rows = Math.ceil(height / cellSize);
  const field = new Uint8Array(cols * rows);   // 0 = wall

  const margin = 3;  // cells of solid border

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      // Enforce solid border
      if (row < margin || row >= rows - margin || col < margin || col >= cols - margin) {
        field[row * cols + col] = 0;
        continue;
      }
      const wx = col * cellSize, wy = row * cellSize;
      const n = fbm(noise, wx * scale, wy * scale, octaves);

      // Edge fade — smoothly close off geometry near world edges
      const edgeDist = Math.min(col - margin, rows - margin - 1 - row,
                                row - margin, cols - margin - 1 - col);
      const edgeFade = Math.min(1, edgeDist / 8);  // 0..1 over 8 cells

      if (n * edgeFade > threshold) {
        // Map intensity to 128..255 for rendering variation
        const t = ((n * edgeFade) - threshold) / (1 - threshold);
        field[row * cols + col] = 128 + Math.floor(127 * Math.min(1, t));
      }
    }
  }
  return { field, cols, rows };
}

// ── Flood-fill connectivity ────────────────────────────────────

/**
 * Find the largest connected open region via flood fill.
 * Zeros out any open cells NOT in the largest region.
 * Returns the centre of the largest region (good spawn point).
 */
function enforceConnectivity(field, cols, rows) {
  const visited = new Uint8Array(cols * rows);
  const regions = [];  // [{ indices: [...], cx, cy }]

  for (let i = 0; i < field.length; i++) {
    if (field[i] === 0 || visited[i]) continue;
    // BFS
    const queue = [i];
    visited[i] = 1;
    const indices = [];
    let sx = 0, sy = 0;
    while (queue.length) {
      const idx = queue.shift();
      indices.push(idx);
      const c = idx % cols, r = (idx - c) / cols;
      sx += c; sy += r;
      for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nc = c + dc, nr = r + dr;
        if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
        const ni = nr * cols + nc;
        if (field[ni] > 0 && !visited[ni]) {
          visited[ni] = 1;
          queue.push(ni);
        }
      }
    }
    regions.push({
      indices,
      cx: (sx / indices.length) * 1,
      cy: (sy / indices.length) * 1,
    });
  }

  if (regions.length === 0) return { cx: cols / 2, cy: rows / 2 };

  // Keep only the largest region
  regions.sort((a, b) => b.indices.length - a.indices.length);
  const keep = new Set(regions[0].indices);
  for (let i = 0; i < field.length; i++) {
    if (field[i] > 0 && !keep.has(i)) field[i] = 0;
  }

  return {
    cx: regions[0].cx,
    cy: regions[0].cy,
    cellCount: regions[0].indices.length,
    regionsRemoved: regions.length - 1,
  };
}

// ── Carve from density field into SDF kernel ───────────────────

function carveFromField(kernel, field, cols, rows, cellSize, rng, profile) {
  const { brushMin, brushMax } = profile;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const v = field[row * cols + col];
      if (v === 0) continue;
      const t = (v - 128) / 127;   // 0..1
      const r = brushMin + (brushMax - brushMin) * Math.max(0, t);
      const jx = (rng() - 0.5) * cellSize * 0.4;
      const jy = (rng() - 0.5) * cellSize * 0.4;
      const wx = col * cellSize + cellSize / 2 + jx;
      const wy = row * cellSize + cellSize / 2 + jy;
      kernel.carveCircle(wx, wy, r, { affectsMove: true, affectsOccl: true });
    }
  }
}

// ── Find spawn points ──────────────────────────────────────────

/**
 * Find N spawn points spread across the cave.
 * Uses the density field to pick high-clearance open areas,
 * then enforces minimum distance between spawns.
 */
function findSpawnPoints(field, cols, rows, cellSize, kernel, count = 4, minSpacing = 200) {
  // Collect candidate cells sorted by density (highest clearance first)
  const candidates = [];
  for (let i = 0; i < field.length; i++) {
    if (field[i] >= 200) {  // only deep-interior cells
      const c = i % cols, r = (i - c) / cols;
      candidates.push({ x: c * cellSize + cellSize / 2, y: r * cellSize + cellSize / 2, v: field[i] });
    }
  }
  candidates.sort((a, b) => b.v - a.v);

  const spawns = [];
  for (const cand of candidates) {
    if (spawns.length >= count) break;
    // Verify actual SDF clearance
    if (kernel.distanceMove(cand.x, cand.y) < 20) continue;
    // Enforce spacing
    let tooClose = false;
    for (const s of spawns) {
      if (Math.hypot(s.x - cand.x, s.y - cand.y) < minSpacing) { tooClose = true; break; }
    }
    if (!tooClose) spawns.push({ x: cand.x, y: cand.y });
  }
  return spawns;
}

// ── Main generator ─────────────────────────────────────────────

/**
 * Generate a cave system.
 *
 * @param {object}  opts
 * @param {number}  opts.seed
 * @param {number}  [opts.width=2400]
 * @param {number}  [opts.height=2400]
 * @param {object}  [opts.profile=CaveProfile.CAVERNS]
 * @param {number}  [opts.cellSize=10]   – density grid resolution
 * @param {number}  [opts.spawnCount=4]
 * @returns {{ kernel, bounds, field, cols, rows, cellSize, spawns, connectivity }}
 */
export function generateCave(opts) {
  const {
    seed       = 42,
    width      = 2400,
    height     = 2400,
    profile    = CaveProfile.CAVERNS,
    cellSize   = 10,
    spawnCount = 4,
  } = opts;

  const noise  = createPerlin2D(seed);
  const rng    = mulberry32(seed ^ 0xCAFE);
  const kernel = createKernel();

  // 1. Build density field
  const { field, cols, rows } = buildDensityField(noise, width, height, profile, cellSize);

  // 2. Enforce single connected region
  const connectivity = enforceConnectivity(field, cols, rows);

  // 3. Carve SDF from surviving cells
  carveFromField(kernel, field, cols, rows, cellSize, rng, profile);

  // 4. Find spawn points
  const spawns = findSpawnPoints(field, cols, rows, cellSize, kernel, spawnCount);

  // Fallback spawn if none found
  if (spawns.length === 0) {
    const cx = connectivity.cx * cellSize, cy = connectivity.cy * cellSize;
    spawns.push({ x: cx, y: cy });
  }

  return {
    kernel,
    bounds: { w: width, h: height },
    field, cols, rows, cellSize,
    spawns,
    connectivity,
  };
}

export { createPerlin2D, fbm, mulberry32 };
