import {
  HAND_CARVED_DUNGEON_LIMITS,
  HAND_CARVED_DUNGEON_SCHEMA,
  HAND_CARVED_DUNGEON_VERSION,
  normalizeHandCarvedDungeon,
} from '../../public/src/rules/geometry/handCarvedDungeon.js';

const byId = (id) => document.getElementById(id);
const [map, name, newButton, save, savedLayouts, load, size, sizeLabel, undo, redo, status] = [
  'map', 'name', 'new', 'save', 'savedLayouts', 'load', 'brushSize', 'sizeLabel', 'undo', 'redo', 'status',
].map(byId);
const brushes = [...document.querySelectorAll('[data-brush]')];
const committed = document.createElement('canvas');
const ctx = map.getContext('2d');
const committedCtx = committed.getContext('2d');
const newId = () => crypto.randomUUID();
const blankLayout = () => ({
  schema: HAND_CARVED_DUNGEON_SCHEMA, version: HAND_CARVED_DUNGEON_VERSION,
  id: newId(), name: '', width: 8000, height: 8000, cellSize: 8, strokes: [],
});

let layout = blankLayout();
let savedVersion = layout;
let undone = [];
let brush = 'path';
let gesture = null;
let cursor = null;
let busy = false;
let frame = 0;

function paint(context, stroke, color = '#9bc99e') {
  context.globalCompositeOperation = stroke.erase ? 'destination-out' : 'source-over';
  context.fillStyle = color;
  context.strokeStyle = color;
  context.beginPath();
  if (stroke.type === 'circle') {
    context.arc(stroke.cx, stroke.cy, stroke.r, 0, Math.PI * 2);
  } else if (stroke.type === 'ellipse') {
    context.ellipse(stroke.x + stroke.w / 2, stroke.y + stroke.h / 2, stroke.w / 2, stroke.h / 2, 0, 0, Math.PI * 2);
  } else if (stroke.type === 'rect') {
    context.rect(stroke.x, stroke.y, stroke.w, stroke.h);
  } else {
    const points = stroke.points ?? [{ x: stroke.ax, y: stroke.ay }, { x: stroke.bx, y: stroke.by }];
    context.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) context.lineTo(point.x, point.y);
    context.lineWidth = stroke.r * 2;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.stroke();
    return;
  }
  context.fill();
}

function rebuildMap() {
  const { width, height } = layout;
  map.style.setProperty('--aspect', width / height);
  const box = map.getBoundingClientRect();
  map.width = committed.width = Math.max(1, Math.round(box.width * devicePixelRatio));
  map.height = committed.height = Math.max(1, Math.round(box.height * devicePixelRatio));
  committedCtx.setTransform(map.width / width, 0, 0, map.height / height, 0, 0);
  for (const stroke of layout.strokes) paint(committedCtx, stroke);
  requestDraw();
}

function requestDraw() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, map.width, map.height);
    ctx.drawImage(committed, 0, 0);
    ctx.setTransform(map.width / layout.width, 0, 0, map.height / layout.height, 0, 0);
    if (gesture) {
      const preview = strokeForGesture(gesture);
      if (preview) paint(ctx, preview, '#c0e9c3');
    }
    if (cursor && !busy && (gesture?.type ?? brush) !== 'rect' && (gesture?.type ?? brush) !== 'ellipse') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = '#f3f6e8';
      ctx.lineWidth = 1.5 * layout.width / map.clientWidth;
      ctx.beginPath();
      ctx.arc(cursor.x, cursor.y, gesture?.radius ?? Number(size.value) / 2, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
}

function mapPoint(event) {
  const box = map.getBoundingClientRect();
  return {
    x: Math.round(Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)) * layout.width),
    y: Math.round(Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)) * layout.height),
  };
}

function strokeForGesture({ id, type, points, start, end, radius }) {
  const operation = type === 'erase' ? { erase: true } : {};
  if (points) {
    if (points.length === 1) return { ...operation, id, type: 'circle', cx: start.x, cy: start.y, r: radius };
    return { ...operation, id, type: 'path', points, r: radius };
  }
  if (type === 'circle' || (type === 'corridor' && start.x === end.x && start.y === end.y)) {
    return { id, type: 'circle', cx: start.x, cy: start.y, r: radius };
  }
  if (type === 'corridor') {
    return { id, type, ax: start.x, ay: start.y, bx: end.x, by: end.y, r: radius };
  }
  const w = Math.abs(end.x - start.x), h = Math.abs(end.y - start.y);
  if (w < 8 || h < 8) return null;
  return { id, type, x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), w, h };
}

map.addEventListener('pointerdown', (event) => {
  if (busy || gesture || event.button !== 0) return;
  if (layout.strokes.length >= HAND_CARVED_DUNGEON_LIMITS.maxStrokes) {
    status.textContent = 'This dungeon has reached the stroke limit.';
    return;
  }
  cursor = mapPoint(event);
  gesture = {
    id: newId(), pointerId: event.pointerId, type: brush,
    radius: Number(size.value) / 2, start: cursor, end: cursor,
    points: brush === 'path' || brush === 'erase' ? [cursor] : null,
  };
  map.setPointerCapture(event.pointerId);
  requestDraw();
});

