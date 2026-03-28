// display/passes/torchPass.js
// SDF grid lighting — works AT grid resolution, not per-pixel.
// Sample normals + shading at each grid cell, blit to a light map.
// No per-pixel ray marching. The grid IS the resolution.

/**
 * @param {object} grid – { moveGrid, cols, rows, cellSize, width, height }
 */
export function createTorchPass(grid) {
  const { moveGrid, cols, rows, cellSize } = grid;

  // Light map at grid resolution
  const lmSize = cols * rows;
  const lightR = new Float32Array(lmSize);
  const lightG = new Float32Array(lmSize);
  const lightB = new Float32Array(lmSize);

  // Pre-compute normals from distance field gradient (once)
  const normX = new Float32Array(lmSize);
  const normY = new Float32Array(lmSize);

  for (let gy = 1; gy < rows - 1; gy++) {
    for (let gx = 1; gx < cols - 1; gx++) {
      const i = gy * cols + gx;
      const dx = moveGrid[i + 1] - moveGrid[i - 1];
      const dy = moveGrid[i + cols] - moveGrid[i - cols];
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      normX[i] = dx / len;
      normY[i] = dy / len;
    }
  }

  // Offscreen canvas for the light map (grid resolution)
  const lmCanvas = document.createElement('canvas');
  lmCanvas.width = cols;
  lmCanvas.height = rows;
  const lmCtx = lmCanvas.getContext('2d');
  const imgData = lmCtx.createImageData(cols, rows);
  const pixels = imgData.data;

  /**
   * Recompute lighting for given light sources.
   * Runs at GRID resolution — cols×rows cells, not screen pixels.
   *
   * @param {Array<{x,y,radius,color?:[r,g,b]}>} lights
   */
  function computeLighting(lights) {
    // Clear
    lightR.fill(0);
    lightG.fill(0);
    lightB.fill(0);

    for (const light of lights) {
      const col = light.color || [255, 200, 140];
      const cr = col[0] / 255, cg = col[1] / 255, cb = col[2] / 255;
      const lr = light.radius;
      const lr2 = lr * lr;
      const invLr = 1 / lr;

      // Grid-space bounds for this light
      const gx0 = Math.max(1, ((light.x - lr) / cellSize) | 0);
      const gy0 = Math.max(1, ((light.y - lr) / cellSize) | 0);
      const gx1 = Math.min(cols - 2, ((light.x + lr) / cellSize) | 0);
      const gy1 = Math.min(rows - 2, ((light.y + lr) / cellSize) | 0);

      const lxCell = light.x / cellSize;
      const lyCell = light.y / cellSize;

      for (let gy = gy0; gy <= gy1; gy++) {
        for (let gx = gx0; gx <= gx1; gx++) {
          const i = gy * cols + gx;
          if (moveGrid[i] <= 0) continue;  // wall — skip

          // Distance from light (in world units)
          const dwx = gx - lxCell, dwy = gy - lyCell;
          const dist2 = (dwx * dwx + dwy * dwy) * cellSize * cellSize;
          if (dist2 > lr2) continue;

          const dist = Math.sqrt(dist2);
          const atten = 1.0 - dist * invLr;
          const atten2 = atten * atten;

          // Diffuse: dot(normal, lightDir)
          const invDist = 1 / (dist || 1);
          const ldx = -(dwx * cellSize) * invDist;
          const ldy = -(dwy * cellSize) * invDist;
          const diffuse = Math.max(0, normX[i] * ldx + normY[i] * ldy);

          // Specular
          const spec = Math.pow(diffuse, 12) * 0.4;

          // Ambient + diffuse + spec
          const intensity = (0.15 + diffuse * 0.7 + spec) * atten2;

          lightR[i] += cr * intensity;
          lightG[i] += cg * intensity;
          lightB[i] += cb * intensity;
        }
      }
    }
  }

  /**
   * Render the light map overlay onto the main canvas.
   */
  function render(ctx, lights, viewW, viewH, cam) {
    computeLighting(lights);

    // Pure darkness overlay — black pixels, alpha controls light.
    // 210 = full dark, 0 = fully lit. No RGB tint on this layer.
    for (let i = 0; i < lmSize; i++) {
      const pi = i * 4;
      pixels[pi] = 0;
      pixels[pi + 1] = 0;
      pixels[pi + 2] = 0;

      const d = moveGrid[i];
      if (d <= 0) {
        pixels[pi + 3] = 210;
      } else {
        const brightness = Math.min(1, (lightR[i] + lightG[i] + lightB[i]) * 0.5);
        pixels[pi + 3] = (210 - brightness * 220) | 0;
        if (pixels[pi + 3] < 0) pixels[pi + 3] = 0;
      }
    }

    lmCtx.putImageData(imgData, 0, 0);

    // Pass 1: darkness overlay (source-over)
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(lmCanvas, 0, 0, cols, rows, 0, 0, cols * cellSize, rows * cellSize);
    ctx.restore();

    // Pass 2: warm colour tint (additive blend via 'lighter')
    // Reuse the same canvas — write warm RGB with brightness as alpha
    for (let i = 0; i < lmSize; i++) {
      const pi = i * 4;
      if (moveGrid[i] <= 0) {
        pixels[pi] = 0; pixels[pi+1] = 0; pixels[pi+2] = 0; pixels[pi+3] = 0;
        continue;
      }
      const brightness = Math.min(1, (lightR[i] + lightG[i] + lightB[i]) * 0.4);
      const a = (brightness * 120) | 0;
      pixels[pi]     = Math.min(255, (lightR[i] * 255) | 0);
      pixels[pi + 1] = Math.min(255, (lightG[i] * 180) | 0);
      pixels[pi + 2] = Math.min(255, (lightB[i] * 60) | 0);
      pixels[pi + 3] = a;
    }
    lmCtx.putImageData(imgData, 0, 0);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(lmCanvas, 0, 0, cols, rows, 0, 0, cols * cellSize, rows * cellSize);
    ctx.restore();
  }

  return { render };
}
