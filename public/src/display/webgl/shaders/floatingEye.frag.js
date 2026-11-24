export const FLOATING_EYE_FRAGMENT = `#version 300 es
precision highp float;
uniform vec3 u_optic;
uniform float u_charge;
uniform bool u_spore;
in vec3 v_surface;
out vec4 out_color;

void main() {
  vec3 normal = normalize(v_surface);
  vec3 across = normalize(cross(vec3(0.0, 0.0, 1.0), u_optic));
  vec3 up = cross(u_optic, across);
  vec2 iris = vec2(dot(normal, across), dot(normal, up));
  float r = length(iris);
  float front = dot(normal, u_optic);
  float angle = atan(iris.y, iris.x);
  float veins = pow(max(0.0, sin(angle * 11.0 + sin(r * 19.0) * 1.6)), 12.0);
  vec3 color = mix(vec3(0.38, 0.15, 0.40), vec3(0.84, 0.69, 0.82), smoothstep(-0.3, 0.75, front));
  color *= 1.0 - 0.3 * veins * smoothstep(0.48, 0.9, r);

  if (front > 0.0) {
    float fibers = 0.5 + 0.3 * cos(angle * 29.0 + r * 9.0) + 0.2 * sin(angle * 47.0 - r * 11.0);
    vec3 violet = mix(vec3(0.23, 0.04, 0.41), vec3(0.90, 0.28, 1.0), fibers);
    violet *= 1.0 - 0.65 * smoothstep(0.50, 0.66, r);
    violet += u_charge * vec3(0.28, 0.08, 0.34);
    float pupil = length(iris * vec2(1.18, 0.86));
    violet = mix(vec3(0.025, 0.008, 0.05), violet, smoothstep(0.19, 0.23, pupil));
    violet += vec3(1.0, 0.82, 1.0) * u_charge * (1.0 - smoothstep(0.04, 0.22, pupil));
    color = mix(color, violet, 1.0 - smoothstep(0.56, 0.65, r));
  }

  if (u_spore) {
    // Keep the false iris, but let the mottled casing show through it.
    float mottling = sin(normal.x * 19.0 + normal.y * 8.0) * sin(normal.z * 27.0 - normal.y * 10.0);
    vec3 rind = mix(vec3(0.39, 0.25, 0.39), vec3(0.78, 0.71, 0.54), smoothstep(-0.7, 0.8, mottling));
    color = mix(color, rind, 0.58 + 0.14 * mottling);
  }

  vec3 light = normalize(vec3(-0.48, 0.48, 0.73));
  float diffuse = 0.52 + 0.48 * max(0.0, dot(normal, light));
  float glint = pow(max(0.0, dot(normal, normalize(light + vec3(0.0, 0.66, 0.75)))), 76.0);
  out_color = vec4(color * diffuse + glint * vec3(1.0, 0.86, 1.0), 1.0);
}`;
