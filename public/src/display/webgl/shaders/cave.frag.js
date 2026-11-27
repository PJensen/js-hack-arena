import { CAVE_SURFACE_GLSL } from './caveSurface.glsl.js';

export const CAVE_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D u_field;
uniform ivec2 u_grid_size;
uniform float u_terrain_time;
in vec2 v_uv;
in vec2 v_world;
out vec4 out_color;
float field_sample(vec2 uv) {
  vec2 point = clamp(uv, 0.0, 1.0) * vec2(u_grid_size - 1);
  ivec2 base = ivec2(floor(point));
  ivec2 next = min(base + 1, u_grid_size - 1);
  vec2 blend = fract(point);
  float a = texelFetch(u_field, base, 0).r;
  float b = texelFetch(u_field, ivec2(next.x, base.y), 0).r;
  float c = texelFetch(u_field, ivec2(base.x, next.y), 0).r;
  float d = texelFetch(u_field, next, 0).r;
  return mix(mix(a, b, blend.x), mix(c, d, blend.x), blend.y);
}

${CAVE_SURFACE_GLSL}

void main() {
  float clearance = field_sample(v_uv);
  float pixelSize = max(fwidth(v_world.x), fwidth(v_world.y));
  out_color = vec4(caveSurface(clearance, v_uv, v_world, pixelSize, u_terrain_time), 1.0);
}`;
