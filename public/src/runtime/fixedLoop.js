// runtime/fixedLoop.js

export function createFixedTickLoop({
  tickHz = 60,
  maxFrameDt = 0.1,
  maxStepsPerFrame = 8,
  simulate,
  render,
  onStats,
  request = (cb) => requestAnimationFrame(cb),
  cancel = (id) => cancelAnimationFrame(id),
  now = () => performance.now(),
}) {
  const fixedDt = 1 / tickHz;

  let running = false;
  let rafId = null;
  let last = 0;
  let acc = 0;

  const stats = {
    tickHz,
    fixedDt,
    frame: 0,
    simTick: 0,
    fps: 0,
    frameDt: 0,
    alpha: 0,
    droppedFrames: 0,
  };

  function frame(ts) {
    if (running === false) return;
    rafId = request(frame);

    const nowMs = typeof ts === 'number' ? ts : now();
    let dt = (nowMs - last) / 1000;
    last = nowMs;

    if (dt > maxFrameDt) {
      dt = maxFrameDt;
      stats.droppedFrames += 1;
    }

    stats.frame += 1;
    stats.frameDt = dt;
    stats.fps = dt > 0 ? (1 / dt) : stats.fps;

    acc += dt;
    let steps = 0;
    while (acc >= fixedDt && steps < maxStepsPerFrame) {
      simulate(fixedDt, stats.simTick);
      stats.simTick += 1;
      acc -= fixedDt;
      steps += 1;
    }

    if (steps >= maxStepsPerFrame && acc >= fixedDt) {
      // keep loop responsive after hitches
      acc = 0;
      stats.droppedFrames += 1;
    }

    stats.alpha = acc / fixedDt;
    render(stats.alpha, dt, nowMs, stats);

    if (typeof onStats === 'function') onStats({ ...stats });
  }

  function start() {
    if (running) return;
    running = true;
    last = now();
    rafId = request(frame);
  }

  function stop() {
    if (running === false) return;
    running = false;
    if (rafId !== null) {
      cancel(rafId);
      rafId = null;
    }
  }

  return {
    start,
    stop,
    isRunning: () => running,
    getStats: () => ({ ...stats }),
    stepNow: () => {
      simulate(fixedDt, stats.simTick);
      stats.simTick += 1;
      render(0, fixedDt, now(), stats);
    }
  };
}
