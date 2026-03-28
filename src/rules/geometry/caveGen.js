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
  // Fisher-Yates shuffle
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
  return sum / max;   // normalised ≈ [-1, 1]
}

// ── Cave profiles ──────────────────────────────────────────────

export const CaveProfile = Object.freeze({
  CAVERNS:  { threshold: -0.05, brushMin: 18, brushMax: 50, octaves: 4, scale: 0.012 },
  TUNNELS:  { threshold:  0.08, brushMin: 10, brushMax: 24, octaves: 5, scale: 0.025 },
  GROTTOS:  { threshold: -0.12, brushMin: 24, brushMax: 64, octaves: 3, scale: 0.008 },
  WARRENS:  { threshold:  0.15, brushMin:  8, brushMax: 16, octaves: 6, scale: 0.035 },
});

// ── Generator ──────────────────────────────────────────────────

/**
 * Generate a cave system by sampling Perlin noise and carving circles
 * wherever the noise exceeds a threshold.
 *
 * @param {object}  opts
 * @param {number}  opts.seed       – deterministic seed
 * @param {number}  opts.width      – world width in pixels
 * @param {number}  opts.height     – world height in pixels
 * @param {object}  [opts.profile]  – a CaveProfile entry (default CAVERNS)
 * @param {number}  [opts.step]     – sampling grid spacing (default 12)
 * @returns {{ kernel, bounds: {w,h} }}
 */
export function generateCave(opts) {
  const {
    seed     = 42,
    width    = 2000,
    height   = 2000,
    profile  = CaveProfile.CAVERNS,
    step     = 12,
  } = opts;

  const noise = createPerlin2D(seed);
  const kernel = createKernel();
  const rng = mulberry32(seed ^ 0xCAFE);

  const { threshold, brushMin, brushMax, octaves, scale } = profile;

  for (let y = brushMax; y < height - brushMax; y += step) {
    for (let x = brushMax; x < width - brushMax; x += step) {
      const n = fbm(noise, x * scale, y * scale, octaves);
      if (n > threshold) {
        // Brush radius varies with noise intensity for organic edges
        const t = (n - threshold) / (1 - threshold);  // 0..1
        const r = brushMin + (brushMax - brushMin) * t;
        // Slight jitter keeps edges from looking grid-aligned
        const jx = (rng() - 0.5) * step * 0.6;
        const jy = (rng() - 0.5) * step * 0.6;
        kernel.carveCircle(x + jx, y + jy, r, { affectsMove: true, affectsOccl: true });
      }
    }
  }

  return { kernel, bounds: { w: width, h: height } };
}

export { createPerlin2D, fbm };
