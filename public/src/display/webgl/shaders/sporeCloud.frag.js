export const SPORE_CLOUD_FRAGMENT = `#version 300 es
precision highp float;
uniform float u_time;
uniform float u_age;
uniform float u_remaining;
in vec2 v_uv;
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
  vec2 p = (v_uv - 0.5) * 2.04;
  float radius = length(p);
  float angle = atan(p.y, p.x);
  float spread = mix(0.20, 1.0, 1.0 - pow(1.0 - clamp(u_age / 0.45, 0.0, 1.0), 3.0));
  vec2 drift = vec2(u_time * 0.34, -u_time * 0.27);
  float clouds = 0.72 * noise(p * 4.0 + drift) + 0.28 * noise(p * 9.0 - drift);
  float footprint = 1.0 - smoothstep(spread - 0.20, spread, radius);
  float mist = footprint * smoothstep(0.18, 0.84, clouds);
  float burst = (1.0 - smoothstep(0.0, 0.6, u_age)) * footprint;
  float boundary = (1.0 - smoothstep(0.004, 0.024, abs(radius - 0.985)));
  boundary *= 0.45 + 0.55 * smoothstep(-0.1, 0.65, cos(angle * 22.0));
  float fade = smoothstep(0.0, 0.9, u_remaining);
  vec3 color = mix(vec3(0.25, 0.42, 0.09), vec3(0.74, 0.85, 0.32), clouds);
  color = mix(color, vec3(0.79, 0.90, 0.38), max(boundary, burst));
  out_color = vec4(color, max(mist * 0.52 * fade + burst * 0.24, boundary * mix(0.25, 0.58, fade)));
}`;