function movePointer(event, finish = false) {
  if (gesture && event.pointerId !== gesture.pointerId) return;
  cursor = mapPoint(event);
  if (gesture) {
    gesture.end = cursor;
    const points = gesture.points;
    if (points && points.length < HAND_CARVED_DUNGEON_LIMITS.maxPointsPerStroke) {
      const last = points.at(-1);
      if (Math.hypot(cursor.x - last.x, cursor.y - last.y) >= (finish ? 1 : 20)) points.push(cursor);
    }
  }
  requestDraw();
}
map.addEventListener('pointermove', (event) => movePointer(event));
map.addEventListener('pointerup', (event) => {
  if (gesture?.pointerId !== event.pointerId) return;
  movePointer(event, true);
  const stroke = strokeForGesture(gesture);
  gesture = null;
  if (event.pointerType !== 'mouse') cursor = null;
  if (!stroke) return;
  const pointCount = layout.strokes.reduce((count, item) => count + (item.points?.length ?? 0), 0);
  if (pointCount + (stroke.points?.length ?? 0) > HAND_CARVED_DUNGEON_LIMITS.maxPathPoints) {
    status.textContent = 'This dungeon has reached the freehand detail limit.';
    return;
  }
  layout = { ...layout, strokes: [...layout.strokes, stroke] };
  undone = [];
  rebuildMap();
  updateButtons();
});
map.addEventListener('pointerleave', () => { cursor = null; requestDraw(); });
map.addEventListener('lostpointercapture', (event) => {
  if (gesture?.pointerId !== event.pointerId) return;
  gesture = null;
  cursor = null;
  requestDraw();
});
new ResizeObserver(rebuildMap).observe(map);

for (const button of brushes) {
  button.addEventListener('click', () => {
    brush = button.dataset.brush;
    for (const item of brushes) item.setAttribute('aria-pressed', String(item === button));
    updateButtons();
  });
}
size.addEventListener('input', () => { sizeLabel.value = size.value; requestDraw(); });

function hasChanges() {
  return layout.name !== savedVersion.name
    || layout.strokes.length !== savedVersion.strokes.length
    || layout.strokes.some((stroke, index) => stroke !== savedVersion.strokes[index]);
}

function updateButtons() {
  for (const input of [name, newButton, savedLayouts, ...brushes]) input.disabled = busy;
  save.disabled = busy || !layout.name.trim();
  load.disabled = busy || !savedLayouts.value;
  size.disabled = busy || brush === 'rect' || brush === 'ellipse';
  undo.disabled = busy || !layout.strokes.length;
  redo.disabled = busy || !undone.length;
}
function setBusy(value) {
  busy = value;
  updateButtons();
  requestDraw();
}
function setLayout(value) {
  layout = savedVersion = value;
  name.value = value.name;
  undone = [];
  gesture = null;
  cursor = null;
  rebuildMap();
  updateButtons();
}

name.addEventListener('input', () => {
  layout = { ...layout, name: name.value };
  updateButtons();
});
newButton.addEventListener('click', () => {
  if (hasChanges() && !confirm('Discard unsaved changes and start a new dungeon?')) return;
  setLayout(blankLayout());
  status.textContent = 'Drag on the canvas to carve a dungeon.';
  name.focus();
});
undo.addEventListener('click', () => {
  if (gesture) return;
  undone.push(layout.strokes.at(-1));
  layout = { ...layout, strokes: layout.strokes.slice(0, -1) };
  rebuildMap();
  updateButtons();
});
redo.addEventListener('click', () => {
  if (gesture) return;
  layout = { ...layout, strokes: [...layout.strokes, undone.pop()] };
  rebuildMap();
  updateButtons();
});
window.addEventListener('keydown', (event) => {
  if ((!event.ctrlKey && !event.metaKey) || event.key.toLowerCase() !== 'z' || event.target === name || gesture) return;
  event.preventDefault();
  (event.shiftKey ? redo : undo).click();
});
window.addEventListener('beforeunload', (event) => {
  if (!hasChanges()) return;
  event.preventDefault();
  event.returnValue = true;
});

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}
function listDungeon(id, label) {
  let option = [...savedLayouts.options].find((item) => item.value === id);
  if (!option) {
    option = new Option(label, id);
    savedLayouts.add(option);
  }
  option.text = label;
}
savedLayouts.addEventListener('change', updateButtons);
save.addEventListener('click', async () => {
  if (gesture) return;
  setBusy(true);
  status.textContent = 'Saving…';
  try {
    const value = normalizeHandCarvedDungeon(layout, layout.id);
    const { layout: saved } = await requestJson(`/api/editor/dungeons/${layout.id}`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value),
    });
    layout = savedVersion = { ...saved, strokes: layout.strokes };
    name.value = saved.name;
    listDungeon(saved.id, saved.name);
    savedLayouts.value = saved.id;
    status.textContent = `Saved “${saved.name}”.`;
  } catch (error) {
    status.textContent = `Save failed. ${error.message}`;
  } finally {
    setBusy(false);
  }
});
load.addEventListener('click', async () => {
  if (gesture || (hasChanges() && !confirm('Discard unsaved changes and load the selected dungeon?'))) return;
  const id = savedLayouts.value;
  setBusy(true);
  status.textContent = 'Loading…';
  try {
    const { layout: saved } = await requestJson(`/api/editor/dungeons/${encodeURIComponent(id)}`);
    setLayout(normalizeHandCarvedDungeon(saved, id));
    status.textContent = `Loaded “${layout.name}”.`;
  } catch (error) {
    status.textContent = `Load failed. ${error.message}`;
  } finally {
    setBusy(false);
  }
});

setLayout(layout);
requestJson('/api/editor/dungeons').then(({ dungeons }) => {
  for (const dungeon of dungeons) {
    if (![...savedLayouts.options].some(({ value }) => value === dungeon.id)) listDungeon(dungeon.id, dungeon.name);
  }
}).catch((error) => {
  if (!busy) status.textContent = `Could not list saved dungeons. ${error.message}`;
});
