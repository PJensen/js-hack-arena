// display/passes/boltFx.js
// Lightning bolt visual FX — jagged multi-layer line, radial pulse, fade.
// Ported from JSHack's boltFxController.

/**
 * Generate a jagged line between two points.
 * @param {number} ax,ay — start
 * @param {number} bx,by — end
 * @param {number} segs — number of segments (more = more jagged)
 * @param {number} amp — jitter amplitude in world units
 * @returns {Array<{x,y}>}
 */
function jitterLine(ax, ay, bx, by, segs = 11, amp = 4) {
  const pts = [{ x: ax, y: ay }];
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;  // perpendicular

  for (let i = 1; i < segs; i++) {
    const t = i / segs;
    const jitter = (Math.random() * 2 - 1) * amp;
    pts.push({
      x: ax + dx * t + nx * jitter,
      y: ay + dy * t + ny * jitter,
    });
  }
  pts.push({ x: bx, y: by });
  return pts;
}

/**
 * Create a bolt FX renderer.
 * Call add() to queue a bolt, render() each frame to draw + age them.
 */
export function createBoltFx() {
  const bolts = [];   // { pts, age, maxAge, chainIndex }
  const pulses = [];  // { x, y, age, maxAge }

  /**
   * Add a lightning bolt between two world-space points.
   * @param {number} ax,ay — start
   * @param {number} bx,by — end
   * @param {number} [chainIndex=0] — for chained bolts (dims later hops)
   */
  function add(ax, ay, bx, by, chainIndex = 0) {
    bolts.push({
      pts: jitterLine(ax, ay, bx, by, 11, 5),
      age: 0,
      maxAge: 0.15,
      chainIndex,
    });
    // Impact pulse at target
    pulses.push({ x: bx, y: by, age: 0, maxAge: 0.2 });
  }

  /**
   * Render all active bolts. Call each frame with camera transform applied.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} dt — frame delta in seconds
   */
  function render(ctx, dt) {
    // Age + cull
    for (let i = bolts.length - 1; i >= 0; i--) {
      bolts[i].age += dt;
      if (bolts[i].age >= bolts[i].maxAge) bolts.splice(i, 1);
    }
    for (let i = pulses.length - 1; i >= 0; i--) {
      pulses[i].age += dt;
      if (pulses[i].age >= pulses[i].maxAge) pulses.splice(i, 1);
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // Draw bolts — three layers (outer glow, mid, core)
    const layers = [
      { r: 120, g: 200, b: 255, aScale: 0.18, width: 6 },
      { r: 160, g: 220, b: 255, aScale: 0.35, width: 3 },
      { r: 230, g: 255, b: 255, aScale: 0.9,  width: 1.2 },
    ];

    for (const bolt of bolts) {
      const alpha = 1 - bolt.age / bolt.maxAge;
      const chainDim = Math.pow(0.7, bolt.chainIndex);

      for (const layer of layers) {
        const a = alpha * layer.aScale * chainDim;
        ctx.strokeStyle = `rgba(${layer.r},${layer.g},${layer.b},${a.toFixed(3)})`;
        ctx.lineWidth = layer.width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(bolt.pts[0].x, bolt.pts[0].y);
        for (let i = 1; i < bolt.pts.length; i++) {
          ctx.lineTo(bolt.pts[i].x, bolt.pts[i].y);
        }
        ctx.stroke();
      }
    }

    // Draw impact pulses
    for (const p of pulses) {
      const a = 1 - p.age / p.maxAge;
      // Outer glow
      ctx.beginPath();
      ctx.arc(p.x, p.y, 20, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(180,240,255,${(0.18 * a).toFixed(3)})`;
      ctx.fill();
      // Inner bright
      ctx.beginPath();
      ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,220,${(0.25 * a).toFixed(3)})`;
      ctx.fill();
    }

    ctx.restore();
  }

  return { add, render, get active() { return bolts.length + pulses.length; } };
}
