const source = new URL('./', import.meta.url);
const destination = new URL('../../public/tools/dungeon-editor/', import.meta.url);
await Deno.mkdir(destination, { recursive: true });
for (const file of ['index.html', 'editor.js']) {
  if (file === 'editor.js') {
    const content = await Deno.readTextFile(new URL(file, source));
    await Deno.writeTextFile(new URL(file, destination), content.replace('../../public/src/', '../../src/'));
  } else {
    await Deno.copyFile(new URL(file, source), new URL(file, destination));
  }
}
console.log('Dungeon editor copied to public/tools/dungeon-editor/.');
