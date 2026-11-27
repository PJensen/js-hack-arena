export const LAVA_DROPLET_FRAGMENT = `#version 300 es
precision highp float;
uniform float u_fade;
in vec2 v_uv;
out vec4 out_color;

void main() {
  vec2 offset = (v_uv - 0.5) * 2.0;
  float radius = length(offset);
  float aa = fwidth(radius);
  float core = 1.0 - smoothstep(0.23 - aa, 0.23 + aa, radius);
  float halo = (1.0 - smoothstep(0.15, 1.0, radius)) * exp(-radius * 2.8);
  vec3 color = mix(vec3(1.0, 0.29, 0.035), vec3(1.0, 0.92, 0.58), core);
  out_color = vec4(color, max(core * 0.92, halo * 0.68) * u_fade);
}`;
