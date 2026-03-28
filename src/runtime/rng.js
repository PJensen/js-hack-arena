// runtime/rng.js

import { createRng, seedFromString } from '../lib/ecs-js/rng.js';

export function parseSeed(raw) {
  const value = String(raw).trim().toLowerCase();
  if (value.startsWith('0x')) {
    const hex = Number.parseInt(value, 16);
    return (Number.isFinite(hex) ? hex : 1) >>> 0;
  }

  const asNum = Number.parseInt(value, 10);
  if (Number.isFinite(asNum) && Number.isInteger(asNum)) return asNum >>> 0;
  return seedFromString(value);
}

export function resolveSeed({
  queryKey = 'seed',
  storageKey = 'js-hack-arena-seed',
  fallbackLabel = 'arena',
} = {}) {
  const url = new URL(window.location.href);
  const querySeed = url.searchParams.get(queryKey);

  let seed;
  let source;

  if (querySeed && querySeed.length > 0) {
    seed = parseSeed(querySeed);
    source = 'query';
  } else {
    const stored = window.localStorage.getItem(storageKey);
    if (stored && stored.length > 0) {
      seed = parseSeed(stored);
      source = 'storage';
    } else {
      seed = seedFromString(fallbackLabel + ':' + Date.now() + ':' + Math.random());
      source = 'generated';
      window.localStorage.setItem(storageKey, String(seed));
    }
  }

  return { seed: seed >>> 0, source };
}

export function createDeterministicRng(seed) {
  return createRng(seed >>> 0);
}
