// Interleaved model position, RGB, and flame deformation weight.
export function createCampfireMesh() {
  const vertices = [];
  const sides = 7;

  function triangle(a, b, c, color, heat = 0) {
    for (const point of [a, b, c]) {
      vertices.push(...point, ...color, heat * Math.max(0, (point[2] - 9) / 26));
    }
  }

  function shade(color, amount) {
    return color.map(channel => channel * amount);
  }

  function band(lower, upper, color, heat = 0) {
    for (let i = 0; i < sides; i++) {
      const next = (i + 1) % sides;
      const contrast = heat ? 0.045 : 0.19;
      const face = shade(color, 1 - contrast * (1 - Math.cos(i * 2 * Math.PI / sides - 1)));
      triangle(lower[i], lower[next], upper[i], face, heat);
      triangle(upper[i], lower[next], upper[next], face, heat);
    }
  }

  function cap(ring, center, color, heat = 0) {
    for (let i = 0; i < sides; i++) {
      triangle(ring[i], ring[(i + 1) % sides], center, shade(color, 0.87 + 0.13 * Math.cos(i)), heat);
    }
  }

  function rock(x, y, width, depth, height, phase, color) {
    const rim = Array.from({ length: sides }, (_, i) => {
      const angle = i * 2 * Math.PI / sides + phase;
      const jag = 1 + 0.16 * Math.sin(i * 13.1 + phase);
      return [Math.cos(angle) * width * jag, Math.sin(angle) * depth * jag];
    });
    const base = rim.map(([dx, dy]) => [x + dx * 0.83, y + dy * 0.83, 0]);
    const shoulder = rim.map(([dx, dy], i) => [x + dx, y + dy, height * (0.62 + 0.1 * Math.sin(i * 9 + phase))]);
    const crown = rim.map(([dx, dy], i) => [x + dx * 0.61 - 0.8, y + dy * 0.58, height * (0.91 + 0.08 * Math.cos(i * 3))]);
    band(base, shoulder, shade(color, 0.62));
    band(shoulder, crown, color);
    cap(crown, [x - 1, y - 1, height], shade(color, 1.18));
  }

  function log(x, y, angle, length, radius, height) {
    const axisX = Math.cos(angle);
    const axisY = Math.sin(angle);
    function end(distance, scale) {
      return Array.from({ length: sides }, (_, i) => {
        const side = i * 2 * Math.PI / sides;
        const cross = Math.cos(side) * radius * scale * (0.92 + 0.12 * Math.sin(i * 7.2));
        return [
          x + axisX * distance - axisY * cross,
          y + axisY * distance + axisX * cross,
          height + Math.sin(side) * radius * scale,
        ];
      });
    }
    const near = end(length / 2, 1);
    const far = end(-length / 2, 0.83);
    // Longitudinal bark ridges darken where the logs cross over the coals.
    const char = end(-length * 0.12, 0.91);
    band(far, char, [0.27, 0.15, 0.10]);
    band(char, near, [0.40, 0.24, 0.14]);
    const sapwood = end(length / 2, 0.8);
    const heartwood = end(length / 2, 0.51);
    band(near, sapwood, [0.24, 0.13, 0.08]);
    band(sapwood, heartwood, [0.73, 0.50, 0.28]);
    cap(heartwood, [x + axisX * length / 2, y + axisY * length / 2, height], [0.55, 0.32, 0.17]);
    cap(far, [x - axisX * length / 2, y - axisY * length / 2, height], [0.40, 0.22, 0.12]);
  }

  function flame(x, y, width, height, lean, color) {
    function ring(z, radius, bend) {
      return Array.from({ length: sides }, (_, i) => {
        const angle = i * 2 * Math.PI / sides;
        return [x + bend + Math.cos(angle) * radius, y + Math.sin(angle) * radius * 0.71, z];
      });
    }
    const root = ring(7, width * 0.74, 0);
    const belly = ring(7 + height * 0.25, width, lean * -0.15);
    const shoulder = ring(7 + height * 0.48, width * 0.75, lean * 0.02);
    const neck = ring(7 + height * 0.69, width * 0.43, lean * 0.36);
    const tip = ring(7 + height * 0.88, width * 0.16, lean * 0.77);
    band(root, belly, shade(color, 1.13), 1);
    band(belly, shoulder, color, 1);
    band(shoulder, neck, color, 1);
    band(neck, tip, shade(color, 0.96), 1);
    cap(tip, [x + lean * 1.25, y - 2, height + 7], shade(color, 0.89), 1);
  }

  rock(0, 0, 27, 22, 1.2, 0.4, [0.12, 0.095, 0.08]);
  for (let i = 0; i < 11; i++) {
    const angle = i * Math.PI * 2 / 11 + Math.sin(i * 9.2) * 0.075;
    rock(Math.cos(angle) * 26, Math.sin(angle) * 22,
      6 + 1.7 * Math.sin(i * 7.9), 5.7 + 1.3 * Math.cos(i * 2.7),
      4.8 + 2.5 * Math.cos(i * 8.1), i * 2.1,
      shade([0.52, 0.49, 0.43], 0.86 + 0.17 * Math.sin(i)));
  }
  for (let i = 0; i < 13; i++) {
    const angle = i * 2.39996;
    rock(Math.cos(angle) * (6 + i), Math.sin(angle) * (3 + i * 0.84),
      2.2, 2.4, 1.8 + 1.4 * Math.sin(i), angle,
      shade([1, 0.31, 0.045], 0.56 + 0.39 * Math.sin(i * 8.7)));
  }
  log(-1, 0, 2.62, 38, 4.2, 4.8);
  log(1, 2, 0.53, 40, 4.4, 7.1);
  log(-5, 3, 1.92, 28, 3.4, 8.8);
  flame(-10, -1, 5.8, 22, -4, [1, 0.51, 0.09]);
  flame(9, -2, 6.1, 26, 5, [1, 0.43, 0.055]);
  flame(-1, -1, 7.4, 35, 5, [1, 0.68, 0.14]);
  flame(2, 5, 5.5, 19, -3, [1, 0.87, 0.32]);
  return new Float32Array(vertices);
}
