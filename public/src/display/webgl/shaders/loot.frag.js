export const LOOT_FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
in vec3 v_normal;
in vec3 v_localPosition;
flat in int v_material;
uniform vec3 u_body;
uniform vec3 u_trim;
uniform vec3 u_detail;
uniform float u_gem_polish;
uniform float u_gem_phase;
out vec4 out_color;
void main() {
  vec3 base = v_material == 0 ? u_body : v_material == 1 ? u_trim : u_detail;
  vec3 normal = normalize(v_normal);
  vec3 light = normalize(vec3(-0.6, 0.9, 1.0));
  float diffuse = max(0.0, dot(normal, light));
  vec3 eye = normalize(vec3(-0.45, 0.45, 1.0));
  vec3 halfVector = normalize(light + eye);
  if (u_gem_polish > 0.0) {
    float backlight = max(0.0, dot(normal, normalize(vec3(0.82, -0.28, 0.76))));
    float edge = pow(1.0 - max(0.0, dot(normal, eye)), 3.0);
    float shine = pow(max(0.0, dot(normal, halfVector)), mix(9.0, 40.0, u_gem_polish));
    vec3 gemstone = base * (0.27 + 0.67 * diffuse + 0.45 * backlight);
    gemstone += u_trim * (edge * 0.20 + shine * (0.24 + 0.51 * u_gem_polish));

    // A narrow reflection on the crown, clipped by the actual gem geometry.
    float pulse = pow(max(0.0, sin(u_gem_phase)), 10.0);
    float line = dot(v_localPosition.xz, vec2(0.65, 0.76)) - 6.0 * cos(u_gem_phase);
    float streak = 1.0 - smoothstep(0.45, 2.2, abs(line));
    float crown = smoothstep(0.1, 0.85, normal.y) * smoothstep(6.0, 12.0, v_localPosition.y);
    gemstone += mix(u_trim, vec3(1.0), 0.45) * pulse * streak * crown * u_gem_polish;
    out_color = vec4(gemstone, 1.0);
    return;
  }
  float sheen = pow(max(0.0, dot(normal, halfVector)), 20.0);
  out_color = vec4(base * (0.42 + diffuse * 0.58) + sheen * 0.27, 1.0);
}`;
