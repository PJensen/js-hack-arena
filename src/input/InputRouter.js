// input/InputRouter.js
// Unifies touch dual-stick, keyboard, and mouse into one intent stream.

function normalizeVector(x, y) {
  const len = Math.hypot(x, y);
  if (len < 0.0001) return { x: 0, y: 0, mag: 0, angle: 0 };
  const mag = Math.min(1, len);
  const nx = x / len;
  const ny = y / len;
  return { x: nx * mag, y: ny * mag, mag, angle: Math.atan2(ny, nx) };
}

class Joystick {
  constructor(baseEl, knobEl, markerEl) {
    this.base = baseEl;
    this.knob = knobEl;
    this.marker = markerEl;
    this.radius = baseEl.offsetWidth / 2;

    this.touchId = null;
    this.touchX = 0;
    this.touchY = 0;
    this.x = 0;
    this.y = 0;
    this.mag = 0;
    this.angle = 0;
  }

  get active() {
    return this.touchId !== null;
  }

  recalcRadius() {
    this.radius = this.base.offsetWidth / 2;
  }

  reset() {
    this.touchId = null;
    this.touchX = 0;
    this.touchY = 0;
    this.x = 0;
    this.y = 0;
    this.mag = 0;
    this.angle = 0;
    this.knob.style.transform = 'translate(-50%, -50%)';
    this.marker.style.display = 'none';
  }

  start(touch) {
    this.touchId = touch.identifier;
    this.update(touch);
  }

  update(touch) {
    const rect = this.base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    let dx = touch.clientX - cx;
    let dy = touch.clientY - cy;
    const dist = Math.hypot(dx, dy);

    if (dist > this.radius) {
      dx = (dx / dist) * this.radius;
      dy = (dy / dist) * this.radius;
    }

    const n = normalizeVector(dx / this.radius, dy / this.radius);
    this.x = n.x;
    this.y = n.y;
    this.mag = n.mag;
    this.angle = n.angle;
    this.touchX = touch.clientX;
    this.touchY = touch.clientY;

    this.knob.style.transform = 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px))';
    this.marker.style.left = touch.clientX + 'px';
    this.marker.style.top = touch.clientY + 'px';
    this.marker.style.display = 'block';
  }

  snapshot() {
    return {
      active: this.active,
      touchId: this.touchId,
      touchX: this.touchX,
      touchY: this.touchY,
      x: this.x,
      y: this.y,
      mag: this.mag,
      angle: this.angle,
    };
  }
}

