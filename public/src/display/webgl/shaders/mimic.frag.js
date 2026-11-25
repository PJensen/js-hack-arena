export const MIMIC_FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
in vec3 v_normal;
flat in int v_material;
out vec4 out_color;
void main() {
  vec3 wood = vec3(0.37, 0.17, 0.48);
  vec3 brass = vec3(0.96, 0.71, 0.28);
  vec3 gums = vec3(0.44, 0.035, 0.095);
  vec3 enamel = vec3(1.0, 0.93, 0.76);
  vec3 base = v_material == 0 ? wood : v_material == 1 ? brass
    : v_material == 2 ? gums : enamel;
  vec3 normal = normalize(v_normal);
  float diffuse = max(0.0, dot(normal, normalize(vec3(-0.6, 0.9, 1.0))));
  out_color = vec4(base * (0.48 + diffuse * 0.52), 1.0);
}`;
