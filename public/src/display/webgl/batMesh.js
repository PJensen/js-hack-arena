import { createSphereVertices } from './sphereMesh.js';
import { BAT_VERTEX } from './shaders/bat.vert.js';
import { BAT_FRAGMENT } from './shaders/bat.frag.js';

export function createBatMesh(device) {
  const { gl } = device;
  const program = device.program(BAT_VERTEX, BAT_FRAGMENT);
  const uniforms = Object.fromEntries(['view', 'origin', 'heading', 'size', 'height', 'flap', 'shriek'].map((name) => {
    const location = gl.getUniformLocation(program, 'u_' + name);
    if (location === null) throw new Error(`Bat shader is missing u_${name}`);
    return [name, location];
  }));
  const vertices = batVertices();
  const vao = device.vertexArray();
  gl.bindVertexArray(vao);
  device.buffer(gl.ARRAY_BUFFER, vertices);
  for (const [index, size, offset] of [[0, 3, 0], [1, 3, 12], [2, 2, 24]]) {
    gl.enableVertexAttribArray(index);
    gl.vertexAttribPointer(index, size, gl.FLOAT, false, 32, offset);
  }
  gl.bindVertexArray(null);

  return function draw(view, x, y, radius, heading, height, flap, shriek) {
    gl.useProgram(program);
    gl.uniform4fv(uniforms.view, view);
    gl.uniform2f(uniforms.origin, x, y);
    gl.uniform1f(uniforms.heading, heading);
    gl.uniform1f(uniforms.size, radius);
    gl.uniform1f(uniforms.height, height);
    gl.uniform1f(uniforms.flap, flap);
    gl.uniform1f(uniforms.shriek, shriek);
    gl.bindVertexArray(vao);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 8);
    gl.disable(gl.DEPTH_TEST);
  };
}

function batVertices() {
  const vertices = [];
  const sphere = createSphereVertices(5, 8);
  ellipsoid(-0.18, 0.79, 0, 0.61, 0.35, 0.34, 0);
  ellipsoid(0.34, 0.96, 0, 0.40, 0.32, 0.31, 1);
  ellipsoid(0.62, 0.85, 0, 0.20, 0.15, 0.18, 0);
  for (const side of [-1, 1]) {
    ellipsoid(0.62, 1.01, side * 0.22, 0.073, 0.074, 0.073, 4);
    const earBase = [0.29, 1.12, side * 0.27];
    const tip = [0.19, 1.73, side * 0.39];
    const forward = [0.52, 1.18, side * 0.25];
    const inward = [0.32, 1.20, side * 0.08];
    triangle(earBase, forward, tip, 0);
    triangle(forward, inward, tip, 1);
    triangle(inward, earBase, tip, 0);
    ellipsoid(-0.59, 0.58, side * 0.17, 0.23, 0.09, 0.10, 1);

    const root = [0.20, 0.82, side * 0.23];
    const wrist = [0.26, 0.96, side * 1.00];
    const outerTip = [-0.37, 0.83, side * 2.02];
    const outerNotch = [-0.48, 0.84, side * 1.59];
    const middleTip = [-0.88, 0.70, side * 1.39];
    const innerNotch = [-0.71, 0.78, side * 1.02];
    const heel = [-0.97, 0.65, side * 0.77];
    const tail = [-0.59, 0.65, side * 0.22];
    triangle(root, wrist, tail, 2, side);
    triangle(wrist, outerTip, outerNotch, 2, side);
    triangle(wrist, outerNotch, middleTip, 2, side);
    triangle(wrist, middleTip, innerNotch, 2, side);
    triangle(wrist, innerNotch, heel, 2, side);
    triangle(wrist, heel, tail, 2, side);
    for (const [a, b] of [[root, wrist], [wrist, outerTip], [wrist, middleTip], [wrist, heel]]) {
      const edge = (p, shift) => [p[0] + shift, p[1] + 0.024, p[2]];
      triangle(edge(a, -0.035), edge(b, -0.014), edge(b, 0.014), 3, side);
      triangle(edge(a, -0.035), edge(b, 0.014), edge(a, 0.035), 3, side);
    }
  }
  return new Float32Array(vertices);

  function ellipsoid(x, y, z, rx, ry, rz, material) {
    for (let i = 0; i < sphere.length; i += 3) {
      const nx = sphere[i], ny = sphere[i + 1], nz = sphere[i + 2];
      vertices.push(x + nx * rx, y + ny * ry, z + nz * rz, nx / rx, ny / ry, nz / rz, material, 0);
    }
  }

  function triangle(a, b, c, material, hinge = 0) {
    const ab = b.map((value, i) => value - a[i]);
    const ac = c.map((value, i) => value - a[i]);
    const normal = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    vertices.push(...a, ...normal, material, hinge, ...b, ...normal, material, hinge, ...c, ...normal, material, hinge);
  }
}
