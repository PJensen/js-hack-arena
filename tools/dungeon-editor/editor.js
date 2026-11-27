import {
  HAND_CARVED_DUNGEON_LIMITS,
  HAND_CARVED_DUNGEON_SCHEMA,
  HAND_CARVED_DUNGEON_VERSION,
  HAND_CARVED_PLAYTEST_KEY,
  PLAYER_COLLIDER_RADIUS,
  bakeHandCarvedGrid,
  handCarvedPlayerFits,
  normalizeHandCarvedDungeon,
} from '../../public/src/rules/geometry/handCarvedDungeon.js';
import {
  dungeonPlacementTypes, dungeonItemIds, normalizeDungeonPlacements, PLACEMENT_LIMIT,
} from '../../public/src/rules/data/dungeonPlacements.js';

const byId = (id) => document.getElementById(id);
const [map, name, newButton, save, savedLayouts, load, size, sizeLabel, undo, redo, status] = [
  'map', 'name', 'new', 'save', 'savedLayouts', 'load', 'brushSize', 'sizeLabel', 'undo', 'redo', 'status',
].map(byId);
const brushes = [...document.querySelectorAll('[data-brush]')];
const [roughness, roughnessLabel, fitStatus, clearStart, zoomIn, zoomOut, zoomLevel, resetView] = [
  'roughness', 'roughnessLabel', 'fitStatus', 'clearStart', 'zoomIn', 'zoomOut', 'zoomLevel', 'resetView',
].map(byId);
const [showGrid, snapGrid, gridSize] = ['showGrid', 'snapGrid', 'gridSize'].map(byId);
const playtest = byId('playtest');
const carveFloor = byId('carveFloor'), buildRock = byId('buildRock');
const shapeTools = ['path', 'erase', 'circle', 'corridor', 'rect', 'ellipse'];
const gridTools = ['circle', 'corridor', 'rect', 'ellipse', 'start', 'place'];
const [
  placementPanel, placementKind, placementVariant, placementItem, placementMimic, placementRadius,
  placementCount, placementAction, placedMarkers, updateMarker, clearPatrol, removeMarker,
] = [
  'placements', 'placementKind', 'placementVariant', 'placementItem', 'placementMimic', 'placementRadius',
  'placementCount', 'placementAction', 'placedMarkers', 'updateMarker', 'clearPatrol', 'removeMarker',
].map(byId);
const placementInputs = [placementKind, placementVariant, placementItem, placementMimic, placementRadius, placementCount, placementAction, placedMarkers];
let selectedMarkerId = '';
let shownPlacements;
const committed = document.createElement('canvas');
const roughMap = document.createElement('canvas');
const ctx = map.getContext('2d');
const committedCtx = committed.getContext('2d');
const newId = () => crypto.randomUUID();
const blankLayout = () => ({
  schema: HAND_CARVED_DUNGEON_SCHEMA, version: HAND_CARVED_DUNGEON_VERSION,
  id: newId(), name: '', width: 8000, height: 8000, cellSize: 8, strokes: [],
});

let layout = blankLayout();
let savedVersion = layout;
let history = [];
let undone = [];
let brush = 'path';
let buildMode = false;
let gesture = null;
let cursor = null;
let pointer = null;
let busy = false;
let frame = 0;
let openingPlaytest = false;
let view = { x: 0, y: 0, zoom: 1 };
let roughGeometry = null;
const onScale = (value, min, max) => Math.max(min, Math.min(max, value));

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
  map.width = Math.max(1, Math.round(box.width * devicePixelRatio));
  map.height = Math.max(1, Math.round(box.height * devicePixelRatio));
  if (layout.roughness) {
    if (roughGeometry?.strokes !== layout.strokes || roughGeometry?.roughness !== layout.roughness) {
      const { cols, rows, densityGrid } = bakeHandCarvedGrid(layout, 16);
      roughMap.width = cols;
      roughMap.height = rows;
      const roughCtx = roughMap.getContext('2d');
      const pixels = roughCtx.createImageData(cols, rows);
      for (let i = 0; i < densityGrid.length; i++) {
        // Soften the preview pixel at the wall edge.
        const pixel = i * 4;
        pixels.data[pixel] = 155;
        pixels.data[pixel + 1] = 201;
        pixels.data[pixel + 2] = 158;
        pixels.data[pixel + 3] = onScale(0.5 + densityGrid[i] * 90 / 16, 0, 1) * 255;
      }
      roughCtx.putImageData(pixels, 0, 0);
      roughGeometry = { strokes: layout.strokes, roughness: layout.roughness };
    }
  } else {
    committed.width = map.width;
    committed.height = map.height;
    committedCtx.setTransform(map.width / width, 0, 0, map.height / height, 0, 0);
    for (const stroke of layout.strokes) paint(committedCtx, stroke);
  }
  requestDraw();
}

