import { isOreWall } from '../../rules/geometry/oreSites.js';
import { uniform } from './device.js';
import { createOreMesh } from './oreMesh.js';
import { uploadPropMesh } from './propMeshBuilder.js';
import { ORE_FRAGMENT } from './shaders/ore.frag.js';
import { ORE_VERTEX } from './shaders/ore.vert.js';

const metalColors = {
  copper: [0.93, 0.39, 0.19],
  tin: [0.60, 0.75, 0.86],
  gold: [0.96, 0.74, 0.21],
};

export function createOreRenderer(device, grid, sites) {
  const { gl } = device;
  const program = device.program(ORE_VERTEX, ORE_FRAGMENT);
  const shader = {
    program,
    view: uniform(gl, program, 'u_view'),
    position: uniform(gl, program, 'u_position'),
    wallNormal: uniform(gl, program, 'u_wall_normal'),
    metal: uniform(gl, program, 'u_metal'),
    glintTime: uniform(gl, program, 'u_glint_time'),
  };
  const mesh = uploadPropMesh(device, createOreMesh());

  return function drawOre(view, inView, time) {
    const visible = sites.filter((site) => inView(site.x, site.y, 40) && isOreWall(grid, site));
    if (!visible.length) return;
    gl.useProgram(shader.program);
    gl.bindVertexArray(mesh.vao);
    gl.uniform4fv(shader.view, view);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    for (const { x, y, normalX, normalY, kind } of visible) {
      gl.uniform2f(shader.position, x, y);
      gl.uniform2f(shader.wallNormal, normalX, normalY);
      gl.uniform3fv(shader.metal, metalColors[kind]);
      gl.uniform1f(shader.glintTime, time === null ? -1 : time + x * 0.013 + y * 0.017);
      gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
    }
    gl.disable(gl.DEPTH_TEST);
  };
}
