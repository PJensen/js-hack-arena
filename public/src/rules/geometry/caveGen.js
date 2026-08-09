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
    // Dual-layer: caverns (low freq) + tunnels (high freq)
    cavern:  { threshold: -0.12, octaves: 3, scale: 0.005 },  // big open rooms
    tunnel:  { threshold:  0.02, octaves: 5, scale: 0.018 },  // narrow winding paths
  },
  TUNNELS: {
    cavern:  { threshold: 0.05, octaves: 4, scale: 0.008 },
    tunnel:  { threshold: 0.06, octaves: 6, scale: 0.025 },
  },
  GROTTOS: {
    cavern:  { threshold: -0.20, octaves: 3, scale: 0.004 },
    tunnel:  { threshold: -0.05, octaves: 4, scale: 0.014 },
  },
  WARRENS: {
    cavern:  { threshold: 0.05, octaves: 4, scale: 0.012 },
    tunnel:  { threshold: 0.10, octaves: 6, scale: 0.030 },
  },
});

// ── Grid bake (inline to avoid circular deps with caveGrid.js) ─

function bakeGrid(seed, width, height, profile, cellSize) {
  // Two noise fields from different seeds for independence
  const noiseCavern = createPerlin2D(seed);
  const noiseTunnel = createPerlin2D(seed ^ 0x7F3A);

  const cols = Math.ceil(width / cellSize) + 1;
  const rows = Math.ceil(height / cellSize) + 1;
  const total = cols * rows;
  const moveGrid = new Float32Array(total);
  const densityGrid = new Float32Array(total);

  const cav = profile.cavern;
  const tun = profile.tunnel;
  const margin = 80;

  for (let gy = 0; gy < rows; gy++) {
    const wy = gy * cellSize;
    const rowOff = gy * cols;
    for (let gx = 0; gx < cols; gx++) {
      const wx = gx * cellSize;

      // Edge fade — force solid near world boundaries
      const edgeDist = Math.min(wx - margin, width - margin - wx,
                                wy - margin, height - margin - wy);
      const edgeFade = Math.max(0, Math.min(1, edgeDist / (margin * 2)));

      // Cavern layer: low freq, big open rooms
      const nc = fbm(noiseCavern, wx * cav.scale, wy * cav.scale, cav.octaves);
      const vc = nc * edgeFade - cav.threshold;

      // Tunnel layer: high freq, narrow winding paths
      const nt = fbm(noiseTunnel, wx * tun.scale, wy * tun.scale, tun.octaves);
      const vt = nt * edgeFade - tun.threshold;

      // Open if EITHER layer says so (max = union)
      const val = Math.max(vc, vt);
      densityGrid[rowOff + gx] = val;
      moveGrid[rowOff + gx] = val > 0 ? val * 200 : 0;
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

  return { distanceMove, cellSize, cols, rows, width, height, moveGrid, densityGrid };
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

// Join every remote spawn to the central chamber with a broad, gently curved
// route. Noise still authors the rooms; these routes guarantee the expanded
// dungeon remains traversable and give torch chains a dependable backbone.
function connectSpawns(grid, spawns, seed) {
  if (spawns.length < 2) return [];
  const routes = [];
  const hub = spawns[0];
  for (let index = 1; index < spawns.length; index++) {
    const destination = spawns[index];
    const dx = destination.x - hub.x;
    const dy = destination.y - hub.y;
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length;
    const ny = dx / length;
    const bend = Math.sin((seed + index * 8191) * 0.013) * Math.min(150, length * 0.12);
    const points = [];
    const steps = Math.max(2, Math.ceil(length / (grid.cellSize * 0.75)));
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      const curve = Math.sin(t * Math.PI) * bend;
      const x = hub.x + dx * t + nx * curve;
      const y = hub.y + dy * t + ny * curve;
      if (step % Math.max(1, Math.round(180 / grid.cellSize)) === 0 || step === steps) points.push({ x, y });
      carveOpenCell(grid, x, y, 30);
    }
    routes.push({ from: { ...hub }, to: { ...destination }, points });
  }
  return routes;
}

function carveOpenCell(grid, x, y, radius) {
  const gx = Math.round(x / grid.cellSize);
  const gy = Math.round(y / grid.cellSize);
  const cells = Math.ceil(radius / grid.cellSize);
  for (let oy = -cells; oy <= cells; oy++) {
    for (let ox = -cells; ox <= cells; ox++) {
      const distance = Math.hypot(ox, oy) * grid.cellSize;
      if (distance > radius) continue;
      const sx = gx + ox;
      const sy = gy + oy;
      if (sx <= 1 || sy <= 1 || sx >= grid.cols - 2 || sy >= grid.rows - 2) continue;
      const offset = sy * grid.cols + sx;
      const clearance = 25 + (radius - distance) * 0.35;
      grid.moveGrid[offset] = Math.max(grid.moveGrid[offset], clearance);
      grid.densityGrid[offset] = Math.max(grid.densityGrid[offset], clearance / 200);
    }
  }
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
 * @returns {{ grid, bounds, spawns, routes }}
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
  const routes = connectSpawns(grid, spawns, seed);

  return {
    grid,
    bounds: { w: width, h: height },
    spawns,
    routes,
  };
}
