export const SOLID_FRAGMENT = `#version 300 es
precision highp float;
uniform vec4 u_color;
out vec4 out_color;
void main() { out_color = u_color; }`;
