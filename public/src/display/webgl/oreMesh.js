import { createPropMeshBuilder } from './propMeshBuilder.js';

// Local X follows the wall, positive Z enters it, and Y is height.
export function createOreMesh() {
  const { loft, finish } = createPropMeshBuilder();
  const outline = [
    [-1, -0.15, -0.5], [-0.73, -0.83, 1], [-0.24, -1, -1.8],
    [0.34, -0.91, 0.2], [0.86, -0.5, -2], [1, 0.17, 1.5],
    [0.57, 0.87, -0.8], [-0.13, 1, 1], [-0.75, 0.63, -1],
  ];
  const layers = [
    [0, 23, 13, 0, 0, 0],
    [8, 27, 17, -1, 0, 1],
    [17, 23, 15, -2, 1, 1],
    [24, 13, 9, -5, 2, 1],
    [27, 5, 4, -7, 3, 0.4],
  ];
  loft(layers.map(([height, width, depth, x, z, roughness]) =>
    outline.map(([px, pz, rise]) => [x + px * width, height + rise * roughness, z + pz * depth])), 0);

  // Bury the bases below the crown so only the exposed metal tips show.
  const nugget = [[-3, -0.8], [-1.8, -2.6], [1.7, -2.2], [3.2, 0], [1.8, 2.4], [-1.6, 1.9]];
  const vein = [[-15, 0, 19.5, 1.05], [-7, -4, 23, 1.1], [1, 3, 22.6, 0.9], [9, -1, 19, 0.95]];
  const nuggetLayers = [[0, 1.1, 0], [4.2, 0.94, 0.35], [6, 0.56, -0.4]];
  const [, , capOffset] = nuggetLayers.at(-1);
  const glintCenters = new Float32Array(vein.length * 2);
  for (const [index, [x, z, base, size]] of vein.entries()) {
    loft(nuggetLayers.map(([height, scale, offset]) =>
      nugget.map(([px, pz]) => [x + size * (px * scale + offset), base + size * height, z + size * pz * scale])), index + 1);
    glintCenters.set([x + size * capOffset, z], index * 2);
  }
  return { vertices: finish(), glintCenters };
}
