// display/camera/shake.js

export function createShakeState() {
  return {
    ttl: 0,
    amp: 0,
    freq: 0,
    seed: 0,
    t: 0,
  };
}

export function startShake(shake, {
  amplitude = 6,
  duration = 0.2,
  frequency = 42,
  seed = Math.random() * 1000,
} = {}) {
  shake.ttl = Math.max(shake.ttl, duration);
  shake.amp = Math.max(shake.amp, amplitude);
  shake.freq = frequency;
  shake.seed = seed;
  shake.t = 0;
}

export function updateShake(cam, shake, dt) {
  cam.shakeX = 0;
  cam.shakeY = 0;

  if (shake.ttl <= 0) return;

  shake.ttl -= dt;
  shake.t += dt;

  const life = Math.max(0, shake.ttl);
  const decay = Math.min(1, life / Math.max(0.0001, life + dt));
  const amp = shake.amp * decay;

  const w = shake.freq * shake.t;
  cam.shakeX = Math.sin(w + shake.seed) * amp;
  cam.shakeY = Math.cos(w * 0.91 + shake.seed * 1.7) * amp;

  if (shake.ttl <= 0.0001) {
    shake.ttl = 0;
    shake.amp = 0;
    cam.shakeX = 0;
    cam.shakeY = 0;
  }
}
