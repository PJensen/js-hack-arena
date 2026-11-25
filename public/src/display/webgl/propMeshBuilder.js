// Interleaved position, face normal, and material index.
export function createPropMeshBuilder() {
  let vertices = [];
  function triangle(a, b, c, material) {
    const [ux, uy, uz] = b.map((n, i) => n - a[i]);
    const [vx, vy, vz] = c.map((n, i) => n - a[i]);
    const normal = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    const length = Math.hypot(...normal);
    if (!length) return;
    for (const p of [a, b, c]) vertices.push(...p, ...normal.map(n => n / length), material);
  }

  function loft(rings, material) {
    for (let row = 1; row < rings.length; row++) {
      const lower = rings[row - 1], upper = rings[row];
      for (let i = 0; i < lower.length; i++) {
        const next = (i + 1) % lower.length;
        triangle(lower[i], upper[i], lower[next], material);
        triangle(lower[next], upper[i], upper[next], material);
      }
    }
    const bottom = rings[0], top = rings.at(-1);
    for (let i = 1; i < bottom.length - 1; i++) {
      triangle(bottom[0], bottom[i], bottom[i + 1], material);
      triangle(top[0], top[i + 1], top[i], material);
    }
  }

  function box(x, y, z, width, height, depth, material, angle = 0) {
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const cos = Math.cos(angle), sin = Math.sin(angle);
    loft([-height / 2, height / 2].map(dy => corners.map(([cx, cz]) => {
      const dx = cx * width / 2;
      return [x + dx * cos - dy * sin, y + dx * sin + dy * cos, z + cz * depth / 2];
    })), material);
  }

  function finish() {
    const mesh = new Float32Array(vertices);
    vertices = [];
    return mesh;
  }

  return { triangle, loft, box, finish };
}

export function uploadPropMesh(device, vertices) {
  const { gl } = device;
  const vao = device.vertexArray();
  gl.bindVertexArray(vao);
  device.buffer(gl.ARRAY_BUFFER, vertices);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 28, 12);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 28, 24);
  return { vao, count: vertices.length / 7 };
}
