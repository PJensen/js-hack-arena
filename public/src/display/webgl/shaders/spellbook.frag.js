export const SPELLBOOK_FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
in vec3 v_normal;
in vec3 v_localPosition;
flat in int v_material;
out vec4 out_color;

float stroke(float distanceToLine, float width) {
  float feather = max(fwidth(distanceToLine), 0.02);
  return 1.0 - smoothstep(width, width + feather, abs(distanceToLine));
}

void main() {
  vec3 normal = normalize(v_normal);
  float diffuse = max(0.0, dot(normal, normalize(vec3(-0.5, 0.9, 1.0))));
  vec3 leather = vec3(0.19, 0.30, 0.47);
  vec3 brass = vec3(0.97, 0.69, 0.29);
  vec3 color = leather;

  if (v_material == 1) {
    float page = abs(fract(v_localPosition.y * 0.76) - 0.5);
    float edge = 1.0 - smoothstep(0.08, 0.08 + max(fwidth(page), 0.02), page);
    color = mix(vec3(0.94, 0.82, 0.59), vec3(0.60, 0.42, 0.24), edge * 0.55);
  } else if (v_material == 2) {
    color = brass;
  } else if (v_localPosition.y > 7.3) {
    vec2 cover = abs(v_localPosition.xz - vec2(0.7, 0.0));
    float border = max(cover.x - 7.3, cover.y - 11.1);
    float diamond = cover.x * 1.25 + cover.y - 5.6;
    float inset = max(stroke(border, 0.36), stroke(diamond, 0.6));
    float seal = 1.0 - smoothstep(0.8, 1.6, length(cover));
    color = mix(leather, brass, max(inset, seal));
  }

  out_color = vec4(color * (0.59 + diffuse * 0.41), 1.0);
}`;
