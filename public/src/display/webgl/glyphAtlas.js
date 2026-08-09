const DEFAULT_GLYPHS = ['?', '@', 'W', 'g', '■', '!', ')', '/', '}', '↑', '⌂', '⚔', '◇', '»', '†', '✊', '🐾', '❄', '→', '⚡', '✦', '☠', '★', '♠'];

/** Rasterize authored glyphs once; frames are subsequently rendered by WebGL. */
export function createGlyphAtlas(device, { glyphs = DEFAULT_GLYPHS, cellSize = 64, columns = 4 } = {}) {
  const unique = [...new Set(glyphs.map(String))];
  const rows = Math.ceil(unique.length / columns);
  const canvas = document.createElement('canvas');
  canvas.width = columns * cellSize;
  canvas.height = rows * cellSize;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create the glyph atlas canvas');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#fff';
  context.font = `bold ${Math.floor(cellSize * 0.62)}px ui-monospace, monospace`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  const frames = new Map();
  unique.forEach((glyph, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    context.fillText(glyph, (column + 0.5) * cellSize, (row + 0.52) * cellSize);
    frames.set(glyph, [column / columns, 1 - (row + 1) / rows, 1 / columns, 1 / rows]);
  });

  const texture = device.textureFromSource(canvas);
  return Object.freeze({
    texture,
    frame(glyph) { return frames.get(String(glyph)) ?? frames.get('?'); },
    glyphs: Object.freeze(unique),
  });
}
