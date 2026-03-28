// display/passes/cavePass.js
// Draws cave SDF primitives as vector geometry.
// Each carve is a circle or capsule — smooth at any zoom.

const TAU = Math.PI * 2;

// Color palette — layered for depth
const FLOOR      = '#142030';
const FLOOR_EDGE = '#0f1a28';  // darker fringe drawn slightly larger

/**
 * Draw a single SDF carve primitive.
 */
function drawCarve(ctx, g) {
  switch (g.type) {
    case 'circle':
      ctx.beginPath();
      ctx.arc(g.cx, g.cy, g.r, 0, TAU);
      ctx.fill();
      break;

    case 'capsule':
    case 'rectslot': {
      const dx = g.bx - g.ax, dy = g.by - g.ay;
      const L = Math.hypot(dx, dy) || 1;
      const nx = -dy / L, ny = dx / L;
      const r = g.r;
      ctx.beginPath();
      ctx.moveTo(g.ax + nx * r, g.ay + ny * r);
      ctx.lineTo(g.bx + nx * r, g.by + ny * r);
      ctx.arc(g.bx, g.by, r, Math.atan2(ny, nx), Math.atan2(-ny, -nx));
      ctx.lineTo(g.ax - nx * r, g.ay - ny * r);
      ctx.arc(g.ax, g.ay, r, Math.atan2(-ny, -nx), Math.atan2(ny, nx));
      ctx.closePath();
      ctx.fill();
      break;
    }

    case 'square': {
      const cx = (g.ax + g.bx) / 2, cy = (g.ay + g.by) / 2;
      const L = Math.hypot(g.bx - g.ax, g.by - g.ay);
      const hx = L / 2, hy = g.halfW;
      const s = Math.sin(g.rot), c = Math.cos(g.rot);
      const pts = [[-hx,-hy],[hx,-hy],[hx,hy],[-hx,hy]]
        .map(([x,y]) => [c*x - s*y + cx, s*x + c*y + cy]);
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < 4; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
      ctx.fill();
      break;
    }
  }
}

/**
 * Draw a carve with inflated radius (for edge fringe effect).
 */
function drawCarveInflated(ctx, g, inflate) {
  switch (g.type) {
    case 'circle':
      ctx.beginPath();
      ctx.arc(g.cx, g.cy, g.r + inflate, 0, TAU);
      ctx.fill();
      break;

    case 'capsule':
    case 'rectslot': {
      const dx = g.bx - g.ax, dy = g.by - g.ay;
      const L = Math.hypot(dx, dy) || 1;
      const nx = -dy / L, ny = dx / L;
      const r = g.r + inflate;
      ctx.beginPath();
      ctx.moveTo(g.ax + nx * r, g.ay + ny * r);
      ctx.lineTo(g.bx + nx * r, g.by + ny * r);
      ctx.arc(g.bx, g.by, r, Math.atan2(ny, nx), Math.atan2(-ny, -nx));
      ctx.lineTo(g.ax - nx * r, g.ay - ny * r);
      ctx.arc(g.ax, g.ay, r, Math.atan2(-ny, -nx), Math.atan2(ny, nx));
      ctx.closePath();
      ctx.fill();
      break;
    }

    case 'square': {
      // Inflate by expanding half-extents
      const cx = (g.ax + g.bx) / 2, cy = (g.ay + g.by) / 2;
      const L = Math.hypot(g.bx - g.ax, g.by - g.ay);
      const hx = L / 2 + inflate, hy = g.halfW + inflate;
      const s = Math.sin(g.rot), c = Math.cos(g.rot);
      const pts = [[-hx,-hy],[hx,-hy],[hx,hy],[-hx,hy]]
        .map(([x,y]) => [c*x - s*y + cx, s*x + c*y + cy]);
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < 4; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
      ctx.fill();
      break;
    }
  }
}

/**
 * Render cave geometry into the given context.
 * Call this each frame after applyCamera().
 *
 * Two-pass: edge fringe first (inflated, darker), then core floor.
 * Both are vector — perfectly smooth at any zoom.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} kernel – from createKernel / generateCave
 */
export function drawCave(ctx, kernel) {
  const carves = kernel.carves;

  // Pass 1: edge fringe (slightly larger, darker)
  ctx.fillStyle = FLOOR_EDGE;
  for (let i = 0; i < carves.length; i++) {
    drawCarveInflated(ctx, carves[i], 4);
  }

  // Pass 2: core floor
  ctx.fillStyle = FLOOR;
  for (let i = 0; i < carves.length; i++) {
    drawCarve(ctx, carves[i]);
  }
}

/**
 * Pre-bake cave to offscreen canvas for static geometry.
 * Use this if the cave doesn't change and you want one drawImage() per frame.
 *
 * @param {{ kernel, bounds }} caveData
 * @returns {{ canvas, width, height }}
 */
export function bakeCavePass(caveData) {
  const { kernel, bounds } = caveData;
  const w = bounds.w, h = bounds.h;

  const offscreen = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(w, h)
    : (() => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; })();

  const octx = offscreen.getContext('2d');
  octx.fillStyle = '#0b0f12';
  octx.fillRect(0, 0, w, h);

  drawCave(octx, kernel);

  return { canvas: offscreen, width: w, height: h };
}
