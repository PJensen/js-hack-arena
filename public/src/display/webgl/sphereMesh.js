export function createSphereVertices(rows, columns) {
  const output = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const a = point(row, col), b = point(row, col + 1);
      const c = point(row + 1, col), d = point(row + 1, col + 1);
      output.push(...a, ...c, ...b, ...b, ...c, ...d);
    }
  }
  return new Float32Array(output);

  function point(row, col) {
    const pitch = Math.PI * row / rows;
    const yaw = 2 * Math.PI * col / columns;
    return [Math.sin(pitch) * Math.cos(yaw), Math.cos(pitch), Math.sin(pitch) * Math.sin(yaw)];
  }
}
