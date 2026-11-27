# Dungeon Editor

Select **Dungeon Editor** on the Hack Arena entry screen after signing in, or
open `/tools/dungeon-editor/` directly.
Drag with Freehand to carve floor, or use Circle, Corridor, Rectangle, and Oval
to draw shapes. Hold Shift to snap a corridor or draw a square or circle.
Choose **Build rock** to use any shape brush for solid walls and pillars
that block movement and sight. Switch back to **Carve floor** to cut openings.
The Eraser is a freehand rock brush. Brush roughness applies to each new
stroke and defaults to 80%. You can see the rough edge while drawing.
Smaller brushes produce finer irregularities. Brush width starts at 128 units.
The editor converts older roughness settings to individual strokes.
Undo and Redo work with every brush mode. **Start Over** asks
for confirmation before opening a blank draft. Saved dungeons stay available.

Choose **Paint water** to add shallow, walkable water with any shape brush.
Choose **Paint lava** for glowing, bubbling pools, or **Paint stone** to
lay fitted crypt flagstones. Paint preserves the underlying layout. Players
take heavy fire damage in lava and keep burning after stepping out.
Creatures leave a wake in water and take double damage from lightning while
standing in it.

Drag two fingers on the touchpad or hold the middle mouse button and drag to
pan. Pinch, turn the mouse wheel, or use the zoom buttons to zoom. If your
browser handles both devices the same way, set **Scroll** to Pan or Zoom.
The initial view is 3.4×. Fit Map
returns to the full view. Position, zoom, and grid controls are remembered
in your browser. Player Fit shows the 28 unit player
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
