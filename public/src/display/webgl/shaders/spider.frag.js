export const SPIDER_FRAGMENT = `#version 300 es
precision highp float;
in vec3 v_normal;
flat in vec4 v_tint;
out vec4 out_color;

void main() {
  vec3 normal = normalize(v_normal);
  vec3 light = normalize(vec3(-0.48, 0.85, -0.38));
  vec3 halfVector = normalize(light + vec3(0.0, 0.73, 0.68));
  float diffuse = max(dot(normal, light), 0.0);
  float specular = pow(max(0.0, dot(normal, halfVector)), 19.0);
  float rim = pow(1.0 - max(0.0, dot(normal, vec3(0.0, 0.82, 0.57))), 3.0);
  vec3 shell = v_tint.rgb * (0.46 + 0.62 * diffuse) + vec3(0.26, 0.19, 0.14) * (specular + rim * 0.42);
  out_color = vec4(mix(shell, v_tint.rgb, v_tint.a), 1.0);
}`;
