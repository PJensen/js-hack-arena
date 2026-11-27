import { PLAYER_COLLIDER_RADIUS } from '../playerDimensions.js';

export { PLAYER_COLLIDER_RADIUS };
export const HAND_CARVED_DUNGEON_SCHEMA = 'hack-arena.hand-carved-dungeon';
export const HAND_CARVED_DUNGEON_VERSION = 1;
export const HAND_CARVED_DUNGEON_LIMITS = Object.freeze({
  minSize: 1000,
  maxSize: 8000,
  maxStrokes: 1000,
  maxRadius: 1200,
  maxPointsPerStroke: 2000,
  maxPathPoints: 10000,
});

const validId = (value) => typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{0,47}$/.test(value);
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const MAX_ROUGH_OFFSET = 96;

export function normalizeHandCarvedDungeon(value, expectedId = null) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a dungeon layout object');
  if (value.schema !== HAND_CARVED_DUNGEON_SCHEMA || value.version !== HAND_CARVED_DUNGEON_VERSION) {
    throw new Error('Unsupported dungeon layout schema or version');
  }
  if (!validId(value.id) || (expectedId && value.id !== expectedId)) throw new Error('Invalid dungeon ID');
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 80) throw new Error('Dungeon name must be 1–80 characters');
  if (!Number.isSafeInteger(value.width) || value.width < HAND_CARVED_DUNGEON_LIMITS.minSize || value.width > HAND_CARVED_DUNGEON_LIMITS.maxSize ||
      !Number.isSafeInteger(value.height) || value.height < HAND_CARVED_DUNGEON_LIMITS.minSize || value.height > HAND_CARVED_DUNGEON_LIMITS.maxSize) {
    throw new Error('Dungeon dimensions must be between 1000 and 8000 world units');
  }
  if (!Array.isArray(value.strokes) || value.strokes.length > HAND_CARVED_DUNGEON_LIMITS.maxStrokes) throw new Error('Invalid dungeon brush strokes');
  const ids = new Set();
  let pathPointCount = 0;
  const strokes = value.strokes.map((stroke) => {
    if (!stroke || typeof stroke !== 'object' || !validId(stroke.id) || ids.has(stroke.id)) throw new Error('Every brush stroke needs a unique ID');
    ids.add(stroke.id);
    if (stroke.erase !== undefined && typeof stroke.erase !== 'boolean') throw new Error('Invalid brush operation');
    const operation = stroke.erase ? { erase: true } : {};
    if (stroke.type === 'circle') {
      if (![stroke.cx, stroke.cy, stroke.r].every(finite) || stroke.r < 8 || stroke.r > HAND_CARVED_DUNGEON_LIMITS.maxRadius) throw new Error('Invalid circle brush');
      return { ...operation, id: stroke.id, type: 'circle', cx: within(stroke.cx, 0, value.width), cy: within(stroke.cy, 0, value.height), r: stroke.r };
    }
    if (stroke.type === 'corridor') {
      if (![stroke.ax, stroke.ay, stroke.bx, stroke.by, stroke.r].every(finite) || stroke.r < 8 || stroke.r > HAND_CARVED_DUNGEON_LIMITS.maxRadius) throw new Error('Invalid corridor brush');
      return { ...operation, id: stroke.id, type: 'corridor', ax: within(stroke.ax, 0, value.width), ay: within(stroke.ay, 0, value.height), bx: within(stroke.bx, 0, value.width), by: within(stroke.by, 0, value.height), r: stroke.r };
    }
    if (stroke.type === 'rect' || stroke.type === 'ellipse') {
      if (![stroke.x, stroke.y, stroke.w, stroke.h].every(finite) || stroke.w < 8 || stroke.h < 8 || stroke.w > value.width || stroke.h > value.height) throw new Error(`Invalid ${stroke.type} brush`);
      const x = within(stroke.x, 0, value.width), y = within(stroke.y, 0, value.height);
      return { ...operation, id: stroke.id, type: stroke.type, x: Math.min(x, value.width - stroke.w), y: Math.min(y, value.height - stroke.h), w: stroke.w, h: stroke.h };
    }
    if (stroke.type === 'path') {
      if (!Array.isArray(stroke.points) || stroke.points.length < 2 || stroke.points.length > HAND_CARVED_DUNGEON_LIMITS.maxPointsPerStroke || !finite(stroke.r) || stroke.r < 8 || stroke.r > HAND_CARVED_DUNGEON_LIMITS.maxRadius) throw new Error('Invalid freehand brush');
      pathPointCount += stroke.points.length;
      if (pathPointCount > HAND_CARVED_DUNGEON_LIMITS.maxPathPoints) throw new Error('Too many freehand points');
      return {
        ...operation,
        id: stroke.id,
        type: 'path',
        r: stroke.r,
        points: stroke.points.map((point) => {
          if (!point || !finite(point.x) || !finite(point.y)) throw new Error('Invalid freehand point');
          return { x: within(point.x, 0, value.width), y: within(point.y, 0, value.height) };
        }),
      };
    }
    throw new Error('Unknown dungeon brush type');
  });
  const roughness = value.roughness ?? 0;
  if (!Number.isInteger(roughness) || roughness < 0 || roughness > 100) throw new Error('Roughness must be 0–100');
  const result = {
    schema: HAND_CARVED_DUNGEON_SCHEMA,
    version: HAND_CARVED_DUNGEON_VERSION,
    id: value.id,
    name: value.name.trim(),
    width: value.width,
    height: value.height,
    cellSize: 8,
    strokes,
  };
  if (roughness) result.roughness = roughness;
  if (value.start != null) {
    const { x, y } = value.start;
    if (!finite(x) || !finite(y) || !handCarvedPlayerFits(result, x, y)) {
      throw new Error('The player start needs enough room on open floor');
    }
    result.start = { x, y };
  }
  return result;
}

