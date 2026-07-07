// runtime/eventBus.js
// Lightweight event bus with namespaced channels.

export function createEventBus() {
  const listeners = new Map();

  function on(type, handler) {
    if (listeners.has(type) === false) listeners.set(type, new Set());
    const set = listeners.get(type);
    set.add(handler);
    return () => off(type, handler);
  }

  function once(type, handler) {
    const unsub = on(type, (payload) => {
      unsub();
      handler(payload);
    });
    return unsub;
  }

  function off(type, handler) {
    const set = listeners.get(type);
    if (set === undefined) return;
    set.delete(handler);
    if (set.size === 0) listeners.delete(type);
  }

  function emit(type, payload) {
    const set = listeners.get(type);
    if (set === undefined) return;
    for (const fn of Array.from(set)) {
      try {
        fn(payload);
      } catch (err) {
        console.error('[eventBus] handler failed', type, err);
      }
    }
  }

  function channel(prefix) {
    return {
      on: (name, fn) => on(prefix + '.' + name, fn),
      once: (name, fn) => once(prefix + '.' + name, fn),
      off: (name, fn) => off(prefix + '.' + name, fn),
      emit: (name, payload) => emit(prefix + '.' + name, payload),
    };
  }

  return { on, once, off, emit, channel };
}
