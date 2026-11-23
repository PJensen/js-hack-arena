export const LOOT_FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
in vec3 v_normal;
flat in int v_material;
uniform vec3 u_body;
uniform vec3 u_trim;
uniform vec3 u_detail;
out vec4 out_color;
void main() {
  vec3 base = v_material == 0 ? u_body : v_material == 1 ? u_trim : u_detail;
  vec3 normal = normalize(v_normal);
  vec3 light = normalize(vec3(-0.6, 0.9, 1.0));
  float diffuse = max(0.0, dot(normal, light));
  vec3 halfVector = normalize(light + normalize(vec3(-0.45, 0.45, 1.0)));
  float sheen = pow(max(0.0, dot(normal, halfVector)), 20.0);
  out_color = vec4(base * (0.42 + diffuse * 0.58) + sheen * 0.27, 1.0);
}`;
