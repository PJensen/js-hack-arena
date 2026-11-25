export const MELEE_ARC_FRAGMENT = `#version 300 es
precision highp float;
in vec2 v_blade;
uniform float u_half_angle;
uniform float u_progress;
uniform bool u_rend;
uniform bool u_charging;
out vec4 out_color;

void main() {
  float radius = length(v_blade);
  float angle = atan(v_blade.y, v_blade.x);
  float across = angle / (2.0 * u_half_angle) + 0.5;
  float span = smoothstep(0.0, 0.08, across) * (1.0 - smoothstep(0.92, 1.0, across));
  if (u_charging) {
    float reach = exp(-abs(radius - 1.0) * 52.0) * span;
    float bladeAngle = mix(0.29, 0.13, u_progress);
    float blade = exp(-abs(across - bladeAngle) * 86.0)
      * smoothstep(0.19, 0.32, radius) * (1.0 - smoothstep(0.56, 0.85, radius));
    vec3 edgeColor = u_rend ? vec3(1.0, 0.23, 0.34) : vec3(1.0, 0.64, 0.21);
    vec3 color = mix(edgeColor, vec3(1.0, 0.95, 0.76), blade * (0.4 + 0.6 * u_progress));
    out_color = vec4(color, max(reach * (0.13 + 0.40 * u_progress), blade * (0.38 + 0.55 * u_progress)));
    return;
  }
  float tip = clamp(u_progress * (u_rend ? 4.8 : 2.8) + 0.04, 0.0, 1.0);
  float behindTip = tip - across;
  float sweep = smoothstep(-0.025, 0.055, behindTip);
  float taper = sin(3.14159 * clamp(across, 0.0, 1.0));
  float fade = 1.0 - smoothstep(0.23, 1.0, u_progress);
  float edge;
  float hot;
  float glow;
  vec3 color;
  if (u_rend) {
    // Three offset cuts appear in quick succession along the same swing.
    float outer = radius - (0.94 - 0.29 * pow(abs(across - 0.48), 2.0));
    float middle = radius - (0.76 - 0.48 * pow(abs(across - 0.59), 2.0));
    float inner = radius - (0.58 - 0.73 * pow(abs(across - 0.65), 2.0));
    float cut = min(abs(outer), min(abs(middle) + 0.006, abs(inner) + 0.012));
    edge = 1.0 - smoothstep(0.012, 0.018 + 0.043 * taper, cut);
    hot = exp(-cut * 106.0) * (1.0 - smoothstep(0.18, 0.72, u_progress));
    glow = exp(-cut * 22.0);
    color = mix(vec3(1.0, 0.025, 0.11), vec3(1.0, 0.86, 0.77), hot);
  } else {
    // The bright outer edge leads a tapered, translucent blade trail.
    float leading = 0.96 - 0.22 * (1.0 - taper);
    float blade = radius - leading;
    float width = 0.045 + 0.27 * taper * smoothstep(-0.01, 0.25, behindTip);
    edge = smoothstep(-width, -width * 0.11, blade) * (1.0 - smoothstep(0.0, 0.022, blade));
    hot = exp(-abs(blade) * 58.0);
    glow = exp(-abs(blade + 0.024) * 15.0);
    float afterimage = exp(-abs(blade + 0.14) * 62.0) * taper * 0.22;
    edge = max(edge * 0.8, afterimage);
    color = mix(vec3(1.0, 0.46, 0.08), vec3(1.0, 0.995, 0.86), max(hot, edge * 0.6));
  }
  float alpha = max(edge, max(hot, glow * 0.29)) * span * sweep * fade;
  out_color = vec4(color, alpha);
}`;