function requestDraw() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, map.width, map.height);
    const { x, y, zoom } = view;
    ctx.setTransform(zoom, 0, 0, zoom, -x * map.width * zoom, -y * map.height * zoom);
    if (layout.roughness) {
      const tileX = map.width * 16 / layout.width, tileY = map.height * 16 / layout.height;
      ctx.drawImage(roughMap, -tileX / 2, -tileY / 2, tileX * roughMap.width, tileY * roughMap.height);
    } else if (zoom === 1) {
      ctx.drawImage(committed, 0, 0);
    }
    ctx.scale(map.width / layout.width, map.height / layout.height);
    if (!layout.roughness && zoom !== 1) for (const stroke of layout.strokes) paint(ctx, stroke);
    if (gesture && !['pan', 'placement-zone'].includes(gesture.type)) {
      const preview = strokeForGesture(gesture);
      if (preview) paint(ctx, { ...preview, erase: false }, preview.erase ? '#c09077b8' : '#c0e9c3');
    }
    const unit = layout.width / (map.clientWidth * zoom);
    if (showGrid.checked) drawGrid(unit);
    const activeTool = gesture?.type ?? brush;
    if (cursor && !busy && ['path', 'erase', 'circle', 'corridor'].includes(activeTool)) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = (gesture?.fillRock ?? (buildMode || brush === 'erase')) ? '#ffd5bf' : '#f3f6e8';
      ctx.lineWidth = 1.5 * unit;
      ctx.beginPath();
      ctx.arc(cursor.x, cursor.y, gesture?.radius ?? Number(size.value) / 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (cursor && !busy && snapGrid.checked && gridTools.includes(activeTool)) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#f3f6e8';
      ctx.beginPath();
      ctx.arc(cursor.x, cursor.y, 2 * unit, 0, Math.PI * 2);
      ctx.fill();
    }
    if (layout.start) drawPlayer(layout.start, unit, true);
    drawPlacements(unit);
    let fitText = `${layout.width.toLocaleString()} × ${layout.height.toLocaleString()} units · Player diameter ${PLAYER_COLLIDER_RADIUS * 2} units`;
    if (cursor && ['fit', 'start'].includes(activeTool) && !busy) {
      fitText += drawPlayer(cursor, unit) ? ' · Player fits here' : ' · Player does not fit here';
    }
    if (fitStatus.textContent !== fitText) fitStatus.textContent = fitText;
  });
}

function drawGrid(unit) {
  const spacing = Number(gridSize.value);
  let interval = spacing;
  while (interval < unit * 10) interval *= 4;
  const viewLeft = view.x * layout.width, viewTop = view.y * layout.height;
  const viewRight = viewLeft + layout.width / view.zoom;
  const viewBottom = viewTop + layout.height / view.zoom;
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = '#dde7dc50';
  ctx.lineWidth = unit;
  ctx.beginPath();
  for (let x = Math.ceil(viewLeft / interval) * interval; x <= viewRight; x += interval) {
    ctx.moveTo(x, viewTop);
    ctx.lineTo(x, viewBottom);
  }
  for (let y = Math.ceil(viewTop / interval) * interval; y <= viewBottom; y += interval) {
    ctx.moveTo(viewLeft, y);
    ctx.lineTo(viewRight, y);
  }
  ctx.stroke();
}

