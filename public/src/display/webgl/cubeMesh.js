// A low-poly cube. The vertex shader supplies the animated deformation.
export function createCubeMesh() {
  const vertices = [];
  const faces = [
    { normal: [0, 0, -1], corners: [[-1, 0, -1], [1, 0, -1], [1, 1, -1], [-1, 1, -1]] },
    { normal: [1, 0, 0], corners: [[1, 0, -1], [1, 0, 1], [1, 1, 1], [1, 1, -1]] },
    { normal: [0, 0, 1], corners: [[1, 0, 1], [-1, 0, 1], [-1, 1, 1], [1, 1, 1]] },
    { normal: [-1, 0, 0], corners: [[-1, 0, 1], [-1, 0, -1], [-1, 1, -1], [-1, 1, 1]] },
    { normal: [0, 1, 0], corners: [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]] },
    { normal: [0, -1, 0], corners: [[-1, 0, 1], [1, 0, 1], [1, 0, -1], [-1, 0, -1]] },
  ];
  for (const { normal, corners } of faces) {
    for (const index of [0, 1, 2, 0, 2, 3]) {
      const [x, y, z] = corners[index];
      vertices.push(x * 0.62, y * 1.24, z * 0.62, ...normal, x * 0.5 + 0.5, y);
    }
  }
  return new Float32Array(vertices);
}
