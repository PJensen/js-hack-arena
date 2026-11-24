export const SPORE_CLOUD_FRAGMENT = `#version 300 es
precision highp float;
uniform float u_time;
uniform float u_age;
uniform float u_remaining;
in vec2 v_slice;
flat in int v_layer;
out vec4 out_color;

float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

float noise(vec2 p) {
  vec2 cell = floor(p);
  vec2 blend = fract(p);
  blend = blend * blend * (3.0 - 2.0 * blend);
  return mix(
    mix(hash(cell), hash(cell + vec2(1.0, 0.0)), blend.x),
    mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0)), blend.x),
    blend.y
  );
}

void main() {
  float radius = length(v_slice);
  float fade = smoothstep(0.0, 0.9, u_remaining);
  if (v_layer == 0) {
    // The floor marker stays at the gameplay radius while the fog moves.
    float angle = atan(v_slice.y, v_slice.x);
    float rim = 1.0 - smoothstep(0.004, 0.024, abs(radius - 0.985));
    rim *= 0.45 + 0.55 * smoothstep(-0.1, 0.65, cos(angle * 22.0));
    out_color = vec4(0.79, 0.90, 0.38, rim * mix(0.28, 0.55, fade));
    return;
  }

  float tier = float(v_layer - 1) / 3.0;
  vec2 wind = vec2(u_time * 0.28, -u_time * 0.19);
  vec2 samplePoint = v_slice * mix(3.2, 2.5, tier) + wind + vec2(4.8, 8.1) * tier;
  float billows = noise(samplePoint);
  float detail = noise(samplePoint * 2.35 - wind * 0.38);
  float edge = 1.0 - smoothstep(0.20, 0.99, radius + (billows - 0.5) * 0.55);
  float density = edge * smoothstep(0.14, 0.76, mix(billows, detail, 0.32));
  float shading = clamp(0.54 + 1.7 * (billows - noise(samplePoint + vec2(-0.18, -0.24))), 0.0, 1.0);
  vec3 shadow = mix(vec3(0.17, 0.27, 0.06), vec3(0.39, 0.50, 0.13), tier);
  vec3 light = mix(vec3(0.62, 0.76, 0.22), vec3(0.88, 0.94, 0.48), tier);
  float arrival = smoothstep(tier * 0.13, 0.21 + tier * 0.16, u_age);
  float burst = exp(-u_age * 0.85);
  float opacity = mix(0.42, 0.10, tier) + burst * mix(0.35, 0.72, tier);
  out_color = vec4(mix(shadow, light, shading), density * arrival * opacity * fade);
}`;