function drawPlayer(point, unit, start = false) {
  const { x, y } = point;
  const fits = handCarvedPlayerFits(layout, x, y);
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = fits ? '#bafff0' : '#ff8e88';
  ctx.lineWidth = 1.5 * unit;
  ctx.beginPath();
  ctx.arc(x, y, PLAYER_COLLIDER_RADIUS, 0, Math.PI * 2);
  ctx.stroke();
  const guide = Math.max(PLAYER_COLLIDER_RADIUS + 3 * unit, 8 * unit);
  ctx.setLineDash([2 * unit, 3 * unit]);
  ctx.beginPath();
  ctx.arc(x, y, guide, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  if (start) {
    ctx.font = `${12 * unit}px system-ui`;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fillText(fits ? 'START' : 'START BLOCKED', x + guide + 4 * unit, y - 3 * unit);
  }
  return fits;
}

function screenPoint(event) {
  const box = map.getBoundingClientRect();
  return { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height };
}

function mapPoint(point, spacing = 0) {
  const worldX = (view.x + point.x / view.zoom) * layout.width;
  const worldY = (view.y + point.y / view.zoom) * layout.height;
  if (spacing) {
    return {
      x: onScale(Math.round(worldX / spacing), 0, Math.floor(layout.width / spacing)) * spacing,
      y: onScale(Math.round(worldY / spacing), 0, Math.floor(layout.height / spacing)) * spacing,
    };
  }
  return {
    x: Math.round(onScale(worldX, 0, layout.width)),
    y: Math.round(onScale(worldY, 0, layout.height)),
  };
}

function updateCursor() {
  const spacing = gesture?.spacing ?? (snapGrid.checked && gridTools.includes(brush) ? Number(gridSize.value) : 0);
  cursor = pointer ? mapPoint(pointer, spacing) : null;
  return spacing;
}

function strokeForGesture({ id, type, points, start, end, radius, constrain, spacing, fillRock }) {
  const stroke = fillRock ? { id, erase: true } : { id };
  if (points) {
    if (points.length === 1) return { ...stroke, type: 'circle', cx: start.x, cy: start.y, r: radius };
    return { ...stroke, type: 'path', points, r: radius };
  }
  if (type === 'circle') {
    return { ...stroke, type: 'circle', cx: start.x, cy: start.y, r: radius };
  }
  if (type === 'corridor') {
    if (constrain) {
      const dx = end.x - start.x, dy = end.y - start.y;
      const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI / 4;
      // Project onto the snapped line, then clip the length to stay on the map.
      const ux = Math.round(Math.cos(angle)), uy = Math.round(Math.sin(angle));
      const step = spacing || 1;
      const maxX = ux > 0 ? layout.width - start.x : ux < 0 ? start.x : Infinity;
      const maxY = uy > 0 ? layout.height - start.y : uy < 0 ? start.y : Infinity;
      const projected = (dx * ux + dy * uy) / (ux * ux + uy * uy);
      const distance = onScale(Math.round(projected / step), 0, Math.floor(Math.min(maxX, maxY) / step)) * step;
      end = { x: start.x + ux * distance, y: start.y + uy * distance };
    }
    if (start.x === end.x && start.y === end.y) return { ...stroke, type: 'circle', cx: start.x, cy: start.y, r: radius };
    return { ...stroke, type, ax: start.x, ay: start.y, bx: end.x, by: end.y, r: radius };
  }
  if (constrain) {
    const dx = end.x - start.x, dy = end.y - start.y;
    const step = spacing || 1;
    const side = Math.floor(Math.min(Math.max(Math.abs(dx), Math.abs(dy)),
      dx < 0 ? start.x : layout.width - start.x,
      dy < 0 ? start.y : layout.height - start.y) / step) * step;
    end = { x: start.x + (dx < 0 ? -side : side), y: start.y + (dy < 0 ? -side : side) };
  }
  const w = Math.abs(end.x - start.x), h = Math.abs(end.y - start.y);
  if (w < 8 || h < 8) return null;
  return { ...stroke, type, x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), w, h };
}

map.addEventListener('pointerdown', (event) => {
  if (busy || gesture || event.button !== 0) return;
  pointer = screenPoint(event);
  const spacing = updateCursor();
  if (brush === 'fit') {
    requestDraw();
    return;
  }
  if (brush === 'place') {
    if (placementAction.value === 'add' && dungeonPlacementTypes[placementKind.value].zone) {
      gesture = { pointerId: event.pointerId, type: 'placement-zone', start: cursor, end: cursor, spacing };
      map.setPointerCapture(event.pointerId);
      requestDraw();
      return;
    }
    placeAt(cursor);
    return;
  }
  if (brush === 'start') {
    if (handCarvedPlayerFits(layout, cursor.x, cursor.y)) {
      edit({ start: cursor }, false);
      status.textContent = 'Player start placed.';
    } else {
      status.textContent = 'Place the start on floor with enough room for the player.';
    }
    requestDraw();
    return;
  }
  if (brush === 'pan') {
    gesture = { pointerId: event.pointerId, type: 'pan', position: pointer, view };
    map.setPointerCapture(event.pointerId);
    return;
  }
  if (layout.strokes.length >= HAND_CARVED_DUNGEON_LIMITS.maxStrokes) {
    status.textContent = 'This dungeon has reached the stroke limit.';
    return;
  }
  gesture = {
    id: newId(), pointerId: event.pointerId, type: brush,
    radius: Number(size.value) / 2, start: cursor, end: cursor,
    constrain: event.shiftKey, spacing,
    fillRock: buildMode || brush === 'erase',
    points: brush === 'path' || brush === 'erase' ? [cursor] : null,
  };
  map.setPointerCapture(event.pointerId);
  requestDraw();
});

