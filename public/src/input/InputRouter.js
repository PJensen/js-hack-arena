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

// Return a zero-based spell slot for the top-row or numeric keypad keys.
// Prefer `code` because some browsers report a non-numeric `key` while the
// physical number key is still available (for example with an IME/mobile
// keyboard).
export function spellSlotFromKeyboardEvent(event = {}) {
  const code = String(event.code || '');
  const codeDigit = code.match(/^(?:Digit|Numpad)([1-9])$/)?.[1];
  if (codeDigit) return Number(codeDigit) - 1;
  const key = typeof event.key === 'string' ? event.key : '';
  return /^[1-9]$/.test(key) ? Number(key) - 1 : null;
}

export function keyFromKeyboardEvent(event = {}) {
  if (event.code === 'Space' || event.key === 'Spacebar') return ' ';
  return typeof event.key === 'string' ? event.key.toLowerCase() : '';
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
  canPointerFire = () => true,
  bus,
} = {}) {
  const leftStick = new Joystick(leftBase, leftKnob, leftMarker);
  const rightStick = new Joystick(rightBase, rightKnob, rightMarker);

  const keys = Object.create(null);
  let suspended = false;
  let firePressed = false;
  let rightStickAimed = false;
  let pendingTouchAim = null;
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
      if (rightStick.touchId === t.identifier) {
        rightStick.reset();
        rightStickAimed = false;
      }
    }
  };

  function queueTouchAim() {
    if (rightStick.mag <= 0.1) return;
    if (!rightStickAimed) firePressed = true;
    rightStickAimed = true;
    if (firePressed) pendingTouchAim = { x: rightStick.x, y: rightStick.y };
  }

  function consumeFirePress() {
    firePressed = false;
    pendingTouchAim = null;
  }

  const resetAll = () => {
    leftStick.reset();
    rightStick.reset();
    for (const k of Object.keys(keys)) keys[k] = false;
    mouse.active = false;
    mouse.down = false;
    rightStickAimed = false;
    consumeFirePress();
    // Clear queued actions when focus leaves gameplay.
    spellSlot = null;
    spellCycle = 0;
    pickupPressed = false;
    zoomDelta = 0;
  };

  on(document, 'touchstart', (e) => {
    if (suspended) return;
    e.preventDefault();
    for (const t of e.changedTouches) {
      const stick = t.clientX < window.innerWidth / 2 ? leftStick : rightStick;
      if (stick.active === false) {
        stick.start(t);
        if (stick === rightStick) queueTouchAim();
      }
    }
  }, { passive: false });

  on(document, 'touchmove', (e) => {
    if (suspended) return;
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (leftStick.touchId === t.identifier) leftStick.update(t);
      if (rightStick.touchId === t.identifier) {
        rightStick.update(t);
        queueTouchAim();
      }
    }
  }, { passive: false });

  on(document, 'touchend', (e) => releaseTouches(e.changedTouches));
  on(document, 'touchcancel', (e) => releaseTouches(e.changedTouches));

  on(window, 'keydown', (e) => {
    if (suspended) return;
    const key = keyFromKeyboardEvent(e);
    if (key === ' ' && !keys[key] && !e.repeat) firePressed = true;
    keys[key] = true;
    if (key === ' ') e.preventDefault();
  });
  on(window, 'keyup', (e) => { keys[keyFromKeyboardEvent(e)] = false; });

  on(canvas, 'pointerdown', (e) => {
    if (suspended || e.pointerType === 'touch' || !canPointerFire()) return;
    if (!mouse.down) firePressed = true;
    mouse.active = true;
    mouse.down = true;
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });

  on(canvas, 'pointermove', (e) => {
    if (suspended || e.pointerType === 'touch') return;
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.active = true;
  });

  const stopMouse = (event) => {
    if (event.pointerType !== 'touch') mouse.down = false;
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

  // One-shot keyboard actions
  let spellSlot = null;   // direct slot pick (0, 1, …) or null
  let spellCycle = 0;     // +1 forward, -1 back, 0 none
  let pickupPressed = false;

  on(window, 'keydown', (e) => {
    if (suspended) return;
    if (e.key === ',') {
      if (!e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
        pickupPressed = true;
        e.preventDefault();
      }
      return;
    }
    const slot = spellSlotFromKeyboardEvent(e);
    if (slot != null) {
      spellSlot = slot;
      e.preventDefault();
      return;
    }
    const k = String(e.key || '').toLowerCase();
    if (k === 'q' || k === 'tab') { spellCycle += 1; e.preventDefault(); }
  });

  // Zoom via +/- keys and mouse wheel
  let zoomDelta = 0;
  on(window, 'keydown', (e) => {
    if (suspended) return;
    if (e.key === '=' || e.key === '+') zoomDelta += 1;
    if (e.key === '-' || e.key === '_') zoomDelta -= 1;
  });
  on(window, 'wheel', (e) => {
    if (suspended) return;
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
    const scale = Math.max(48, Math.min(rect.width, rect.height) * 0.24);
    const n = normalizeVector((mouse.x - cx) / scale, (mouse.y - cy) / scale);
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

    if (rightStick.active || pendingTouchAim) {
      const aim = rightStick.mag > 0.1 ? rightStick : pendingTouchAim ?? rightStick;
      aimX = aim.x;
      aimY = aim.y;
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

    const fire = Boolean(rightStickAimed || mouse.down || keys[' '] || firePressed);

    output.frame += 1;
    output.timeMs = nowMs;
    output.left = leftStick.snapshot();
    output.right = rightStick.snapshot();
    output.zoomDelta = zoomDelta;
    zoomDelta = 0;  // drain
    output.spellSlot = spellSlot;
    output.spellCycle = spellCycle;
    output.pickupPressed = pickupPressed;
    output.cancelCast = suspended;
    spellSlot = null;   // drain
    spellCycle = 0;     // drain
    pickupPressed = false;
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
    if (suspended) return;
    const normalized = Number(slot);
    if (Number.isInteger(normalized) && normalized >= 0) spellSlot = normalized;
  }

  return {
    sample,
    requestFire() {
      if (!suspended) firePressed = true;
    },
    consumeFirePress,
    destroy,
    pulse,
    reset: resetAll,
    setSuspended(value) {
      if (suspended === value) return;
      suspended = value;
      resetAll();
    },
    setSpellSlot,
    _setSpellSlot: setSpellSlot,
    getOutput: () => ({ ...output, left: { ...output.left }, right: { ...output.right }, intent: { ...output.intent } }),
  };
}
