import { MAX_SAY_LENGTH, normalizeSayText } from '../../shared/net/protocol.js';

const FEED_LIMIT = 8;
const BUBBLE_MS = 4500;

export function createDungeonChat({ root, localPeerId, playerForPeer, onCompose, send }) {
  const log = root.querySelector('#chat-feed');
  const toggle = root.querySelector('#chat-toggle');
  const form = root.querySelector('#chat-form');
  const field = root.querySelector('#chat-message');
  const status = root.querySelector('#chat-status');
  const submit = form.querySelector('button[type="submit"]');
  const bubbles = new Map();
  let pending = false;
  let composing = false;

  field.maxLength = MAX_SAY_LENGTH + '/say '.length;
  root.hidden = false;
  toggle.addEventListener('click', () => setComposing(!composing));
  root.addEventListener('wheel', (e) => e.stopPropagation());
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (pending) return;
    const value = field.value.trim();
    const isCommand = value.startsWith('/');
    if (isCommand && !/^\/say(?:\s|$)/i.test(value)) {
      status.textContent = 'Use /say followed by your message.';
      return;
    }
    const text = normalizeSayText(isCommand ? value.slice(4).trim() : value);
    if (!text) {
      status.textContent = `Enter a message up to ${MAX_SAY_LENGTH} characters.`;
      return;
    }
    if (!send(text)) {
      status.textContent = 'Dungeon chat is disconnected.';
      return;
    }
    status.textContent = '';
    setPending(true);
  });

  function setPending(next) {
    pending = next;
    submit.disabled = next;
    field.readOnly = next;
  }

  function setComposing(next, slash = false) {
    composing = next;
    form.hidden = !next;
    toggle.setAttribute('aria-expanded', String(next));
    root.toggleAttribute('data-composing', next);
    onCompose(next);
    if (next) {
      if (slash && !field.value) field.value = '/';
      field.focus({ preventScroll: true });
      field.setSelectionRange(field.value.length, field.value.length);
    } else {
      field.blur();
      status.textContent = '';
    }
  }

  function handleKey(event) {
    if (event.isComposing || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
    if (composing && event.key === 'Escape') {
      event.preventDefault();
      setComposing(false);
      toggle.focus({ preventScroll: true });
      return;
    }
    if (composing || !['/', 'Enter'].includes(event.key)) return;
    if (event.target.closest?.('input, textarea, [contenteditable], button, a')) return;
    event.preventDefault();
    setComposing(true, event.key === '/');
  }

  function placeAboveKeyboard() {
    const viewport = window.visualViewport;
    if (viewport) {
      root.style.setProperty('--keyboard-inset', `${Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)}px`);
    }
  }

  window.addEventListener('keydown', handleKey, true);
  window.visualViewport?.addEventListener('resize', placeAboveKeyboard);
  window.visualViewport?.addEventListener('scroll', placeAboveKeyboard);

  return {
    receive({ peerId, name, text }) {
      const row = document.createElement('li');
      const speaker = document.createElement('bdi');
      speaker.textContent = name;
      const message = document.createElement('span');
      message.dir = 'auto';
      message.textContent = text;
      row.append(speaker, document.createTextNode(' '), message);
      log.append(row);
      while (log.children.length > FEED_LIMIT) log.firstElementChild.remove();
      log.scrollTop = log.scrollHeight;
      bubbles.set(peerId, { text, expires: performance.now() + BUBBLE_MS });
      if (peerId === localPeerId && pending) {
        setPending(false);
        field.value = '';
        setComposing(false);
      }
    },
    reject(message) {
      setPending(false);
      if (composing) status.textContent = message;
    },
    getBubbles() {
      const now = performance.now();
      const visible = [];
      for (const [peerId, { text, expires }] of bubbles) {
        if (expires <= now) {
          bubbles.delete(peerId);
          continue;
        }
        const id = playerForPeer(peerId);
        if (id != null) visible.push({ id, text });
      }
      return visible;
    },
    isComposing: () => composing,
    dispose() {
      window.removeEventListener('keydown', handleKey, true);
      window.visualViewport?.removeEventListener('resize', placeAboveKeyboard);
      window.visualViewport?.removeEventListener('scroll', placeAboveKeyboard);
    },
  };
}
