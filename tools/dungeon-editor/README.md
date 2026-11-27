# Cave Carver

Open the live editor at `/tools/dungeon-editor/` after signing into Hack Arena.
Use the Room, Corridor, and Rectangle brushes to draw walkable floor into solid
rock. The background previews the same kind of clearance grid used for actor
collision and A* movement. Undo removes the most recent stroke.

**Save** and **Load** use the authenticated Worker API and the `DUNGEONS` KV
namespace. Only the configured `DUNGEON_EDITOR_USER_ID` can access the editor
and its saved layouts. The layout stores compact brush strokes; it does not
store the baked grid or load itself into live dungeon runs yet.

`deno task dev` and `deno task deploy` copy the editor into `public/tools/` so
the Worker can serve it with the app assets. Layout documents use the
versioned `hack-arena.hand-carved-dungeon` schema.
