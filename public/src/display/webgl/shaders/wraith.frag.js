export const WRAITH_FRAGMENT = `#version 300 es
precision highp float;
in vec3 v_color;
in vec3 v_normal;
in float v_opacity;
in float v_glow;
out vec4 out_color;

void main() {
  vec3 normal = normalize(v_normal);
  vec3 light = normalize(vec3(-0.58, 0.85, -0.28));
  vec3 camera = normalize(vec3(0.0, 1.0, 0.82));
  float diffuse = max(0.0, dot(normal, light));
  float rim = pow(1.0 - abs(dot(normal, camera)), 2.0);
  vec3 violet = vec3(0.68, 0.36, 1.0);
  vec3 color = v_color * (0.72 + diffuse * 0.47) + violet * (0.21 * rim * v_color.b + v_glow * 0.49);
  out_color = vec4(color, v_opacity);
}`;
