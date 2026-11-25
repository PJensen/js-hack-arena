import { createPropMeshBuilder } from './propMeshBuilder.js';

export function createLootMeshes() {
  const { loft, box, finish } = createPropMeshBuilder();

  function bottle(profile, material) {
    loft(profile.map(([y, radius]) => Array.from({ length: 10 }, (_, i) => {
      const angle = i * Math.PI / 5;
      return [Math.cos(angle) * radius, y, Math.sin(angle) * radius];
    })), material);
  }

  function beam([ax, ay], [bx, by], width, depth, material) {
    const dx = bx - ax, dy = by - ay;
    box((ax + bx) / 2, (ay + by) / 2, 0, width,
      Math.hypot(dx, dy) + width * 0.45, depth, material, Math.atan2(-dx, dy));
  }

  box(0, 4, 0, 24, 8, 14, 0);
  loft([[8, 12, 7], [11, 12, 7], [14, 12, 4.5]].map(([y, w, d]) =>
    [[-w, -d], [w, -d], [w, d], [-w, d]].map(([x, z]) => [x, y, z])), 0);
  for (const x of [-8, 8]) {
    box(x, 7.5, 0, 2, 14, 14.4, 1);
  }
  box(0, 7.5, 7.5, 4, 4, 1.5, 1);
  box(0, 7.3, 8.35, 1, 1.6, 0.4, 2);
  const chest = finish();

  bottle([[0, 3.5], [2, 5], [7, 5], [11, 2.3], [14, 2.3]], 0);
  bottle([[13, 2.7], [15, 2.7]], 1);
  bottle([[15, 1.8], [17, 1.8]], 2);
  const potion = finish();

  const diamond = [[-1, 0], [0, -1], [1, 0], [0, 1]];
  loft([[8, 2.3], [21, 2.3], [26, 0]].map(([y, width]) =>
    diamond.map(([x, z]) => [x * width, y, z * width * 0.46])), 0);
  box(0, 8, 0, 10, 2, 2.2, 1);
  box(0, 4.5, 0, 2.3, 5, 1.8, 2);
  box(0, 1.5, 0, 3.3, 2, 2.5, 1);
  const sword = finish();

  const bowCurve = [[-4, 1], [2, 3], [5, 7], [6, 12], [5, 17], [2, 21], [-4, 23]];
  for (let i = 1; i < bowCurve.length; i++) beam(bowCurve[i - 1], bowCurve[i], 1.8, 1.7, 0);
  beam(bowCurve[0], bowCurve.at(-1), 0.65, 0.65, 1);
  box(6, 12, 0, 2.3, 4, 2.1, 2);
  const bow = finish();

  // A recessed page block, two overhanging covers, and a raised spine.
  box(0, 3.5, 0, 19, 5, 27, 1);
  box(-0.4, 0.8, 0, 22, 1.6, 30, 0);
  box(-0.4, 6.5, 0, 22, 1.8, 30, 0);
  box(-11, 3.7, 0, 2.8, 7.4, 30, 0);
  for (const z of [-9, 9]) box(-10.8, 3.7, z, 3.3, 7.8, 2.1, 2);
  const book = finish();

  const fragment = [[-6, -1], [-3, -5], [3, -4], [6, 0], [2, 5], [-4, 3]];
  loft([[0, 0.8, 0], [3, 1, 0], [7, 0.6, -1]].map(([y, scale, shift]) =>
    fragment.map(([x, z]) => [x * scale + shift, y, z * scale])), 0);
  box(-1.4, 6.3, -0.6, 4.6, 2.5, 3.1, 1, -0.16);
  const rock = finish();

  const facets = [[-1, 0], [-0.5, -0.9], [0.5, -0.9], [1, 0], [0.5, 0.9], [-0.5, 0.9]];
  loft([[0, 0.7], [5, 4.5], [9.5, 3.1], [11, 1.6]].map(([y, radius]) =>
    facets.map(([x, z]) => [x * radius, y, z * radius])), 0);
  const gem = finish();

  return { chest, potion, sword, bow, book, rock, gem };
}
