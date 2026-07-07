// display/passes/floatText.js
// Floating damage numbers — rise and fade after damage events.

export function createFloatTextPass() {
  const texts = [];  // { x, y, text, color, age, maxAge, vy }
  let lastTime = 0;

  function add({ x, y, text, color = '#ff4444', maxAge = 0.8 }) {
    texts.push({
      x: x + (Math.random() - 0.5) * 10,
      y: y - 10,
      text: String(text),
      color,
      age: 0,
      maxAge,
      vy: -60,  // rise speed in world units/sec
    });
  }

  function step(dt) {
    for (let i = texts.length - 1; i >= 0; i--) {
      const t = texts[i];
      t.age += dt;
      t.y += t.vy * dt;
      t.vy *= 0.95;  // decelerate
      if (t.age >= t.maxAge) {
        texts.splice(i, 1);
      }
    }
  }

  /** Auto-track time using performance.now so callers don't need dt. */
  function stepAuto() {
    const now = performance.now() * 0.001;
    if (lastTime > 0) step(now - lastTime);
    lastTime = now;
  }

  /**
   * Render floating text in world space.
   * Call with camera transform applied so text is positioned in world coords.
   * @param {CanvasRenderingContext2D} ctx
   */
  function render(ctx) {
    for (const t of texts) {
      const alpha = 1 - (t.age / t.maxAge);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = t.color;
      ctx.font = 'bold 14px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Dark outline for readability
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 2;
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  return { add, step, stepAuto, render };
}
