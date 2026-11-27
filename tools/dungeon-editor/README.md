# Dungeon Editor

Open the live editor at `/tools/dungeon-editor/` after signing into Hack Arena.
Drag with Freehand to carve floor, or use Circle, Corridor, Rectangle, and Oval
to draw shapes. The Eraser fills floor back in with rock. Use Undo and Redo to
adjust recent strokes. Select New for a blank canvas.

**Save** and **Load** use the authenticated Worker API and the `DUNGEONS` KV
namespace. Name a dungeon before saving. To reopen one, choose it from the saved
dungeon list and select Load. Only the configured `DUNGEON_EDITOR_USER_ID` can
access the editor and its saved layouts. KV stores the brush strokes. Saved
dungeons are currently available in the editor.

`deno task dev` and `deno task deploy` copy the editor into `public/tools/` so
the Worker can serve it with the app assets. Layout documents use the
versioned `hack-arena.hand-carved-dungeon` schema.
