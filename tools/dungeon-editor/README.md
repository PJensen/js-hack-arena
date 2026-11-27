# Dungeon Sketch

Open `index.html` directly in a browser to sketch a room graph. Drag rooms to
position them, connect selected rooms with **Link rooms**, add mob and decor
placements by string key, then save or open a JSON file.

`deno task dev` and `deno task deploy` copy the editor into `public/tools/` so it
is served at `/tools/dungeon-editor/` with the rest of the static assets.

The exported document uses `schema: "hack-arena.dungeon-layout"` and `version: 1`.
Rooms have stable IDs, layout coordinates, a type, a world size, and placements.
Connections refer to room IDs. Placement keys are deliberately plain strings:
the editor does not import the current mob or decoration catalogs, so adding
content does not require changing the layout schema.

This is an authoring prototype. It does not yet generate cave geometry, check
room connectivity or collision, resolve content keys, or load layouts in the
game. The sample layout is a design sketch, not the current Quarry map.
