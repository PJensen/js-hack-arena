// display/passes/cavePass.js
// Renders cave geometry from a Perlin distance grid using ImageData.
// One pixel-fill pass — no per-cell fillRect calls.

// Colour palette (RGB)
const WALL_R  = 11, WALL_G  = 15, WALL_B  = 18;   // #0b0f12
const EDGE_R  = 15, EDGE_G  = 26, EDGE_B  = 40;   // #0f1a28
const FLOOR_R = 20, FLOOR_G = 32, FLOOR_B = 48;   // #142030

/**
 * Pre-bake cave grid to an offscreen canvas via ImageData.
 *
 * @param {{ grid, bounds }} caveData
 * @returns {{ canvas, width, height }}
 */
export function bakeCavePass(caveData) {
  const { grid, bounds } = caveData;
  const w = bounds.w, h = bounds.h;
  const { moveGrid, cols, rows, cellSize } = grid;

  const offscreen = document.createElement('canvas');
  offscreen.width = w;
  offscreen.height = h;

  const octx = offscreen.getContext('2d');
  const imgData = octx.createImageData(w, h);
  const pixels = imgData.data;  // Uint8ClampedArray, RGBA

  const invCell = 1 / cellSize;

  for (let py = 0; py < h; py++) {
    const fy = py * invCell;
    const gy = Math.floor(fy);
    if (gy < 0 || gy >= rows - 1) {
      // Wall row — fill with wall colour
      const rowStart = py * w * 4;
      for (let px = 0; px < w; px++) {
        const i = rowStart + px * 4;
        pixels[i] = WALL_R; pixels[i+1] = WALL_G; pixels[i+2] = WALL_B; pixels[i+3] = 255;
      }
      continue;
    }
    const ty = fy - gy;
    const rowOff0 = gy * cols;
    const rowOff1 = rowOff0 + cols;
    const rowStart = py * w * 4;

    for (let px = 0; px < w; px++) {
      const fx = px * invCell;
      const gx = Math.floor(fx);

      let r, g, b;
      if (gx < 0 || gx >= cols - 1) {
        r = WALL_R; g = WALL_G; b = WALL_B;
      } else {
        const tx = fx - gx;
        // Bilinear sample of clearance
        const top    = moveGrid[rowOff0 + gx] * (1 - tx) + moveGrid[rowOff0 + gx + 1] * tx;
        const bottom = moveGrid[rowOff1 + gx] * (1 - tx) + moveGrid[rowOff1 + gx + 1] * tx;
        const val = top * (1 - ty) + bottom * ty;

        if (val > 18) {
          r = FLOOR_R; g = FLOOR_G; b = FLOOR_B;
        } else if (val > 10) {
          r = EDGE_R; g = EDGE_G; b = EDGE_B;
        } else {
          r = WALL_R; g = WALL_G; b = WALL_B;
        }
      }

      const i = rowStart + px * 4;
      pixels[i] = r; pixels[i+1] = g; pixels[i+2] = b; pixels[i+3] = 255;
    }
  }

  octx.putImageData(imgData, 0, 0);
  return { canvas: offscreen, width: w, height: h };
}