function movePointer(event, finish = false) {
  if (gesture && event.pointerId !== gesture.pointerId) return;
  if (gesture?.type === 'pan') {
    const point = screenPoint(event);
    setView(
      gesture.view.x + (gesture.position.x - point.x) / view.zoom,
      gesture.view.y + (gesture.position.y - point.y) / view.zoom,
      view.zoom,
    );
    return;
  }
  pointer = screenPoint(event);
  updateCursor();
  if (gesture) {
    gesture.end = cursor;
    gesture.constrain = event.shiftKey;
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
  if (gesture.type === 'placement-zone') {
    const { start } = gesture;
    placementRadius.value = zoneRadius(gesture);
    gesture = null;
    if (event.pointerType !== 'mouse') cursor = pointer = null;
    placeAt(start);
    return;
  }
  const stroke = gesture.type === 'pan' ? null : strokeForGesture(gesture);
  gesture = null;
  if (event.pointerType !== 'mouse') cursor = pointer = null;
  if (!stroke) return;
  const pointCount = layout.strokes.reduce((count, item) => count + (item.points?.length ?? 0), 0);
  if (pointCount + (stroke.points?.length ?? 0) > HAND_CARVED_DUNGEON_LIMITS.maxPathPoints) {
    status.textContent = 'This dungeon has reached the freehand detail limit.';
    return;
  }
  edit({ strokes: [...layout.strokes, stroke] });
});
map.addEventListener('pointerleave', () => { cursor = pointer = null; requestDraw(); });
map.addEventListener('lostpointercapture', (event) => {
  if (gesture?.pointerId !== event.pointerId) return;
  gesture = null;
  cursor = pointer = null;
  requestDraw();
});
new ResizeObserver(rebuildMap).observe(map);

function setView(x, y, zoom) {
  view = { x: onScale(x, 0, 1 - 1 / zoom), y: onScale(y, 0, 1 - 1 / zoom), zoom };
  updateCursor();
  zoomLevel.value = `${Number(zoom.toFixed(1))}×`;
  updateButtons();
  requestDraw();
}
function zoomAt(factor, point = { x: 0.5, y: 0.5 }) {
  if (gesture) return;
  const zoom = onScale(view.zoom * factor, 1, 24);
  const delta = 1 / view.zoom - 1 / zoom;
  setView(view.x + point.x * delta, view.y + point.y * delta, zoom);
}
zoomIn.addEventListener('click', () => zoomAt(1.5));
zoomOut.addEventListener('click', () => zoomAt(1 / 1.5));
resetView.addEventListener('click', () => { if (!gesture) setView(0, 0, 1); });
map.addEventListener('wheel', (event) => {
  if (event.ctrlKey || event.metaKey || !event.deltaY) return;
  event.preventDefault();
  pointer = screenPoint(event);
  zoomAt(event.deltaY < 0 ? 1.2 : 1 / 1.2, pointer);
}, { passive: false });
for (const control of [showGrid, snapGrid, gridSize]) {
  control.addEventListener('change', () => {
    if (control === snapGrid && snapGrid.checked) showGrid.checked = true;
    updateCursor();
    requestDraw();
  });
}

