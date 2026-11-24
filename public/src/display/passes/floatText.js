// Combat numbers originate in world space and keep a readable screen-space size.
const BATCH_SECONDS = 0.14;
const MAX_NUMBERS = 96;
const LANES = [0, -1, 1, -2, 2];

export function createFloatTextPass() {
  const numbers = [];

  function add({ x, y, target, amount, incoming = false, periodic = false, killed = false }) {
    if (!Number.isFinite(amount) || amount === 0 || !Number.isFinite(x) || !Number.isFinite(y)) return;

    const healing = amount < 0;
    const nearby = numbers.filter((number) => target == null
      ? number.target == null && number.x === x && number.y === y
      : number.target === target);
    const batch = nearby.find((number) => number.batchAge < BATCH_SECONDS &&
      number.healing === healing && number.periodic === periodic);
    if (batch) {
      batch.amount += Math.abs(amount);
      batch.age = 0;
      batch.killed ||= killed;
      return;
    }

    const lane = LANES.find((lane) => !nearby.some((number) => number.lane === lane && number.age < 0.4)) ?? 0;
    numbers.push({
      x, y, target, lane, healing, incoming, periodic, killed,
      amount: Math.abs(amount), age: 0, batchAge: 0,
      lifetime: healing ? 1.05 : periodic ? 0.72 : 0.92,
    });
    if (numbers.length > MAX_NUMBERS) numbers.shift();
  }

  function step(dt) {
    for (let i = numbers.length - 1; i >= 0; i--) {
      const number = numbers[i];
      number.age += dt;
      number.batchAge += dt;
      if (number.age >= number.lifetime) numbers.splice(i, 1);
    }
  }

  function render(ctx, { view, width, height, ratio, reducedMotion = false }) {
    if (!numbers.length) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const number of numbers) {
      const progress = number.age / number.lifetime;
      const rise = number.healing ? 36 * progress : 42 * (1 - (1 - progress) ** 3);
      const drift = number.lane * (18 + (reducedMotion ? 0 : progress * 7));
      const x = ((number.x - view[0]) / view[2] + 0.5) * width + drift * ratio;
      const y = ((number.y - view[1]) / view[3] + 0.5) * height - (reducedMotion ? 0 : rise * ratio);
      if (x < -45 * ratio || x > width + 45 * ratio || y < -40 * ratio || y > height + 40 * ratio) continue;

      const baseSize = (number.periodic ? 15 : number.healing ? 19 : 21) +
        Math.min(5, Math.log2(1 + number.amount) * 0.85) + (number.killed ? 2 : 0);
      const pop = reducedMotion || number.periodic ? 1 :
        1 + (number.healing ? 0.15 : 0.48) * Math.max(0, 1 - number.age / 0.18) ** 2;
      const value = Math.round(number.amount * 10) / 10;
      const label = (number.healing ? '+' : '−') + value;
      ctx.font = `900 ${Math.round(baseSize * pop * ratio)}px ui-monospace, monospace`;
      ctx.globalAlpha = Math.min(1, (1 - progress) * 2.75);
      ctx.strokeStyle = '#11101a';
      ctx.lineWidth = (number.periodic ? 2.5 : 4) * ratio;
      ctx.strokeText(label, x, y + ratio);
      ctx.strokeText(label, x, y);
      ctx.fillStyle = number.healing ? '#9affae' : number.incoming ? '#ff8f96' : '#ffe594';
      ctx.fillText(label, x, y);
    }
    ctx.restore();
  }

  return { add, step, render };
}
