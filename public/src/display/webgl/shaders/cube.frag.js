export const CUBE_FRAGMENT = `#version 300 es
precision highp float;
uniform float u_time;
uniform float u_alpha;
in vec3 v_normal;
in vec3 v_local;
in vec2 v_uv;
out vec4 out_color;
float bubble(vec2 p, vec2 center, float radius) {
  return 1.0 - smoothstep(radius - 0.025, radius + 0.025, length(p - center));
}
void main() {
  vec3 normal = normalize(v_normal);
  vec3 light = normalize(vec3(-0.45, 0.85, 0.75));
  float diffuse = 0.46 + max(dot(normal, light), 0.0) * 0.54;
  float rim = pow(1.0 - max(dot(normal, vec3(0.0, 0.0, 1.0)), 0.0), 2.0);
  float shimmer = 0.5 + 0.5 * sin(v_local.y * 13.0 + v_local.x * 7.0 + u_time * 2.4);
  vec2 bubbleUv = vec2(v_local.x, v_local.y) * 0.75;
  float bubbles = bubble(bubbleUv, vec2(-0.27, 0.32 + sin(u_time) * 0.05), 0.11)
                + bubble(bubbleUv, vec2(0.28, 0.82 + cos(u_time * 1.3) * 0.05), 0.075)
                + bubble(bubbleUv, vec2(0.08, 0.52 + sin(u_time * 0.7) * 0.07), 0.05);
  vec3 color = mix(vec3(0.018, 0.30, 0.25), vec3(0.18, 0.92, 0.66), shimmer * 0.22 + diffuse * 0.62);
  color += rim * vec3(0.16, 0.5, 0.38) + bubbles * vec3(0.28, 0.62, 0.48);
  out_color = vec4(color, u_alpha * (0.72 + diffuse * 0.18 + bubbles * 0.12));
}`;
