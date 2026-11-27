# Dungeon Editor

Select **Dungeon Editor** on the Hack Arena entry screen after signing in, or
open `/tools/dungeon-editor/` directly.
Drag with Freehand to carve floor, or use Circle, Corridor, Rectangle, and Oval
to draw shapes. Hold Shift to snap a corridor or draw a square or circle.
Use Wall roughness to change the shape of the walls across the map. The
Eraser fills floor back in with rock. Use Undo and Redo to adjust recent
edits. Select New for a blank canvas.

Zoom with the wheel or the zoom buttons. Select Pan to drag around a zoomed
map. Fit Map returns to the full view. Player Fit shows the 28 unit player
footprint and reports whether it fits at the cursor. Use Set Start to mark
the player's starting location on open floor. If a later edit blocks that
location, move or clear it before saving.

Enable Grid for an alignment guide and Snap to align shapes, corridors, and
the start to grid intersections. Zoom in to see smaller grid intervals.

Choose Playtest after placing a start to walk through the draft with the Arena
renderer. Back to Editor restores your draft in the same tab. Playtest is a
solo run with no character or bank progression.

Choose **Place Content** to add markers. Place individual props, mobs, chests,
loose items, campfires, a bank, an exit, or ore. Drag to draw a zone, or set its
radius and click. Set a count to place an encounter pack, scatter props, or
distribute ore on nearby walls.
Select a marker from the list to move it, change its settings, or add patrol
waypoints to a mob or mob zone. Grid snapping applies to marker coordinates.

Chests can use the epic chest table, the mob loot table, or a fixed item.
Only chests marked **Allow mimic** can roll a mimic. Playtest reports markers
that the map cannot place, such as ore away from a wall or a mob too close to
the entrance.

**Save** and **Load** use the authenticated Worker API and the `DUNGEONS` KV
namespace. Name a dungeon before saving. To reopen one, choose it from the saved
dungeon list and select Load. Only the configured `DUNGEON_EDITOR_USER_ID` can
access the editor and its saved layouts. KV stores the brush strokes. Saved
dungeons are currently available in the editor.

Wrangler bundles the editor files into the Worker. Layout documents use the
versioned `hack-arena.hand-carved-dungeon` schema.