export function handCarvedStrokeClearance(stroke, x, y) {
  if (stroke.type === 'circle') return stroke.r - Math.hypot(x - stroke.cx, y - stroke.cy);
  if (stroke.type === 'corridor') return stroke.r - distanceToSegment(x, y, stroke.ax, stroke.ay, stroke.bx, stroke.by);
  if (stroke.type === 'path') {
    let distance = Infinity;
    for (let index = 1; index < stroke.points.length; index++) {
      const from = stroke.points[index - 1], to = stroke.points[index];
      distance = Math.min(distance, distanceToSegment(x, y, from.x, from.y, to.x, to.y));
    }
    return stroke.r - distance;
  }
  if (stroke.type === 'ellipse') {
    const rx = stroke.w / 2, ry = stroke.h / 2;
    const dx = x - stroke.x - rx, dy = y - stroke.y - ry;
    const k0 = Math.hypot(dx / rx, dy / ry);
    if (k0 < 1e-8) return Math.min(rx, ry);
    const k1 = Math.hypot(dx / (rx * rx), dy / (ry * ry));
    return k0 * (1 - k0) / k1;
  }
  const qx = Math.abs(x - stroke.x - stroke.w / 2) - stroke.w / 2;
  const qy = Math.abs(y - stroke.y - stroke.h / 2) - stroke.h / 2;
  return -(Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0));
}

// Fixed world coordinates keep the same wall profile after zoom, reload, or undo.
function wallNoise(x, y) {
  return 0.72 * noise(x / 320, y / 320) + 0.28 * noise(x / 105 + 41, y / 105 + 13);
}

function noise(x, y) {
  const i = Math.floor(x), j = Math.floor(y);
  const fade = (t) => t * t * (3 - 2 * t);
  const u = fade(x - i), v = fade(y - j);
  const top = mix(hash(i, j), hash(i + 1, j), u);
  const bottom = mix(hash(i, j + 1), hash(i + 1, j + 1), u);
  return mix(top, bottom, v);
}

function hash(x, y) {
  const n = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  const mixed = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((mixed ^ (mixed >>> 16)) >>> 0) / 2147483648 - 1;
}

function mix(a, b, t) { return a + (b - a) * t; }

function wallClearance(layout, x, y, base, amplitude) {
  const boundary = Math.min(x, y, layout.width - x, layout.height - y);
  if (!amplitude) return Math.min(boundary, base);
  // Divide by a bound on the noise slope so clearance stays conservative.
  return Math.min(boundary, (base + amplitude * wallNoise(x, y)) / (1 + amplitude * 0.022));
}

export function handCarvedPlayerFits(layout, x, y) {
  let base = -120;
  for (const stroke of layout.strokes) {
    const clearance = handCarvedStrokeClearance(stroke, x, y);
    base = stroke.erase ? Math.min(base, -clearance) : Math.max(base, clearance);
  }
  const amplitude = (layout.roughness ?? 0) * MAX_ROUGH_OFFSET / 100;
  return wallClearance(layout, x, y, base, amplitude) >= PLAYER_COLLIDER_RADIUS;
}

