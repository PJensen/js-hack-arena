// rules/geometry/caveGen.js
// Procedural cave generation — pure Perlin SDF baked to a grid.
// The noise field IS the geometry. No carve primitives.

// ── Perlin noise (2D, self-contained) ──────────────────────────

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
    const tmp = base[i]; base[i] = base[j]; base[j] = tmp;
  }
  for (let i = 0; i < 256; i++) { p[i] = base[i]; p[i + 256] = base[i]; }
  return p;
}

const GRAD2 = [[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];

export function createPerlin2D(seed) {
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

// ── Cave profiles ──────────────────────────────────────────────

export const CaveProfile = Object.freeze({
  CAVERNS: {
    threshold: -0.08,
    octaves: 4,
    scale: 0.012,
  },
  TUNNELS: {
    threshold: 0.05,
    octaves: 5,
    scale: 0.015,
  },
  GROTTOS: {
    threshold: -0.15,
    octaves: 3,
    scale: 0.004,
  },
  WARRENS: {
    threshold: 0.12,
    octaves: 6,
    scale: 0.022,
  },
});

// ── Grid bake (inline to avoid circular deps with caveGrid.js) ─

function bakeGrid(seed, width, height, profile, cellSize) {
  const noise = createPerlin2D(seed);
  const cols = Math.ceil(width / cellSize) + 1;
  const rows = Math.ceil(height / cellSize) + 1;
  const total = cols * rows;
  const moveGrid = new Float32Array(total);

  const { threshold, octaves, scale } = profile;
  const margin = 60;

  for (let gy = 0; gy < rows; gy++) {
    const wy = gy * cellSize;
    const rowOff = gy * cols;
    for (let gx = 0; gx < cols; gx++) {
      const wx = gx * cellSize;
      const n = fbm(noise, wx * scale, wy * scale, octaves);

      // Edge fade — force solid near world boundaries
      const edgeDist = Math.min(wx - margin, width - margin - wx,
                                wy - margin, height - margin - wy);
      const edgeFade = Math.max(0, Math.min(1, edgeDist / (margin * 2)));

      const val = n * edgeFade - threshold;
      // Positive = open space; scale to world-unit clearance
      moveGrid[rowOff + gx] = val > 0 ? val * 80 : 0;
    }
  }

  const invCell = 1 / cellSize;

  function distanceMove(px, py) {
    const fx = px * invCell;
    const fy = py * invCell;
    const gx = Math.floor(fx);
    const gy = Math.floor(fy);
    if (gx < 0 || gy < 0 || gx >= cols - 1 || gy >= rows - 1) return 0;

    const tx = fx - gx;
    const ty = fy - gy;
    const i00 = gy * cols + gx;
    const i10 = i00 + 1;
    const i01 = i00 + cols;
    const i11 = i01 + 1;

    const top    = moveGrid[i00] * (1 - tx) + moveGrid[i10] * tx;
    const bottom = moveGrid[i01] * (1 - tx) + moveGrid[i11] * tx;
    return top * (1 - ty) + bottom * ty;
  }

  return { distanceMove, cellSize, cols, rows, width, height, moveGrid };
}

// ── Spawn finding ──────────────────────────────────────────────

function findSpawns(grid, width, height, count, minSpacing) {
  const spawns = [];
  const cx = width / 2, cy = height / 2;
  const candidates = [];
  const step = grid.cellSize * 4;

  for (let y = 100; y < height - 100; y += step) {
    for (let x = 100; x < width - 100; x += step) {
      const d = grid.distanceMove(x, y);
      if (d >= 20) {
        candidates.push({ x, y, clearance: d, dc: Math.hypot(x - cx, y - cy) });
      }
    }
  }

  candidates.sort((a, b) => b.clearance - a.clearance || a.dc - b.dc);

  for (const c of candidates) {
    if (spawns.length >= count) break;
    let ok = true;
    for (const s of spawns) {
      if (Math.hypot(s.x - c.x, s.y - c.y) < minSpacing) { ok = false; break; }
    }
    if (ok) spawns.push({ x: c.x, y: c.y });
  }

  if (spawns.length === 0) spawns.push({ x: cx, y: cy });
  return spawns;
}

// ── Main entry ─────────────────────────────────────────────────

/**
 * Generate a cave — pure Perlin noise baked to a grid.
 *
 * @param {object}  opts
 * @param {number}  opts.seed
 * @param {number}  [opts.width=4000]
 * @param {number}  [opts.height=4000]
 * @param {object}  [opts.profile=CaveProfile.CAVERNS]
 * @param {number}  [opts.cellSize=4]
 * @param {number}  [opts.spawnCount=4]
 * @param {number}  [opts.spawnSpacing=400]
 * @returns {{ grid, bounds, spawns }}
 */
export function generateCave(opts) {
  const {
    seed         = 42,
    width        = 4000,
    height       = 4000,
    profile      = CaveProfile.CAVERNS,
    cellSize     = 4,
    spawnCount   = 4,
    spawnSpacing = 400,
  } = opts;

  const grid = bakeGrid(seed, width, height, profile, cellSize);
  const spawns = findSpawns(grid, width, height, spawnCount, spawnSpacing);

  return {
    grid,
    bounds: { w: width, h: height },
    spawns,
  };
}
