import { uniform } from './device.js';
import { createPropMeshBuilder, uploadPropMesh } from './propMeshBuilder.js';
import { MIMIC_VERTEX } from './shaders/mimic.vert.js';
import { MIMIC_FRAGMENT } from './shaders/mimic.frag.js';

export function createMimicMesh(device) {
  const { gl } = device;
  const { triangle, loft, box, finish } = createPropMeshBuilder();

  function teeth(direction, z) {
    const corners = [[-1.25, -0.8], [1.25, -0.8], [1.25, 0.8], [-1.25, 0.8]];
    for (const x of [-9, -5, -2, 2, 5, 9]) {
      const height = Math.abs(x) === 9 ? 5.5 : 3.6;
      const tip = [x * 0.97, 8 + height * direction, z + 0.8];
      for (let i = 0; i < corners.length; i++) {
        const [ax, az] = corners[i];
        const [bx, bz] = corners[(i + 1) % corners.length];
        const a = [x + ax, 8, z + az];
        const b = [x + bx, 8, z + bz];
        if (direction > 0) triangle(a, tip, b, 3);
        else triangle(a, b, tip, 3);
      }
    }
  }

  box(0, 4, 0, 24, 8, 14, 0);
  for (const x of [-8, 8]) box(x, 4.25, 0, 2, 7.5, 14.4, 1);
  box(0, 7.5, 7.5, 4, 4, 1.5, 1);
  box(0, 8.02, 0, 23.7, 0.3, 13.8, 2);
  teeth(1, 6);
  const body = finish();

  loft([[8, 12, 7], [11, 12, 7], [14, 12, 4.5]].map(([y, width, depth]) =>
    [[-width, -depth], [width, -depth], [width, depth], [-width, depth]].map(([x, z]) => [x, y, z])), 0);
  for (const x of [-8, 8]) box(x, 11.25, 0, 2, 6.5, 14.4, 1);
  box(0, 7.97, 0, 23.7, 0.3, 13.8, 2);
  teeth(-1, 6.8);
  const lid = finish();

  const vertices = new Float32Array(body.length + lid.length);
  vertices.set(body);
  vertices.set(lid, body.length);
  const { vao } = uploadPropMesh(device, vertices);
  const program = device.program(MIMIC_VERTEX, MIMIC_FRAGMENT);
  const locations = {
    view: uniform(gl, program, 'u_view'),
    position: uniform(gl, program, 'u_position'),
    facing: uniform(gl, program, 'u_facing'),
    jaw: uniform(gl, program, 'u_jaw'),
  };
  const bodyCount = body.length / 7;
  const lidCount = lid.length / 7;

  return function drawMimicMesh(view, x, y, facing, jaw) {
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.uniform4fv(locations.view, view);
    gl.uniform2f(locations.position, x, y);
    gl.uniform1f(locations.facing, facing);
    gl.uniform1f(locations.jaw, 0);
    gl.drawArrays(gl.TRIANGLES, 0, bodyCount);
    gl.uniform1f(locations.jaw, jaw);
    gl.drawArrays(gl.TRIANGLES, bodyCount, lidCount);
    gl.disable(gl.DEPTH_TEST);
  };
}
