export const WATER_WAKE_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D u_water;
uniform float u_cell_size;
uniform float u_radius;
uniform float u_age;
in vec2 v_local;
in vec2 v_world;
out vec4 out_color;
void main() {
  vec2 size = vec2(textureSize(u_water, 0));
  vec2 uv = (v_world / u_cell_size + 0.5) / size;
  float water = smoothstep(0.44, 0.72, texture(u_water, uv).r);
  float across = abs(v_local.y);
  float width = u_radius * mix(0.55, 1.85, u_age);
  float along = v_local.x + across * across * 0.57 / u_radius;
  float aa = max(fwidth(along), 0.45);
  float band = 1.0 - smoothstep(0.3, 0.95 + aa, abs(along));
  band += 0.24 * (1.0 - smoothstep(0.2, 0.9 + aa, abs(along + u_radius * 0.39)));
  float end = 1.0 - smoothstep(width * 0.78, width, across);
  float fade = 1.0 - smoothstep(0.04, 1.0, u_age);
  out_color = vec4(0.47, 0.79, 0.84, water * end * fade * band * 0.46);
}`;
