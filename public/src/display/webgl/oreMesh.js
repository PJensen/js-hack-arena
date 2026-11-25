import { createPropMeshBuilder } from './propMeshBuilder.js';

// Local X follows the wall, positive Z enters it, and Y is height.
export function createOreMesh() {
  const { loft, finish } = createPropMeshBuilder();
  const slab = [[-24, 2], [-18, -8], [-5, -11], [11, -8], [23, -4], [20, 8], [-13, 11]];
  loft([[0, 1, 0, 0], [7, 0.92, 0, 1], [12, 0.62, -2, 3]].map(([height, scale, x, z]) =>
    slab.map(([px, pz]) => [x + px * scale, height, z + pz * scale])), 0);

  const nodule = [[-5, -1], [-3, -5], [2, -4], [6, -1], [4, 4], [-2, 3]];
  for (const [x, z, base, size] of [[-13, -4, 4, 0.9], [-4, 1, 8, 1.2], [7, -5, 4, 1], [15, 1, 5, 0.75]]) {
    loft([[0, 1, 0], [5, 0.96, 0.8], [8, 0.55, -0.5]].map(([height, scale, offset]) =>
      nodule.map(([px, pz]) => [x + size * (px * scale + offset), base + size * height, z + size * pz * scale])), 1);
  }
  return finish();
}