for (const button of brushes) {
  button.addEventListener('click', () => {
    brush = button.dataset.brush;
    if (brush === 'place') placementPanel.open = true;
    updateCursor();
    for (const item of brushes) item.setAttribute('aria-pressed', String(item === button));
    map.style.cursor = brush === 'pan' ? 'grab' : 'crosshair';
    const instructions = {
      fit: 'Move over the map to check the player footprint.',
      start: 'Click open floor to place the player start.',
      pan: 'Drag to move around the zoomed map.',
      corridor: 'Hold Shift to snap to 45° angles.',
      rect: 'Hold Shift to draw a square.',
      ellipse: 'Hold Shift to draw a circle.',
      place: 'Choose a placement type, then click the map.',
    };
    status.textContent = instructions[brush] ?? 'Drag on the canvas to carve a dungeon.';
    updateButtons();
    requestDraw();
  });
}
size.addEventListener('input', () => { sizeLabel.value = size.value; requestDraw(); });
function setBuildMode(value) {
  if (busy || gesture) return;
  buildMode = value;
  if (!shapeTools.includes(brush) || (!value && brush === 'erase')) {
    brushes.find((button) => button.dataset.brush === 'path').click();
  }
  status.textContent = value
    ? 'Draw solid rock to block movement and sight.'
    : 'Draw to carve open floor.';
  updateButtons();
  requestDraw();
}
carveFloor.addEventListener('click', () => setBuildMode(false));
buildRock.addEventListener('click', () => setBuildMode(true));
roughness.addEventListener('input', () => { roughnessLabel.value = `${roughness.value}%`; });
roughness.addEventListener('change', () => {
  const amount = Number(roughness.value);
  if (amount !== (layout.roughness ?? 0)) edit({ roughness: amount });
});
clearStart.addEventListener('click', () => {
  edit({ start: undefined }, false);
  status.textContent = 'Player start cleared.';
});

function hasChanges() {
  return !savedVersion || layout.name !== savedVersion.name
    || (layout.roughness ?? 0) !== (savedVersion.roughness ?? 0)
    || layout.start !== savedVersion.start
    || layout.placements !== savedVersion.placements
    || layout.strokes !== savedVersion.strokes;
}

function geometry() {
  return { strokes: layout.strokes, roughness: layout.roughness, start: layout.start, placements: layout.placements };
}
function edit(changes, rebuild = true) {
  history.push(geometry());
  undone = [];
  layout = { ...layout, ...changes };
  if (rebuild) rebuildMap();
  else requestDraw();
  updateButtons();
}
function updateButtons() {
  for (const input of [name, newButton, savedLayouts, carveFloor, buildRock, ...brushes]) input.disabled = busy;
  const rock = buildMode || brush === 'erase';
  carveFloor.setAttribute('aria-pressed', String(!rock));
  buildRock.setAttribute('aria-pressed', String(rock));
  save.disabled = busy || !layout.name.trim();
  playtest.disabled = busy;
  load.disabled = busy || !savedLayouts.value;
  size.disabled = busy || !['path', 'erase', 'circle', 'corridor'].includes(brush);
  roughness.disabled = busy;
  roughness.value = layout.roughness ?? 0;
  roughnessLabel.value = `${roughness.value}%`;
  clearStart.disabled = busy || !layout.start;
  undo.disabled = busy || !history.length;
  redo.disabled = busy || !undone.length;
  zoomIn.disabled = view.zoom >= 24;
  zoomOut.disabled = resetView.disabled = view.zoom <= 1;
  refreshPlacements();
}
function setBusy(value) {
  busy = value;
  updateButtons();
  requestDraw();
}
function setLayout(value) {
  layout = savedVersion = value;
  name.value = value.name;
  history = [];
  undone = [];
  selectedMarkerId = '';
  placementAction.value = 'add';
  gesture = null;
  cursor = pointer = null;
  setView(0, 0, 1);
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
  undone.push(geometry());
  layout = { ...layout, ...history.pop() };
  rebuildMap();
  updateButtons();
});
redo.addEventListener('click', () => {
  if (gesture) return;
  history.push(geometry());
  layout = { ...layout, ...undone.pop() };
  rebuildMap();
  updateButtons();
});
function placementLabel(value) {
  const labels = { epic: 'Epic chest loot', mob: 'Mob loot table', fixed: 'Fixed item', cave: 'Mixed cave props' };
  return labels[value] ?? value.replaceAll('_', ' ').replace(':', ' · ').replace(/^./, (letter) => letter.toUpperCase());
}

for (const [kind, type] of Object.entries(dungeonPlacementTypes)) placementKind.add(new Option(type.label, kind));
for (const item of dungeonItemIds) placementItem.add(new Option(placementLabel(item), item));