export function bakeHandCarvedGrid(layout, cellSize = layout.cellSize ?? 8) {
  if (!Number.isSafeInteger(cellSize) || cellSize < 4 || cellSize > 64) throw new Error('Invalid dungeon grid cell size');
  const cols = Math.ceil(layout.width / cellSize) + 1;
  const rows = Math.ceil(layout.height / cellSize) + 1;
  const moveGrid = new Float32Array(cols * rows);
  const densityGrid = new Float32Array(cols * rows);
  const signedClearance = new Float32Array(cols * rows);
  signedClearance.fill(-120);
  const amplitude = (layout.roughness ?? 0) * MAX_ROUGH_OFFSET / 100;
  let maxClearance = 0;
  for (const stroke of layout.strokes) {
    const padding = stroke.erase ? Math.max(maxClearance, 120) : amplitude;
    const bounds = strokeBounds(stroke, cellSize, layout.width, layout.height, padding);
    if (!stroke.erase) maxClearance = Math.max(maxClearance, stroke.r ?? Math.min(stroke.w, stroke.h) / 2);
    for (let gy = bounds.y0; gy <= bounds.y1; gy++) {
      const y = gy * cellSize;
      for (let gx = bounds.x0; gx <= bounds.x1; gx++) {
        const x = gx * cellSize;
        const index = gy * cols + gx;
        const clearance = handCarvedStrokeClearance(stroke, x, y);
        signedClearance[index] = stroke.erase
          ? Math.min(signedClearance[index], -clearance)
          : Math.max(signedClearance[index], clearance);
      }
    }
  }
  for (let gy = 0; gy < rows; gy++) {
    const y = gy * cellSize;
    for (let gx = 0; gx < cols; gx++) {
      const x = gx * cellSize, index = gy * cols + gx;
      const signed = wallClearance(layout, x, y, signedClearance[index], amplitude);
      moveGrid[index] = Math.max(0, signed);
      densityGrid[index] = signed / 90;
    }
  }
  const inverseCell = 1 / cellSize;
  function distanceMove(x, y) {
    const fx = x * inverseCell, fy = y * inverseCell;
    const gx = Math.floor(fx), gy = Math.floor(fy);
    if (gx < 0 || gy < 0 || gx >= cols - 1 || gy >= rows - 1) return 0;
    const tx = fx - gx, ty = fy - gy, index = gy * cols + gx;
    const top = moveGrid[index] * (1 - tx) + moveGrid[index + 1] * tx;
    const bottom = moveGrid[index + cols] * (1 - tx) + moveGrid[index + cols + 1] * tx;
    return top * (1 - ty) + bottom * ty;
  }
  return { width: layout.width, height: layout.height, cellSize, cols, rows, moveGrid, densityGrid, distanceMove };
}

function strokeBounds(stroke, cellSize, width, height, padding) {
  let left, top, right, bottom;
  if (stroke.type === 'circle') {
    left = stroke.cx - stroke.r; right = stroke.cx + stroke.r;
    top = stroke.cy - stroke.r; bottom = stroke.cy + stroke.r;
  } else if (stroke.type === 'corridor') {
    left = Math.min(stroke.ax, stroke.bx) - stroke.r; right = Math.max(stroke.ax, stroke.bx) + stroke.r;
    top = Math.min(stroke.ay, stroke.by) - stroke.r; bottom = Math.max(stroke.ay, stroke.by) + stroke.r;
  } else if (stroke.type === 'rect' || stroke.type === 'ellipse') {
    left = stroke.x; right = stroke.x + stroke.w;
    top = stroke.y; bottom = stroke.y + stroke.h;
  } else {
    left = Math.min(...stroke.points.map(({ x }) => x)) - stroke.r;
    right = Math.max(...stroke.points.map(({ x }) => x)) + stroke.r;
    top = Math.min(...stroke.points.map(({ y }) => y)) - stroke.r;
    bottom = Math.max(...stroke.points.map(({ y }) => y)) + stroke.r;
  }
  return {
    x0: Math.max(0, Math.floor((left - padding) / cellSize)),
    y0: Math.max(0, Math.floor((top - padding) / cellSize)),
    x1: Math.min(Math.ceil(width / cellSize), Math.ceil((right + padding) / cellSize)),
    y1: Math.min(Math.ceil(height / cellSize), Math.ceil((bottom + padding) / cellSize)),
  };
}

function distanceToSegment(x, y, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSquared)) : 0;
  return Math.hypot(x - (ax + dx * t), y - (ay + dy * t));
}

function within(value, min, max) { return Math.max(min, Math.min(max, value)); }
