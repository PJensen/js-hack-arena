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

  return { chest, potion, sword, bow };
}
