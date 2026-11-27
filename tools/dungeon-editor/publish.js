const source = new URL('./', import.meta.url);
const destination = new URL('../../public/tools/dungeon-editor/', import.meta.url);
await Deno.mkdir(destination, { recursive: true });
for (const file of ['index.html', 'editor.js']) {
  await Deno.copyFile(new URL(file, source), new URL(file, destination));
}
console.log('Dungeon editor copied to public/tools/dungeon-editor/.');
