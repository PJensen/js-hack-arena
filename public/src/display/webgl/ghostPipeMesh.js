// Interleaved position, baked surface color, and emissive weight.
export function createGhostPipeMesh() {
  const vertices = [];

  function stalk(x, y, scale, heading) {
    const cos = Math.cos(heading);
    const sin = Math.sin(heading);
    const stemColor = [0.60, 0.59, 0.62];
    const petalColor = [0.80, 0.78, 0.82];

    function triangle(a, b, c, color, emission) {
      for (const [px, py, pz] of [a, b, c]) {
        vertices.push(
          x + scale * (px * cos - py * sin),
          y + scale * (px * sin + py * cos),
          scale * pz,
          color[0], color[1], color[2], emission,
        );
      }
    }

    function band(from, to, color, emission) {
      for (let i = 0; i < from.length; i++) {
        const j = (i + 1) % from.length;
        const light = 0.80 + 0.20 * Math.cos(2 * Math.PI * (i + 0.5) / from.length + heading + 0.8);
        const shade = color.map(channel => channel * light);
        triangle(from[i], from[j], to[i], shade, emission);
        triangle(to[i], from[j], to[j], shade, emission);
      }
    }

    const spine = [[0, 0, 0], [-1.2, 0, 11], [-1.7, 0, 24], [-1.1, 0, 35]];
    // The tip bends over in a continuous hook before the flower hangs down.
    for (let i = 0; i <= 8; i++) {
      const angle = Math.PI * (1 - i / 8);
      spine.push([5.5 + 6.6 * Math.cos(angle), 0, 39 + 7.5 * Math.sin(angle)]);
    }
    const rings = spine.map(([px, py, pz], index) => {
      const before = spine[Math.max(0, index - 1)];
      const after = spine[Math.min(spine.length - 1, index + 1)];
      const dx = after[0] - before[0];
      const dz = after[2] - before[2];
      const length = Math.hypot(dx, dz);
      const radius = 1.72 - 0.67 * index / (spine.length - 1);
      return Array.from({ length: 8 }, (_, i) => {
        const angle = i * Math.PI / 4;
        const cross = radius * Math.cos(angle) / length;
        return [px + cross * dz, py + radius * Math.sin(angle), pz - cross * dx];
      });
    });
    for (let i = 1; i < rings.length; i++) band(rings[i - 1], rings[i], stemColor, 0.16);

    // Short, pointed bracts project from alternate sides of the stalk.
    for (const [z, side] of [[8, -1], [16, 1], [25, -1], [33, 1]]) {
      const base = [-1.4, 0, z];
      const tip = [-1.4 + side * 3.7, 0.3, z + 5.6];
      const edge = [-1.4 + side * 2.2, -1.3, z + 2.1];
      const ridge = [-1.4 + side * 2.1, 1.3, z + 3.1];
      triangle(base, edge, tip, [0.67, 0.65, 0.69], 0.22);
      triangle(base, tip, ridge, [0.51, 0.51, 0.55], 0.22);
    }

    function petalRing(height, radius, pleat, scallop) {
      return Array.from({ length: 20 }, (_, i) => {
        const angle = i * Math.PI / 10;
        const lobe = 0.5 + 0.5 * Math.cos(angle * 5);
        const r = radius + pleat * lobe;
        return [
          12.1 + (39 - height) * 0.28 + r * Math.cos(angle),
          r * 0.88 * Math.sin(angle),
          height - lobe * scallop,
        ];
      });
    }
    const collar = petalRing(39, 1.1, 0, 0);
    const shoulder = petalRing(36.5, 3.0, 0.28, 0);
    const belly = petalRing(31, 4.05, 0.65, 0.3);
    const mouth = petalRing(26, 3.9, 0.98, 1.65);
    const innerLip = petalRing(26.7, 3.2, 0.72, 1.45);
    const throat = petalRing(33, 0.7, 0, 0);
    band(collar, shoulder, petalColor, 0.39);
    band(shoulder, belly, petalColor, 0.62);
    band(belly, mouth, petalColor, 0.8);
    band(mouth, innerLip, [0.62, 0.63, 0.70], 1);
    band(innerLip, throat, [0.29, 0.34, 0.43], 0.66);
  }

  stalk(-14, 5, 0.65, 0.11);
  stalk(16, 1, 0.77, Math.PI - 0.14);
  stalk(-4, -5, 1.08, -0.17);
  return new Float32Array(vertices);
}
