export const GLYPH_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D u_atlas;
uniform vec4 u_frame;
uniform vec4 u_color;
in vec2 v_uv;
out vec4 out_color;
void main() {
  vec2 uv = u_frame.xy + v_uv * u_frame.zw;
  float alpha = texture(u_atlas, uv).a;
  if (alpha < 0.03) discard;
  out_color = vec4(u_color.rgb, u_color.a * alpha);
}`;
