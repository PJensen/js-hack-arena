// rules/data/fxCatalog.js
// Particle effect presets. Display-only data — no logic, no imports.

export const FROST_TRAIL = {
  continuous: true, rate: 40,
  angle: Math.PI, spread: Math.PI,
  speed: 15, speedJitter: 0.8,
  ax: 0, ay: 0,
  life: 0.4, lifeJitter: 0.5,
  size: 6, sizeEnd: 1,
  color: '#8cd8ff',
  alpha0: 0.85, alpha1: 0.0,
};

export const SHADOW_TRAIL = {
  continuous: true, rate: 30,
  angle: Math.PI, spread: Math.PI,
  speed: 12, speedJitter: 0.7,
  ax: 0, ay: 0,
  life: 0.35, lifeJitter: 0.4,
  size: 5, sizeEnd: 1,
  color: '#b060ff',
  alpha0: 0.8, alpha1: 0.0,
};

export function impactBurst(color, angle) {
  return {
    continuous: false, burstCount: 15,
    angle: angle ?? 0, spread: angle != null ? Math.PI * 0.5 : Math.PI,
    speed: 60, speedJitter: 0.5,
    ax: 0, ay: 0,
    life: 0.3, lifeJitter: 0.3,
    size: 4, sizeEnd: 1,
    color,
    alpha0: 0.9, alpha1: 0.0,
  };
}

export function wallBurst(color) {
  return {
    continuous: false, burstCount: 20,
    angle: 0, spread: Math.PI,
    speed: 50, speedJitter: 0.6,
    ax: 0, ay: 0,
    life: 0.35, lifeJitter: 0.4,
    size: 5, sizeEnd: 1,
    color,
    alpha0: 0.9, alpha1: 0.0,
  };
}

export const ARROW_TRAIL = {
  continuous: true, rate: 12,
  angle: Math.PI, spread: 0.3,
  speed: 5, speedJitter: 0.5,
  ax: 0, ay: 0,
  life: 0.12, lifeJitter: 0.3,
  size: 2, sizeEnd: 0.5,
  color: '#c8a050',
  alpha0: 0.4, alpha1: 0.0,
};

export function spellTrail(color) {
  return {
    continuous: true, rate: 40,
    angle: Math.PI, spread: Math.PI,
    speed: 15, speedJitter: 0.8,
    ax: 0, ay: 0,
    life: 0.4, lifeJitter: 0.5,
    size: 6, sizeEnd: 1,
    color,
    alpha0: 0.85, alpha1: 0.0,
  };
}

export function deathBurst(color) {
  return {
    continuous: false, burstCount: 30,
    angle: 0, spread: Math.PI,
    speed: 40, speedJitter: 0.7,
    ax: 0, ay: 0,
    life: 0.5, lifeJitter: 0.4,
    size: 6, sizeEnd: 1,
    color,
    alpha0: 0.9, alpha1: 0.0,
  };
}
