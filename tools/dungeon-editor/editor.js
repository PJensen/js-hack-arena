const starter = {
  schema: 'hack-arena.dungeon-layout', version: 1,
  id: 'quarry-sketch', name: 'The Quarry · sketch', description: 'A safe entrance leads through a narrow cut into a broad mining chamber.',
  rooms: [
    { id: 'entrance', name: 'Camp entrance', type: 'entrance', x: 190, y: 350, size: 150, placements: [] },
    { id: 'cut', name: 'The cut', type: 'passage', x: 430, y: 350, size: 105, placements: [{ id: 'ore-1', kind: 'decor', key: 'copper_ore' }] },
    { id: 'quarry', name: 'Old quarry', type: 'chamber', x: 700, y: 350, size: 225, placements: [{ id: 'mob-1', kind: 'mob', key: 'goblin_raider' }, { id: 'decor-1', kind: 'decor', key: 'broken_crystal' }] },
  ],
  links: [{ id: 'link-1', from: 'entrance', to: 'cut' }, { id: 'link-2', from: 'cut', to: 'quarry' }],
};
let data = structuredClone(starter), selected = null, linkFrom = null, dragging = null;
const svg = document.querySelector('#map');
const esc = (value) => String(value).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch]);
const roomById = id => data.rooms.find(room => room.id === id);
const uid = prefix => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;

