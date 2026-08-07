function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function rgb(hex) {
  const value = String(hex).replace('#', '');
  const expanded = value.length === 3 ? value.split('').map((part) => part + part).join('') : value;
  const number = Number.parseInt(expanded, 16);
  return [(number >> 16 & 255) / 255, (number >> 8 & 255) / 255, (number & 255) / 255];
}

export class ParticlePool {
  constructor(capacity = 4096) {
    this.capacity = capacity;
    this.count = 0;
    for (const name of ['x', 'y', 'vx', 'vy', 'ax', 'ay', 'life', 'lifeMax', 'size0', 'size1', 'r', 'g', 'b', 'a0', 'a1']) {
      this[name] = new Float32Array(capacity);
    }
  }

  spawn(particle) {
    if (this.count >= this.capacity) return false;
    const i = this.count++;
    for (const name of ['x', 'y', 'vx', 'vy', 'ax', 'ay', 'life', 'size0', 'size1', 'r', 'g', 'b', 'a0', 'a1']) {
      this[name][i] = particle[name];
    }
    this.lifeMax[i] = particle.life;
    return true;
  }

  step(dt) {
    let write = 0;
    for (let read = 0; read < this.count; read++) {
      const life = this.life[read] - dt;
      if (life <= 0) continue;
      const vx = this.vx[read] + this.ax[read] * dt;
      const vy = this.vy[read] + this.ay[read] * dt;
      if (write !== read) {
        for (const name of ['x', 'y', 'vx', 'vy', 'ax', 'ay', 'lifeMax', 'size0', 'size1', 'r', 'g', 'b', 'a0', 'a1']) {
          this[name][write] = this[name][read];
        }
      }
      this.vx[write] = vx;
      this.vy[write] = vy;
      this.x[write] += vx * dt;
      this.y[write] += vy * dt;
      this.life[write] = life;
      write++;
    }
    this.count = write;
  }
}

class Emitter {
  constructor(options, seed) {
    Object.assign(this, {
      enabled: true, continuous: true, rate: 12, burstCount: 0,
      angle: -Math.PI / 2, spread: Math.PI / 8,
      speed: 1.2, speedJitter: 0.4, vx: 0, vy: 0, ax: 0, ay: -0.6,
      life: 0.9, lifeJitter: 0.3, size: 0.9, sizeEnd: 0.1,
      color: '#ffa500', alpha0: 0.95, alpha1: 0,
    }, options);
    [this.r, this.g, this.b] = rgb(this.color);
    this.random = makeRng(seed);
    this.accumulator = 0;
    this.didBurst = false;
  }

  step(pool, dt, x, y, originVx = 0, originVy = 0) {
    if (!this.enabled) return;
    let count = 0;
    if (this.continuous && this.rate > 0) {
      this.accumulator += dt * this.rate;
      count = Math.floor(this.accumulator);
      this.accumulator -= count;
    } else if (this.burstCount > 0 && !this.didBurst) {
      count = this.burstCount;
      this.didBurst = true;
      this.enabled = false;
    }
    for (let index = 0; index < count; index++) this.spawn(pool, x, y, originVx, originVy);
  }

  spawn(pool, x, y, originVx, originVy) {
    const speedJitter = Math.max(0, Math.min(1, this.speedJitter));
    const lifeJitter = Math.max(0, Math.min(1, this.lifeJitter));
    const theta = this.angle + (this.random() * 2 - 1) * this.spread;
    const speed = this.speed * (1 - speedJitter * 0.5 + this.random() * speedJitter);
    const life = this.life * (1 - lifeJitter * 0.5 + this.random() * lifeJitter);
    pool.spawn({
      x, y,
      vx: Math.cos(theta) * speed + this.vx + originVx,
      vy: Math.sin(theta) * speed + this.vy + originVy,
      ax: this.ax, ay: this.ay, life,
      size0: this.size, size1: this.sizeEnd,
      r: this.r, g: this.g, b: this.b, a0: this.alpha0, a1: this.alpha1,
    });
  }
}

function hash(value) {
  let result = 2166136261;
  for (const character of String(value)) result = Math.imul(result ^ character.charCodeAt(0), 16777619);
  return result >>> 0;
}

export class ParticleFX {
  constructor({ capacity = 4096, seedBase = 0 } = {}) {
    this.pool = new ParticlePool(capacity);
    this.emitters = new Map();
    this.seedBase = seedBase >>> 0;
  }

  ensureEmitter(key, options) {
    if (!this.emitters.has(key)) this.emitters.set(key, new Emitter(options, this.seedBase ^ hash(key)));
    return this.emitters.get(key);
  }

  removeEmitter(key) { this.emitters.delete(key); }

  step(dt, origins = []) {
    for (const origin of origins) {
      this.emitters.get(origin.key)?.step(this.pool, dt, origin.x, origin.y, origin.vx || 0, origin.vy || 0);
    }
    this.pool.step(dt);
  }

  get diagnostics() {
    return Object.freeze({ active: this.pool.count, capacity: this.pool.capacity, emitters: this.emitters.size });
  }
}