function syncPlacementForm(variant) {
  const type = dungeonPlacementTypes[placementKind.value];
  placementVariant.replaceChildren(...(type.options ?? []).map((id) => new Option(placementLabel(id), id)));
  if (type.options?.includes(variant)) placementVariant.value = variant;
  placementVariant.hidden = !type.options;
  byId('placementRadiusField').hidden = byId('placementCountField').hidden = !type.zone;
  byId('placementMimicField').hidden = placementKind.value !== 'chest';
  byId('placementItemField').hidden = placementKind.value !== 'chest' || placementVariant.value !== 'fixed';
}

function selectedMarker() {
  return layout.placements?.find(({ id }) => id === selectedMarkerId);
}

function refreshPlacements() {
  const selected = selectedMarker();
  if (shownPlacements !== layout.placements) {
    shownPlacements = layout.placements;
    placedMarkers.replaceChildren(new Option('Select a placed marker', ''), ...(layout.placements ?? []).map((marker, i) =>
      new Option(`${i + 1}. ${dungeonPlacementTypes[marker.kind].label}${marker.variant ? ` · ${placementLabel(marker.variant)}` : ''}`, marker.id)));
  }
  placedMarkers.value = selected?.id ?? '';
  placementAction.options[1].disabled = !selected;
  placementAction.options[2].disabled = !dungeonPlacementTypes[selected?.kind]?.patrol;
  if (placementAction.selectedOptions[0]?.disabled) placementAction.value = 'add';
  for (const input of placementInputs) input.disabled = busy;
  updateMarker.disabled = removeMarker.disabled = busy || !selected;
  clearPatrol.disabled = busy || !selected?.patrol?.length;
}

function readPlacement(id, point, previous) {
  const kind = placementKind.value;
  const type = dungeonPlacementTypes[kind];
  return {
    id, ...point, kind, variant: placementVariant.value,
    ...(type.zone && { radius: Number(placementRadius.value), count: Number(placementCount.value) }),
    ...(kind === 'chest' && { item: placementItem.value, mimic: placementMimic.checked }),
    ...(type.patrol && previous?.patrol && { patrol: previous.patrol }),
  };
}

function changeMarker(marker, remove = false) {
  try {
    const markers = [...(layout.placements ?? [])];
    const index = markers.findIndex(({ id }) => id === marker.id);
    if (remove) markers.splice(index, 1);
    else if (index < 0) markers.push(marker);
    else markers[index] = marker;
    const placements = normalizeDungeonPlacements(markers, layout);
    selectedMarkerId = remove ? '' : marker.id;
    edit({ placements }, false);
    status.textContent = remove ? 'Placement removed.' : 'Placement updated.';
  } catch (error) {
    status.textContent = error.message;
  }
}

function placeAt(point) {
  const selected = selectedMarker();
  if (placementAction.value === 'move' && selected) {
    changeMarker({ ...selected, ...point });
  } else if (placementAction.value === 'patrol' && selected) {
    changeMarker({ ...selected, patrol: [...(selected.patrol ?? []), point] });
  } else if ((layout.placements?.length ?? 0) < PLACEMENT_LIMIT) {
    changeMarker(readPlacement(newId(), point));
  } else {
    status.textContent = 'This dungeon has reached the placement limit.';
  }
}

function zoneRadius(drag) {
  const distance = Math.hypot(drag.end.x - drag.start.x, drag.end.y - drag.start.y);
  const threshold = layout.width / (map.clientWidth * view.zoom) * 5;
  return distance > threshold ? onScale(Math.round(distance), 32, 1200) : Number(placementRadius.value);
}

