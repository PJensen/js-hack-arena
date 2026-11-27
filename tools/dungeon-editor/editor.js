import { bakeHandCarvedGrid, HAND_CARVED_DUNGEON_SCHEMA, normalizeHandCarvedDungeon } from '../../public/src/rules/geometry/handCarvedDungeon.js';

const starter = {
  schema: HAND_CARVED_DUNGEON_SCHEMA, version: 1, id: 'quarry-sketch',
  name: 'The Quarry · sketch', width: 8000, height: 8000, cellSize: 8,
  strokes: [
    { id: 'entrance', type: 'circle', cx: 1450, cy: 4000, r: 540 },
    { id: 'main-passage', type: 'corridor', ax: 1450, ay: 4000, bx: 4450, by: 4000, r: 220 },
    { id: 'quarry-room', type: 'circle', cx: 5050, cy: 4000, r: 900 },
  ],
};
let layout = structuredClone(starter), brush = 'circle', drawStart = null, preview = null, busy = false;
const svg = document.querySelector('#map'), fieldCanvas = document.querySelector('#field');
const fieldContext = fieldCanvas.getContext('2d', { alpha: false });
const pointFromEvent = (event) => {
  const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
  return point.matrixTransform(svg.getScreenCTM().inverse());
};
const newId = () => crypto.randomUUID().replaceAll('-', '').slice(0, 16);

function strokeMarkup(stroke) {
  if (stroke.type === 'circle') return `<circle class="stroke" cx="${stroke.cx}" cy="${stroke.cy}" r="${stroke.r}"/>`;
  if (stroke.type === 'corridor') return `<line class="stroke" x1="${stroke.ax}" y1="${stroke.ay}" x2="${stroke.bx}" y2="${stroke.by}" stroke-width="${stroke.r * 2}" stroke-linecap="round"/>`;
  return `<rect class="stroke" x="${stroke.x}" y="${stroke.y}" width="${stroke.w}" height="${stroke.h}" rx="18"/>`;
}

function render() {
  const grid = bakeHandCarvedGrid(layout, 32);
  fieldCanvas.width = grid.cols; fieldCanvas.height = grid.rows;
  const pixels = fieldContext.createImageData(grid.cols, grid.rows);
  for (let index = 0; index < grid.moveGrid.length; index++) {
    const clearance = grid.moveGrid[index], pixel = index * 4;
    if (clearance < 12) {
      pixels.data[pixel] = 8; pixels.data[pixel + 1] = 13; pixels.data[pixel + 2] = 18;
    } else {
      const strength = Math.max(0, Math.min(1, clearance / 520));
      pixels.data[pixel] = Math.round(20 + 65 * strength);
      pixels.data[pixel + 1] = Math.round(48 + 135 * strength);
      pixels.data[pixel + 2] = Math.round(45 + 111 * strength);
    }
    pixels.data[pixel + 3] = 255;
  }
  fieldContext.putImageData(pixels, 0, 0);
  svg.innerHTML = `<rect class="room-outline" x="0" y="0" width="8000" height="8000"/>${layout.strokes.map(strokeMarkup).join('')}${preview ? strokeMarkup({ id: 'preview', ...preview }) .replace('class="stroke"', 'class="preview-stroke"') : ''}`;
  document.querySelector('#dungeonTitle').textContent = layout.name;
  document.querySelector('#name').value = layout.name;
  document.querySelector('#dungeonId').value = layout.id;
  document.querySelector('#strokeCount').textContent = `(${layout.strokes.length})`;
  document.querySelector('#strokeList').replaceChildren(...layout.strokes.slice().reverse().map((stroke, reverseIndex) => {
    const item = document.createElement('div'); item.className = 'stroke-row';
    const label = document.createElement('span'); label.textContent = strokeLabel(stroke);
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Undo'; remove.setAttribute('aria-label', `Remove ${strokeLabel(stroke)}`);
    remove.addEventListener('click', () => { layout.strokes.splice(layout.strokes.length - 1 - reverseIndex, 1); render(); });
    item.append(label, remove); return item;
  }));
}

function strokeLabel(stroke) {
  return stroke.type === 'circle' ? `Room · radius ${Math.round(stroke.r)}`
    : stroke.type === 'corridor' ? `Corridor · width ${Math.round(stroke.r * 2)}`
    : `Rectangle · ${Math.round(stroke.w)} × ${Math.round(stroke.h)}`;
}

function makeStroke(type, start, end, radius) {
  if (type === 'circle') return { id: newId(), type, cx: Math.round(start.x), cy: Math.round(start.y), r: radius };
  if (type === 'corridor') return { id: newId(), type, ax: Math.round(start.x), ay: Math.round(start.y), bx: Math.round(end.x), by: Math.round(end.y), r: radius };
  const x = Math.min(start.x, end.x), y = Math.min(start.y, end.y);
  return { id: newId(), type, x: Math.round(x), y: Math.round(y), w: Math.max(8, Math.round(Math.abs(end.x - start.x))), h: Math.max(8, Math.round(Math.abs(end.y - start.y))) };
}

