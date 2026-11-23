// Presentation waveforms inspired by JSHack's temporalPatterns.js. Sample by
// elapsed seconds and source phase so the prop and its light follow each other.
export function torchLight(time, phase) {
  return 0.84 +
    0.15 * Math.sin(time * 1.4 + phase) +
    0.08 * Math.sin(time * 3.1 + phase * 1.7) +
    0.04 * Math.sin(time * 7.9 + phase * 0.6);
}

export function emberLight(time, phase) {
  const cycle = time * 0.23 + phase / (2 * Math.PI);
  const peak = Math.max(0, 1 - Math.abs(cycle - Math.floor(cycle) - 0.76) / 0.15);
  const flare = peak * peak * (3 - 2 * peak);
  return 0.87 + 0.10 * Math.sin(time * 1.07 + phase) +
    0.05 * Math.sin(time * 2.41 + phase * 1.3) + 0.26 * flare;
}

export function biolum(time, phase) {
  const breath = time * 0.86 + phase;
  const tide = 0.5 + 0.5 * Math.sin(time * 0.51 + phase * 0.7);
  return {
    intensity: 0.76 + 0.22 * Math.sin(breath) + 0.06 * Math.sin(breath * 2.3 + 1.1),
    r: 0.14 + 0.09 * tide,
    g: 0.91 - 0.14 * tide,
    b: 0.51 + 0.45 * tide,
  };
}
