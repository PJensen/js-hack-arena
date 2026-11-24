export const SPORE_CLOUD_VERTEX = `#version 300 es
layout(location=0) in vec2 a_position;
uniform vec4 u_view;
uniform vec2 u_position;
uniform vec2 u_size;
uniform float u_time;
uniform float u_age;
out vec2 v_slice;
flat out int v_layer;

void main() {
  v_slice = a_position * 2.04;
  v_layer = gl_InstanceID;
  vec2 offset = a_position * u_size;
  if (v_layer > 0) {
    float tier = float(v_layer - 1) / 3.0;
    float spread = mix(0.17, 1.0, 1.0 - exp(-u_age * mix(8.0, 3.2, tier)));
    float width = mix(1.02, 0.72, tier) * spread;
    float lift = (1.0 - exp(-u_age * 6.0)) * exp(-u_age * 0.95);
    float height = mix(0.035, 0.24, tier) + tier * lift * 0.84;
    float phase = u_time * 0.67 + tier * 5.2;
    vec2 drift = vec2(sin(phase), cos(phase * 0.77)) * spread * mix(0.025, 0.15, tier);
    offset *= vec2(width, width * mix(0.96, 0.73, tier));
    offset += u_size * 0.5 * (drift - vec2(0.0, 0.87 * height));
  }
  vec2 clip = (u_position + offset - u_view.xy) * 2.0 / u_view.zw;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;