svg.addEventListener('pointerdown', (event) => {
  if (busy) return;
  drawStart = pointFromEvent(event); svg.setPointerCapture(event.pointerId);
  const radius = Number(document.querySelector('#brushSize').value);
  if (brush === 'circle') {
    layout.strokes.push(makeStroke(brush, drawStart, drawStart, radius)); drawStart = null; render();
  }
});
svg.addEventListener('pointermove', (event) => {
  if (!drawStart) return;
  const radius = Number(document.querySelector('#brushSize').value);
  preview = makeStroke(brush, drawStart, pointFromEvent(event), radius); render();
});
svg.addEventListener('pointerup', (event) => {
  if (!drawStart) return;
  const end = pointFromEvent(event), radius = Number(document.querySelector('#brushSize').value);
  const stroke = makeStroke(brush, drawStart, end, radius);
  if (brush === 'corridor' && Math.hypot(stroke.bx - stroke.ax, stroke.by - stroke.ay) < 12) {
    stroke.bx += 1;
  } else if (brush === 'rect' && (stroke.w < 20 || stroke.h < 20)) {
    drawStart = null; preview = null; render(); return;
  }
  layout.strokes.push(stroke); drawStart = null; preview = null; render();
});
svg.addEventListener('pointercancel', () => { drawStart = null; preview = null; render(); });

document.querySelectorAll('[data-brush]').forEach((button) => button.addEventListener('click', () => {
  brush = button.dataset.brush;
  document.querySelectorAll('[data-brush]').forEach((item) => item.classList.toggle('active', item === button));
}));
document.querySelector('#brushSize').addEventListener('input', (event) => {
  document.querySelector('#sizeLabel').textContent = event.target.value;
});
document.querySelector('#undo').addEventListener('click', () => { layout.strokes.pop(); render(); });
document.querySelector('#name').addEventListener('input', (event) => {
  layout.name = event.target.value.slice(0, 80); document.querySelector('#dungeonTitle').textContent = layout.name;
});
document.querySelector('#dungeonId').addEventListener('input', (event) => {
  const id = event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 48);
  if (id && /^[a-z0-9]/.test(id)) layout.id = id;
});

async function requestJson(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}
async function refreshSavedLayouts(selectId = '') {
  const { dungeons } = await requestJson('/api/editor/dungeons');
  const select = document.querySelector('#savedLayouts'); select.replaceChildren();
  if (!dungeons.length) {
    const empty = document.createElement('option'); empty.value = ''; empty.textContent = 'No saved dungeons'; select.append(empty); return;
  }
  for (const dungeon of dungeons) {
    const option = document.createElement('option'); option.value = dungeon.id;
    option.textContent = `${dungeon.name} · ${dungeon.id}`; select.append(option);
  }
  select.value = dungeons.some(({ id }) => id === selectId) ? selectId : dungeons[0].id;
}
function setBusy(value) {
  busy = value;
  for (const id of ['save', 'load']) document.querySelector(`#${id}`).disabled = value;
}
function showStatus(message) { document.querySelector('#status').textContent = message; }

document.querySelector('#save').addEventListener('click', async () => {
  if (busy) return;
  setBusy(true);
  showStatus('Saving to the server…');
  try {
    layout.name = document.querySelector('#name').value.trim();
    const enteredId = document.querySelector('#dungeonId').value.trim();
    if (!/^[a-z0-9][a-z0-9_-]{0,47}$/.test(enteredId)) throw new Error('Dungeon ID must start with a letter or number and use only lowercase letters, numbers, _ or -.');
    layout.id = enteredId;
    const value = normalizeHandCarvedDungeon(layout, layout.id);
    const { layout: saved } = await requestJson(`/api/editor/dungeons/${encodeURIComponent(layout.id)}`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value),
    });
    layout = saved; render();
    const select = document.querySelector('#savedLayouts');
    let option = [...select.options].find((item) => item.value === layout.id);
    if (!option) { option = document.createElement('option'); option.value = layout.id; select.append(option); }
    option.textContent = `${layout.name} · ${layout.id}`; select.value = layout.id;
    showStatus(`Saved ${layout.name} to the server.`);
  } catch (error) { showStatus(`Save failed: ${error.message}`); }
  finally { setBusy(false); }
});
document.querySelector('#load').addEventListener('click', async () => {
  if (busy) return;
  const id = document.querySelector('#savedLayouts').value;
  if (!id) { showStatus('Choose a saved dungeon first.'); return; }
  setBusy(true);
  showStatus('Loading from the server…');
  try {
    const { layout: saved } = await requestJson(`/api/editor/dungeons/${encodeURIComponent(id)}`);
    layout = normalizeHandCarvedDungeon(saved, id); render(); showStatus(`Loaded ${layout.name}.`);
  } catch (error) { showStatus(`Load failed: ${error.message}`); }
  finally { setBusy(false); }
});

document.querySelector('#sizeLabel').textContent = document.querySelector('#brushSize').value;
render();
refreshSavedLayouts(starter.id).then(() => showStatus('Ready to carve.')).catch((error) => showStatus(`Could not load saved dungeons: ${error.message}`));
