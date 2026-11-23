export const MUSHROOM_FRAGMENT = `#version 300 es
precision highp float;
uniform vec3 u_glow;
uniform float u_intensity;
in vec2 v_uv;
out vec4 out_color;

float ellipse(vec2 p, vec2 radii) {
  return 1.0 - smoothstep(0.91, 1.0, length(p / radii));
}

vec4 fungus(vec2 p) {
  float shadow = ellipse(p - vec2(0.0, 0.46), vec2(0.40, 0.13)) * 0.43;
  vec4 color = vec4(0.025, 0.036, 0.039, shadow);
  float stemX = p.x - (p.y - 0.14) * 0.18;
  float stem = ellipse(vec2(stemX, p.y - 0.18), vec2(0.17, 0.34));
  vec3 stalk = vec3(0.18, 0.20, 0.18) + u_glow * (0.16 + 0.16 * u_intensity) * (1.0 - 1.8 * abs(stemX));
  color = mix(color, vec4(stalk, 1.0), stem);

  float rim = ellipse(p - vec2(0.0, -0.15), vec2(0.57, 0.19));
  float ribs = 0.5 + 0.5 * cos(14.0 * atan(p.x, max(0.04, p.y + 0.39)));
  vec3 gills = u_glow * (0.38 + ribs * 0.42) * u_intensity;
  color = mix(color, vec4(gills, 1.0), rim);

  vec2 dome = p - vec2(0.0, -0.25);
  float cap = ellipse(dome, vec2(0.59, 0.42)) * (1.0 - smoothstep(0.02, 0.10, dome.y + 0.21 * p.x * p.x));
  float shading = clamp(0.7 - 0.85 * length(dome - vec2(-0.20, -0.21)), 0.1, 0.7);
  float spots = max(ellipse(p - vec2(-0.25, -0.46), vec2(0.060, 0.047)),
    max(ellipse(p - vec2(0.12, -0.51), vec2(0.046, 0.035)),
      ellipse(p - vec2(0.32, -0.35), vec2(0.077, 0.042))));
  vec3 skin = vec3(0.035, 0.09, 0.12) + u_glow * (shading + spots * 0.64) * u_intensity;
  return mix(color, vec4(skin, 1.0), cap);
}

void main() {
  vec2 p = (v_uv - 0.5) * 2.0;
  vec4 back = fungus((p - vec2(0.46, 0.26)) / 0.63);
  vec4 front = fungus((p - vec2(-0.24, -0.10)) / 0.95);
  float alpha = front.a + back.a * (1.0 - front.a);
  vec3 rgb = (front.rgb * front.a + back.rgb * back.a * (1.0 - front.a)) / max(alpha, 0.001);
  out_color = vec4(rgb, alpha);
}`;