function render() {
  const links = data.links.map(link => {
    const a = roomById(link.from), b = roomById(link.to); if (!a || !b) return '';
    return `<line class="link ${selected?.type === 'link' && selected.id === link.id ? 'selected' : ''}" data-link="${esc(link.id)}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;
  }).join('');
  const rooms = data.rooms.map(room => {
    const r = room.size / 2, active = selected?.type === 'room' && selected.id === room.id;
    const markers = room.placements.map((p, i) => `<circle class="marker" cx="${room.x - r + 18 + (i % 5) * 17}" cy="${room.y + r - 17 - Math.floor(i / 5) * 17}" r="6"><title>${esc(p.kind)}: ${esc(p.key)}</title></circle>`).join('');
    return `<g class="room ${active ? 'selected' : ''}" data-room="${esc(room.id)}"><rect x="${room.x-r}" y="${room.y-r}" width="${room.size}" height="${room.size}"/><text x="${room.x}" y="${room.y-5}">${esc(room.name)}</text><text class="small" x="${room.x}" y="${room.y+15}">${esc(room.type)} · ${room.placements.length} placements</text>${markers}</g>`;
  }).join('');
  svg.innerHTML = `${links}${rooms}`;
  document.querySelector('#name').value = data.name;
  document.querySelector('#description').value = data.description;
  document.querySelector('#roomDetails').hidden = selected?.type !== 'room';
  document.querySelector('#linkDetails').hidden = selected?.type !== 'link';
  document.querySelector('#details').hidden = selected != null;
  if (selected?.type === 'room') renderRoom(roomById(selected.id));
  if (selected?.type === 'link') {
    const link = data.links.find(item => item.id === selected.id);
    document.querySelector('#linkLabel').textContent = `${roomById(link.from)?.name ?? link.from} ↔ ${roomById(link.to)?.name ?? link.to}`;
  }
  document.querySelector('#linkMode').classList.toggle('active', linkFrom != null);
}
function renderRoom(room) {
  if (!room) { selected = null; render(); return; }
  document.querySelector('#roomName').value = room.name;
  document.querySelector('#roomType').value = room.type;
  document.querySelector('#roomSize').value = room.size;
  document.querySelector('#placements').innerHTML = room.placements.map(p => `<div class="row" style="align-items:center;margin-top:7px"><span class="hint" style="flex:1">${esc(p.kind)} · ${esc(p.key)}</span><button data-remove="${esc(p.id)}" aria-label="Remove ${esc(p.key)}">×</button></div>`).join('') || '<p class="hint">No placements yet.</p>';
}
function setStatus(message) { document.querySelector('#status').textContent = message; }

svg.addEventListener('pointerdown', event => {
  const roomNode = event.target.closest('[data-room]'), linkNode = event.target.closest('[data-link]');
  if (linkFrom && roomNode) {
    const id = roomNode.dataset.room;
    if (id !== linkFrom && !data.links.some(link => [link.from, link.to].includes(id) && [link.from, link.to].includes(linkFrom))) data.links.push({ id: uid('link'), from: linkFrom, to: id });
    linkFrom = null; render(); setStatus('Room connection updated.'); return;
  }
  if (roomNode) { selected = { type: 'room', id: roomNode.dataset.room }; dragging = selected.id; svg.setPointerCapture(event.pointerId); render(); }
  else if (linkNode) { selected = { type: 'link', id: linkNode.dataset.link }; render(); }
  else { selected = null; render(); }
});
svg.addEventListener('pointermove', event => {
  if (!dragging) return;
  const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
  const local = point.matrixTransform(svg.getScreenCTM().inverse()), room = roomById(dragging);
  room.x = Math.round(local.x / 10) * 10; room.y = Math.round(local.y / 10) * 10; render();
});
svg.addEventListener('pointerup', () => { dragging = null; });
document.querySelector('#name').addEventListener('input', e => { data.name = e.target.value; });
document.querySelector('#description').addEventListener('input', e => { data.description = e.target.value; });
document.querySelector('#roomName').addEventListener('input', e => { const r = roomById(selected?.id); if(r) { r.name=e.target.value; render(); } });
document.querySelector('#roomType').addEventListener('input', e => { const r = roomById(selected?.id); if(r) { r.type=e.target.value; render(); } });
document.querySelector('#roomSize').addEventListener('input', e => { const r = roomById(selected?.id); if(r) { r.size=Math.max(80,Math.min(600,Number(e.target.value)||80)); render(); } });
document.querySelector('#addRoom').addEventListener('click', () => {
  const id = uid('room'), n = data.rooms.length + 1;
  data.rooms.push({ id, name: `Room ${n}`, type: 'chamber', x: 280 + (n % 3) * 90, y: 180 + (n % 4) * 75, size: 160, placements: [] });
  selected = { type: 'room', id }; render();
});
document.querySelector('#linkMode').addEventListener('click', () => { if (selected?.type !== 'room') { setStatus('Select a room first, then choose Link rooms.'); return; } linkFrom = selected.id; setStatus(`Choose another room to connect to ${roomById(linkFrom).name}.`); render(); });
function addPlacement(kind, input) {
  const room = roomById(selected?.id), key = input.value.trim();
  if (!room || !key) { setStatus('Select a room and enter a content key.'); return; }
  room.placements.push({ id: uid(kind), kind, key }); input.value = ''; render(); setStatus(`${kind} placement added.`);
}
document.querySelector('#addPlacement').addEventListener('click', () => addPlacement('mob', document.querySelector('#placementKey')));
document.querySelector('#addDecor').addEventListener('click', () => addPlacement('decor', document.querySelector('#decorKey')));
document.querySelector('#placements').addEventListener('click', e => {
  const id = e.target.dataset.remove, room = roomById(selected?.id); if (id && room) { room.placements = room.placements.filter(p => p.id !== id); render(); }
});
document.querySelector('#removeLink').addEventListener('click', () => { data.links = data.links.filter(link => link.id !== selected?.id); selected = null; render(); });
document.querySelector('#save').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(data, null, 2) + '\n'], { type:'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = `${data.id || 'dungeon-layout'}.json`; a.click(); URL.revokeObjectURL(url); setStatus('Layout downloaded as JSON.');
});
document.querySelector('#open').addEventListener('click', () => document.querySelector('#file').click());
document.querySelector('#file').addEventListener('change', async e => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const value = JSON.parse(await file.text());
    if (value.schema !== 'hack-arena.dungeon-layout' || value.version !== 1 || !Array.isArray(value.rooms) || !Array.isArray(value.links)) throw new Error('Expected a version 1 Hack Arena dungeon layout.');
    data = value; selected = null; render(); setStatus(`Loaded ${file.name}.`);
  } catch (error) { setStatus(`Could not open file: ${error.message}`); }
  e.target.value = '';
});
render();
