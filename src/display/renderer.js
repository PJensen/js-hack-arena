// display/renderer.js
// Main frame renderer — queries ECS world, draws everything.
// No simulation logic. Pure display.

import { Position, Velocity, Collider, Facing, Health, Actor, ActorKind, Projectile, PointLight, Input, GroundItem, ItemInfo } from '../rules/components/index.js';
import { AI } from '../rules/components/index.js';
import { applyCamera } from './camera/controller.js';

/**
 * @param {object} deps
 * @param {HTMLCanvasElement} deps.canvas
 * @param {CanvasRenderingContext2D} deps.ctx
 * @param {object} deps.cam
 * @param {object} deps.caveBake
 * @param {object} deps.torchPass
 * @param {object} deps.fx — ParticleFX instance
 * @param {object} deps.world
 * @param {object} deps.hud — HUD DOM elements { hud, readL, readR, zoomReadout }
 * @param {object} deps.input — { leftStick, rightStick, keys, keyboardInput }
 * @param {number} deps.SEED
 * @param {object} deps.runtimeEvents
 */
export function createRenderer(deps) {
  const { canvas, ctx, cam, caveBake, torchPass, fx, world, hud, input, SEED, runtimeEvents, boltFx } = deps;
  let lastRenderTime = 0;

  return function renderFrame() {
    // Find local player via Input component query
    let playerId = null, inp = null, pos = null, col = null, fac = null;
    for (const [id, _inp, _pos, _col, _fac] of world.query(Input, Position, Collider, Facing)) {
      playerId = id; inp = _inp; pos = _pos; col = _col; fac = _fac;
      break;
    }
    if (!playerId) return; // no player

    const kb = input.keyboardInput();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0b0f12';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    applyCamera(ctx, cam, canvas);
    ctx.drawImage(caveBake.canvas, 0, 0);

    // Draw ground items (potions etc)
    for (const [id, ipos, gi, info] of world.query(Position, GroundItem, ItemInfo)) {
      const t = performance.now() * 0.003;
      const bob = Math.sin(t + id * 2) * 2;  // gentle bob
      ctx.fillStyle = '#ff5080';
      ctx.font = 'bold 18px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(info.glyph, ipos.x, ipos.y + bob);
    }

    // Draw player
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, col.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#193447';
    ctx.fill();
    ctx.strokeStyle = '#6fd';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#cfe8ff';
    ctx.font = `bold ${Math.floor(col.radius * 1.4)}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('@', pos.x, pos.y + 1);

    // Torch glyph offset from player
    ctx.fillStyle = '#ffbe60';
    ctx.font = 'bold 14px ui-monospace, monospace';
    ctx.fillText('\u2020', pos.x + col.radius + 4, pos.y - col.radius + 2);

    // Draw mobs
    for (const [id, mpos, mcol, actor, mfac] of world.query(Position, Collider, Actor, Facing)) {
      if (actor.kind !== ActorKind.MOB) continue;
      ctx.beginPath();
      ctx.arc(mpos.x, mpos.y, mcol.radius, 0, Math.PI * 2);
      ctx.fillStyle = '#2a1540';
      ctx.fill();
      ctx.strokeStyle = '#a050ff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#d0a0ff';
      ctx.font = `bold ${Math.floor(mcol.radius * 1.4)}px ui-monospace, monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(actor.glyph, mpos.x, mpos.y + 1);

      const mAimLen = mcol.radius + 10;
      ctx.beginPath();
      ctx.moveTo(mpos.x + Math.cos(mfac.angle) * mcol.radius, mpos.y + Math.sin(mfac.angle) * mcol.radius);
      ctx.lineTo(mpos.x + Math.cos(mfac.angle) * mAimLen, mpos.y + Math.sin(mfac.angle) * mAimLen);
      ctx.strokeStyle = '#c070ff';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // Draw projectiles
    for (const [id, bpos, proj, bcol] of world.query(Position, Projectile, Collider)) {
      const isEnemy = world.has(proj.owner, AI);
      ctx.beginPath();
      ctx.arc(bpos.x, bpos.y, bcol.radius, 0, Math.PI * 2);
      ctx.fillStyle = isEnemy ? 'rgba(180,80,255,0.9)' : 'rgba(140,210,255,0.9)';
      ctx.fill();
      ctx.fillStyle = isEnemy ? '#e0b0ff' : '#e0f4ff';
      ctx.font = 'bold 10px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(isEnemy ? '\u2726' : '\u2744', bpos.x, bpos.y);
    }

    // Health bars
    for (const [id, hpos, hcol, hp] of world.query(Position, Collider, Health)) {
      if (hp.hp >= hp.maxHp && id !== playerId) continue;
      const ratio = Math.max(0, hp.hp / Math.max(1, hp.maxHp));
      const barW = hcol.radius * 2.2;
      const barH = 4;
      const bx = hpos.x - barW * 0.5;
      const by = hpos.y - hcol.radius - 10;
      const hue = Math.round(120 * ratio);

      ctx.fillStyle = 'rgba(10,12,18,0.8)';
      ctx.fillRect(bx, by, barW, barH);
      if (ratio > 0) {
        ctx.fillStyle = `hsl(${hue} 85% 48%)`;
        ctx.fillRect(bx + 0.5, by + 0.5, (barW - 1) * ratio, barH - 1);
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(bx, by, barW, barH);
    }

    // Player aim indicator
    const aimLen = col.radius + 14;
    ctx.beginPath();
    ctx.moveTo(pos.x + Math.cos(fac.angle) * col.radius, pos.y + Math.sin(fac.angle) * col.radius);
    ctx.lineTo(pos.x + Math.cos(fac.angle) * aimLen, pos.y + Math.sin(fac.angle) * aimLen);
    ctx.strokeStyle = '#8fe';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Lightning bolt FX (world space, additive)
    const now = performance.now() * 0.001;
    const renderDt = lastRenderTime > 0 ? now - lastRenderTime : 0.016;
    lastRenderTime = now;
    if (boltFx) boltFx.render(ctx, renderDt);

    // Torch lighting pass
    const lights = [];
    const t = now;

    for (const [id, lpos, pl] of world.query(Position, PointLight)) {
      if (!pl.enabled) continue;
      const isTorch = pl.b < pl.r;
      if (isTorch) {
        const flicker = 1.0
          + 0.12 * Math.sin(t * 5.7 + id)
          + 0.08 * Math.sin(t * 13.3 + id)
          + 0.06 * Math.sin(t * 23.1)
          + 0.10 * (Math.random() - 0.5);
        lights.push({
          x: lpos.x, y: lpos.y,
          radius: pl.radius * Math.max(0.7, flicker),
          color: [
            Math.min(255, pl.r * Math.max(0.8, flicker)),
            Math.min(255, pl.g * Math.max(0.6, flicker * 0.85)),
            Math.min(255, pl.b * Math.max(0.3, flicker * 0.5)),
          ],
        });
      } else {
        const shimmer = 1.0 + 0.05 * Math.sin(t * 20 + id * 7);
        lights.push({
          x: lpos.x, y: lpos.y,
          radius: pl.radius * shimmer,
          color: [pl.r * shimmer, pl.g * shimmer, pl.b],
        });
      }
    }
    torchPass.render(ctx, lights, canvas.width, canvas.height, cam);

    // Particles
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    fx.ctx = ctx;
    fx.render({ mode: 'lighter' });

    // Float text (world space, after particles but before HUD)
    if (deps.floatText) {
      deps.floatText.stepAuto();
      applyCamera(ctx, cam, canvas);
      deps.floatText.render(ctx);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    // Player death overlay
    const playerHp = world.get(playerId, Health);
    if (playerHp.hp <= 0) {
      ctx.fillStyle = 'rgba(80,0,0,0.6)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#ff4444';
      ctx.font = 'bold 48px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('YOU DIED', canvas.width / 2, canvas.height / 2 - 20);
      ctx.fillStyle = '#ccc';
      ctx.font = '20px Inter, system-ui, sans-serif';
      ctx.fillText('refresh to respawn', canvas.width / 2, canvas.height / 2 + 30);
    }

    // HUD
    const hpText = playerHp.hp > 0 ? `  HP:${playerHp.hp}/${playerHp.maxHp}` : '';
    hud.hud.textContent = 'Hack Arena  seed:' + SEED.toString(16) + hpText + '  casts:' + runtimeEvents.casts;
    hud.zoomReadout.textContent = `zoom: ${cam.scale.toFixed(2)}x  [+/- or scroll]`;
    const routerOut = input.leftStick.getOutput();
    hud.readL.textContent = routerOut.left.active
      ? `L x:${inp.moveX.toFixed(2)} y:${inp.moveY.toFixed(2)}`
      : (Math.abs(kb.mx) + Math.abs(kb.my) > 0 ? `KB ${kb.mx},${kb.my}` : 'L stick idle');
    hud.readR.textContent = routerOut.right.active
      ? `R x:${inp.aimX.toFixed(2)} y:${inp.aimY.toFixed(2)}`
      : 'R stick idle';
  };
}
