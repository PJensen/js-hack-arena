export const GORE_MARK_FRAGMENT = `#version 300 es
precision highp float;
in vec2 v_local;
flat in vec2 v_surface;
flat in vec4 v_tint;
out vec4 out_color;
void main() {
  float radius = length(v_local);
  float angle = atan(v_local.y, v_local.x + 0.00001);
  float edge = 0.78 + 0.09 * sin(5.0 * angle + v_surface.x)
                    + 0.06 * cos(9.0 * angle - v_surface.x);
  float coverage = 1.0 - smoothstep(edge - 0.07, edge + 0.05, radius);
  if (v_surface.y < 0.0) {
    out_color = vec4(v_tint.rgb, (1.0 - smoothstep(0.12, 0.98, radius)) * v_tint.a);
    return;
  }
  float wetEdge = exp(-abs(radius - edge + 0.06) * 17.0) * max(0.0, -v_local.y);
  vec3 color = v_tint.rgb * (0.68 + radius * 0.34)
             + wetEdge * v_surface.y * vec3(0.26, 0.21, 0.24);
  out_color = vec4(color, coverage * v_tint.a);
}`;