function drawPlacements(unit) {
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineWidth = 1.5 * unit;
  ctx.font = `${10 * unit}px system-ui`;
  for (const { id, x, y, radius, kind, patrol } of layout.placements ?? []) {
    const selected = id === selectedMarkerId;
    const color = selected ? '#ffffff' : kind.startsWith('mob') ? '#ff9c97' : '#f9d281';
    ctx.strokeStyle = color;
    ctx.fillStyle = '#202528';
    ctx.beginPath();
    ctx.arc(x, y, radius ?? 4 * unit, 0, Math.PI * 2);
    if (!radius) ctx.fill();
    ctx.stroke();
    if (selected || unit < 5) {
      ctx.fillStyle = color;
      ctx.fillText(dungeonPlacementTypes[kind].label, x + 7 * unit, y - 4 * unit);
    }
    if (patrol?.length) {
      ctx.setLineDash([3 * unit, 3 * unit]);
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (const point of patrol) ctx.lineTo(point.x, point.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  const drag = gesture?.type === 'placement-zone' ? gesture : null;
  const radius = drag ? zoneRadius(drag) : Number(placementRadius.value);
  if (brush === 'place' && cursor && placementAction.value === 'add' && dungeonPlacementTypes[placementKind.value]?.zone && radius > 0) {
    const { x, y } = drag?.start ?? cursor;
    ctx.strokeStyle = '#f9d28190';
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
}

placementKind.addEventListener('change', () => { syncPlacementForm(); requestDraw(); });
placementVariant.addEventListener('change', () => syncPlacementForm(placementVariant.value));
placementRadius.addEventListener('input', requestDraw);
placementAction.addEventListener('change', requestDraw);
placedMarkers.addEventListener('change', () => {
  selectedMarkerId = placedMarkers.value;
  const marker = selectedMarker();
  placementAction.value = marker ? 'move' : 'add';
  if (marker) {
    placementKind.value = marker.kind;
    syncPlacementForm(marker.variant);
    placementMimic.checked = marker.mimic === true;
    if (marker.item) placementItem.value = marker.item;
    if (marker.radius) placementRadius.value = marker.radius;
    if (marker.count) placementCount.value = marker.count;
  }
  refreshPlacements();
  requestDraw();
});
updateMarker.addEventListener('click', () => {
  const marker = selectedMarker();
  if (marker) changeMarker(readPlacement(marker.id, { x: marker.x, y: marker.y }, marker));
});
clearPatrol.addEventListener('click', () => {
  const marker = selectedMarker();
  if (marker) changeMarker({ ...marker, patrol: [] });
});
removeMarker.addEventListener('click', () => {
  const marker = selectedMarker();
  if (marker) changeMarker(marker, true);
});
syncPlacementForm();

window.addEventListener('keydown', (event) => {
  if ((!event.ctrlKey && !event.metaKey) || gesture) return;
  const key = event.key.toLowerCase();
  if (key === 's') {
    event.preventDefault();
    save.click();
    return;
  }
  if (key !== 'z' || event.target === name) return;
  event.preventDefault();
  (event.shiftKey ? redo : undo).click();
});
window.addEventListener('beforeunload', (event) => {
  if (openingPlaytest || !hasChanges()) return;
  event.preventDefault();
  event.returnValue = true;
});
window.addEventListener('pageshow', () => { openingPlaytest = false; });

playtest.addEventListener('click', () => {
  if (gesture) return;
  try {
    if (!layout.start) throw new Error('Set a player start first.');
    const draft = normalizeHandCarvedDungeon({ ...layout, name: layout.name.trim() || 'Untitled Dungeon' });
    sessionStorage.setItem(HAND_CARVED_PLAYTEST_KEY, JSON.stringify({
      layout: draft, name: layout.name, dirty: hasChanges(),
    }));
    openingPlaytest = true;
    const [seed] = crypto.getRandomValues(new Uint32Array(1));
    location.assign(`/?authoredPlaytest&seed=${seed}`);
  } catch (error) {
    status.textContent = `Could not playtest. ${error.message}`;
  }
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
    layout = savedVersion = { ...saved, ...geometry() };
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
if (new URLSearchParams(location.search).has('resume')) {
  try {
    const handoff = JSON.parse(sessionStorage.getItem(HAND_CARVED_PLAYTEST_KEY));
    const restored = normalizeHandCarvedDungeon(handoff?.layout);
    setLayout({ ...restored, name: typeof handoff.name === 'string' ? handoff.name : restored.name });
    if (handoff.dirty) savedVersion = null;
    status.textContent = 'Returned from playtest.';
  } catch {
    status.textContent = 'No playtest draft to restore.';
  }
  window.history.replaceState(null, '', location.pathname);
}
requestJson('/api/editor/dungeons').then(({ dungeons }) => {
  for (const dungeon of dungeons) {
    if (![...savedLayouts.options].some(({ value }) => value === dungeon.id)) listDungeon(dungeon.id, dungeon.name);
  }
}).catch((error) => {
  if (!busy) status.textContent = `Could not list saved dungeons. ${error.message}`;
});
