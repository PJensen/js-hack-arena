function sampleIndices(length, stride) {
  const result = [];
  for (let value = 0; value < length - 1; value += stride) result.push(value);
  if (result[result.length - 1] !== length - 1) result.push(length - 1);
  return result;
}

/** Build a y-up height mesh from Arena's gameplay and signed density fields. */
export function buildTerrainMesh(grid, { stride = 3, wallHeight = 110 } = {}) {
  if (!Number.isInteger(stride) || stride < 1) throw new Error('terrain stride must be a positive integer');
  const { cols, rows, cellSize, moveGrid, densityGrid } = grid;
  const xs = sampleIndices(cols, stride);
  const ys = sampleIndices(rows, stride);
  const width = xs.length;
  const height = ys.length;
  const heights = new Float32Array(width * height);

  function terrainHeight(gx, gy) {
    const index = gy * cols + gx;
    if (moveGrid[index] > 0) return 0;
    const density = densityGrid?.[index] ?? -0.1;
    return Math.min(wallHeight, 10 + Math.max(0, -density) * wallHeight * 2.5);
  }

  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      heights[row * width + column] = terrainHeight(xs[column], ys[row]);
    }
  }

  const vertices = new Float32Array(width * height * 7);
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const index = row * width + column;
      const left = heights[row * width + Math.max(0, column - 1)];
      const right = heights[row * width + Math.min(width - 1, column + 1)];
      const down = heights[Math.max(0, row - 1) * width + column];
      const up = heights[Math.min(height - 1, row + 1) * width + column];
      let nx = left - right;
      let ny = Math.max(cellSize * stride * 2, 1);
      let nz = down - up;
      const length = Math.hypot(nx, ny, nz) || 1;
      nx /= length;
      ny /= length;
      nz /= length;
      const offset = index * 7;
      vertices[offset] = xs[column] * cellSize;
      vertices[offset + 1] = heights[index];
      vertices[offset + 2] = ys[row] * cellSize;
      vertices[offset + 3] = nx;
      vertices[offset + 4] = ny;
      vertices[offset + 5] = nz;
      vertices[offset + 6] = heights[index] > 0 ? 1 : 0;
    }
  }

  const indices = new Uint32Array((width - 1) * (height - 1) * 6);
  let cursor = 0;
  for (let row = 0; row < height - 1; row++) {
    for (let column = 0; column < width - 1; column++) {
      const a = row * width + column;
      const b = a + 1;
      const c = a + width;
      const d = c + 1;
      indices[cursor++] = a;
      indices[cursor++] = c;
      indices[cursor++] = b;
      indices[cursor++] = b;
      indices[cursor++] = c;
      indices[cursor++] = d;
    }
  }

  return { vertices, indices, columns: width, rows: height };
}

