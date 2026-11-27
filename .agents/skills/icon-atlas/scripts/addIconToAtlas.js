import sharp from 'npm:sharp@0.34.5';

const root = new URL('../../../../public/assets/icons/', import.meta.url);
const manifestUrl = new URL('manifest.js', root);
const atlasFiles = ['icons.png', 'normals.png', 'emissive.png'];
const [id, sourcePath, ...options] = Deno.args;

function usage() {
  console.error('Usage: deno run -A .agents/skills/icon-atlas/scripts/addIconToAtlas.js <icon_id> <source.png> [--normal normal.png] [--emissive emissive.png]');
  Deno.exit(2);
}

if (!id || !/^[a-z][a-z0-9_]*$/.test(id) || !sourcePath) usage();

const supplied = {};
for (let index = 0; index < options.length; index += 2) {
  const key = options[index];
  const value = options[index + 1];
  if (!['--normal', '--emissive'].includes(key) || !value || supplied[key]) usage();
  supplied[key] = value;
}

const manifest = await Deno.readTextFile(manifestUrl);
const namesMatch = manifest.match(/const names = \[([\s\S]*?)\n\];/);
if (!namesMatch) throw new Error('Could not find the icon names array in manifest.js');
if (namesMatch[1].includes(`'${id}'`)) throw new Error(`Icon already exists in atlas: ${id}`);

const columns = Number(manifest.match(/columns: (\d+),/)?.[1]);
const rows = Number(manifest.match(/rows: (\d+),/)?.[1]);
const width = Number(manifest.match(/width: (\d+),/)?.[1]);
const height = Number(manifest.match(/height: (\d+),/)?.[1]);
const count = [...namesMatch[1].matchAll(/'([a-z][a-z0-9_]*)'/g)].length;
if (!columns || !rows || !width || !height || count > columns * rows) {
  throw new Error('Atlas dimensions and manifest entries do not describe a valid rectangular grid');
}

const sources = [sourcePath, supplied['--normal'], supplied['--emissive']];
const inputMeta = await Promise.all(sources.map(async (path) => path ? sharp(path).metadata() : null));
if (inputMeta[0].width !== inputMeta[0].height) throw new Error('Color icon source must be square');
for (const meta of inputMeta.slice(1)) {
  if (meta && (meta.width !== inputMeta[0].width || meta.height !== inputMeta[0].height)) {
    throw new Error('Normal and emissive sources must match the color source dimensions');
  }
}

const column = count % columns;
const row = Math.floor(count / columns);
const nextRows = Math.max(rows, row + 1);
const nextHeight = Math.ceil(width / columns * nextRows);
const left = Math.floor(column * width / columns);
const top = row < rows ? Math.floor(row * height / rows) : height;
const cellWidth = Math.ceil((column + 1) * width / columns) - left;
const cellHeight = row < rows
  ? Math.ceil((row + 1) * height / rows) - top
  : nextHeight - top;
const sourceBuffers = await Promise.all(sources.map(async (path, index) => {
  if (path) return await sharp(path).resize(cellWidth, cellHeight, { fit: 'contain' }).png().toBuffer();
  if (index === 1) {
    return await sharp({ create: { width: cellWidth, height: cellHeight, channels: 3, background: { r: 128, g: 128, b: 255 } } }).png().toBuffer();
  }
  return await sharp({ create: { width: cellWidth, height: cellHeight, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer();
}));

const outputBuffers = await Promise.all(atlasFiles.map(async (file, index) => {
  const current = new URL(file, root);
  const meta = await sharp(current.pathname).metadata();
  if (meta.width !== width || meta.height !== height) throw new Error(`${file} dimensions do not match manifest.js`);
  let pipeline = sharp(current.pathname);
  if (nextHeight > height) {
    pipeline = pipeline.extend({ top: 0, bottom: nextHeight - height, left: 0, right: 0, background: { r: 0, g: 0, b: 0 } });
  }
  const buffer = await pipeline.composite([{ input: sourceBuffers[index], left, top }])
    .flatten({ background: { r: 0, g: 0, b: 0 } })
    .png().toBuffer();
  return { path: current, buffer };
}));

const nextManifest = manifest
  .replace(`rows: ${rows},`, `rows: ${nextRows},`)
  .replace(`height: ${height},`, `height: ${nextHeight},`)
  .replace(namesMatch[0], namesMatch[0].replace(/\n\];$/, `\n  // Row ${nextRows}: newly added icons\n  '${id}',\n];`));

for (const output of outputBuffers) await Deno.writeFile(output.path, output.buffer);
await Deno.writeTextFile(manifestUrl, nextManifest);
console.log(`Added ${id} at column ${column}, row ${row} (${width}×${nextHeight} atlas).`);