export function createInputRouter({
  leftBase,
  leftKnob,
  leftMarker,
  rightBase,
  rightKnob,
  rightMarker,
  canvas,
  bus,
} = {}) {
  const leftStick = new Joystick(leftBase, leftKnob, leftMarker);
  const rightStick = new Joystick(rightBase, rightKnob, rightMarker);

  const keys = Object.create(null);
  const mouse = {
    active: false,
    x: 0,
    y: 0,
    down: false,
  };

  const output = {
    frame: 0,
    timeMs: 0,
    left: leftStick.snapshot(),
    right: rightStick.snapshot(),
    intent: {
      moveX: 0,
      moveY: 0,
      aimX: 0,
      aimY: 0,
      fire: false,
      sourceMove: 'none',
      sourceAim: 'none',
    },
  };

  const listeners = [];

  const on = (target, type, fn, opts) => {
    target.addEventListener(type, fn, opts);
    listeners.push(() => target.removeEventListener(type, fn, opts));
  };

  const releaseTouches = (touches) => {
    for (const t of touches) {
      if (leftStick.touchId === t.identifier) leftStick.reset();
      if (rightStick.touchId === t.identifier) rightStick.reset();
    }
  };

  const resetAll = () => {
    leftStick.reset();
    rightStick.reset();
    for (const k of Object.keys(keys)) keys[k] = false;
    mouse.active = false;
    mouse.down = false;
  };

  on(document, 'touchstart', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const stick = t.clientX < window.innerWidth / 2 ? leftStick : rightStick;
      if (stick.active === false) stick.start(t);
    }
  }, { passive: false });

  on(document, 'touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (leftStick.touchId === t.identifier) leftStick.update(t);
      if (rightStick.touchId === t.identifier) rightStick.update(t);
    }
  }, { passive: false });

  on(document, 'touchend', (e) => releaseTouches(e.changedTouches));
  on(document, 'touchcancel', (e) => releaseTouches(e.changedTouches));

  on(window, 'keydown', (e) => { keys[e.key.toLowerCase()] = true; });
  on(window, 'keyup', (e) => { keys[e.key.toLowerCase()] = false; });

  on(canvas, 'pointerdown', (e) => {
    mouse.active = true;
    mouse.down = true;
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });

  on(canvas, 'pointermove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    if (mouse.down) mouse.active = true;
  });

  const stopMouse = () => {
    mouse.down = false;
    mouse.active = false;
  };

  on(window, 'pointerup', stopMouse);
  on(window, 'pointercancel', stopMouse);

  on(window, 'blur', () => {
    resetAll();
    if (bus) bus.emit('app.pause', { reason: 'blur' });
  });

  on(document, 'visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      resetAll();
      if (bus) bus.emit('app.pause', { reason: 'hidden' });
    } else {
      if (bus) bus.emit('app.resume', { reason: 'visible' });
    }
  });

  on(window, 'resize', () => {
    leftStick.recalcRadius();
    rightStick.recalcRadius();
  });

  // Spell switching — track slot picks and cycle requests
  let spellSlot = null;   // direct slot pick (0, 1, …) or null
  let spellCycle = 0;     // +1 forward, -1 back, 0 none

  on(window, 'keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === '1') spellSlot = 0;
    else if (k === '2') spellSlot = 1;
    else if (k === 'q' || k === 'tab') { spellCycle += 1; e.preventDefault(); }
  });

  // Zoom via +/- keys and mouse wheel
  let zoomDelta = 0;
  on(window, 'keydown', (e) => {
    if (e.key === '=' || e.key === '+') zoomDelta += 1;
    if (e.key === '-' || e.key === '_') zoomDelta -= 1;
  });
  on(window, 'wheel', (e) => {
    e.preventDefault();
    zoomDelta += e.deltaY < 0 ? 1 : -1;
  }, { passive: false });

  function keyboardMove() {
    let x = 0;
    let y = 0;
    if (keys['a'] || keys['arrowleft']) x -= 1;
    if (keys['d'] || keys['arrowright']) x += 1;
    if (keys['w'] || keys['arrowup']) y -= 1;
    if (keys['s'] || keys['arrowdown']) y += 1;
    const n = normalizeVector(x, y);
    return { x: n.x, y: n.y };
  }

  function keyboardAim() {
    let x = 0;
    let y = 0;
    if (keys['j']) x -= 1;
    if (keys['l']) x += 1;
    if (keys['i']) y -= 1;
    if (keys['k']) y += 1;
    const n = normalizeVector(x, y);
    return { x: n.x, y: n.y, mag: n.mag };
  }

  function mouseAim() {
    const rect = canvas.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const n = normalizeVector(mouse.x - cx, mouse.y - cy);
    return { x: n.x, y: n.y, mag: n.mag };
  }

  function sample(nowMs = performance.now()) {
    const moveKb = keyboardMove();
    const aimKb = keyboardAim();

    let moveX = 0;
    let moveY = 0;
    let sourceMove = 'none';

    if (leftStick.active) {
      moveX = leftStick.x;
      moveY = leftStick.y;
      sourceMove = 'touch-left';
    } else {
      moveX = moveKb.x;
      moveY = moveKb.y;
      sourceMove = (Math.abs(moveX) + Math.abs(moveY)) > 0 ? 'keyboard' : 'none';
    }

    let aimX = 0;
    let aimY = 0;
    let sourceAim = 'none';

    if (rightStick.active) {
      aimX = rightStick.x;
      aimY = rightStick.y;
      sourceAim = 'touch-right';
    } else if (mouse.active) {
      const a = mouseAim();
      aimX = a.x;
      aimY = a.y;
      sourceAim = a.mag > 0.05 ? 'mouse' : 'none';
    } else {
      aimX = aimKb.x;
      aimY = aimKb.y;
      sourceAim = aimKb.mag > 0.05 ? 'keyboard' : 'none';
    }

    const fire = rightStick.active || mouse.down || keys[' '];

    output.frame += 1;
    output.timeMs = nowMs;
    output.left = leftStick.snapshot();
    output.right = rightStick.snapshot();
    output.zoomDelta = zoomDelta;
    zoomDelta = 0;  // drain
    output.spellSlot = spellSlot;
    output.spellCycle = spellCycle;
    spellSlot = null;   // drain
    spellCycle = 0;     // drain
    output.intent = { moveX, moveY, aimX, aimY, fire, sourceMove, sourceAim };

    if (bus) bus.emit('input.sampled', output);

    return output;
  }

  function pulse(ms = 8) {
    if (typeof navigator.vibrate === 'function') {
      navigator.vibrate(ms);
    }
  }

  function destroy() {
    for (const off of listeners.splice(0, listeners.length)) off();
    resetAll();
  }

  function setSpellSlot(slot) {
    spellSlot = slot;
  }

  return {
    sample,
    destroy,
    pulse,
    reset: resetAll,
    _setSpellSlot: setSpellSlot,
    getOutput: () => ({ ...output, left: { ...output.left }, right: { ...output.right }, intent: { ...output.intent } }),
  };
}
