const SPILL_RANGE = 64;
const ORTHOGONAL_STEP = 10;
const DIAGONAL_STEP = 14;

export function createLavaLightPixels({ lavaGrid, cols, rows, cellSize }) {
  const reach = SPILL_RANGE / cellSize * ORTHOGONAL_STEP;
  const stride = cols + 2;
  const distance = new Uint16Array(stride * (rows + 2)).fill(Math.ceil(reach));
  const pixels = new Uint8Array(lavaGrid.length * 2);

  // The border is padded so both sweeps can use the same neighbors at the edges.
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const source = row * cols + col;
      const index = (row + 1) * stride + col + 1;
      pixels[source * 2] = lavaGrid[source];
      distance[index] = lavaGrid[source] >= 128 ? 0 : Math.min(
        distance[index],
        distance[index - 1] + ORTHOGONAL_STEP,
        distance[index - stride] + ORTHOGONAL_STEP,
        distance[index - stride - 1] + DIAGONAL_STEP,
        distance[index - stride + 1] + DIAGONAL_STEP,
      );
    }
  }
  for (let row = rows - 1; row >= 0; row--) {
    for (let col = cols - 1; col >= 0; col--) {
      const index = (row + 1) * stride + col + 1;
      const nearest = Math.min(
        distance[index],
        distance[index + 1] + ORTHOGONAL_STEP,
        distance[index + stride] + ORTHOGONAL_STEP,
        distance[index + stride - 1] + DIAGONAL_STEP,
        distance[index + stride + 1] + DIAGONAL_STEP,
      );
      distance[index] = nearest;
      const falloff = Math.max(0, 1 - nearest / reach);
      pixels[(row * cols + col) * 2 + 1] = Math.round(255 * falloff * falloff);
    }
  }
  return pixels;
}
