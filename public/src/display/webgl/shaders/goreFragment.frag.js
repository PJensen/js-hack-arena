export const GORE_FRAGMENT_FRAGMENT = `#version 300 es
precision highp float;
in vec3 v_normal;
flat in float v_gel;
flat in vec4 v_tint;
out vec4 out_color;
void main() {
  vec3 normal = normalize(v_normal);
  vec3 light = normalize(vec3(-0.45, 0.9, 0.6));
  float diffuse = max(0.0, dot(normal, light));
  float gloss = pow(diffuse, 8.0) * mix(0.25, 0.65, v_gel);
  vec3 color = v_tint.rgb * (0.42 + 0.65 * diffuse) + gloss * vec3(0.7, 0.82, 0.76);
  out_color = vec4(color, v_tint.a);
}`;
