---
name: icon-atlas
description: Import item icon PNGs into this repository's color, normal, and emissive atlases and keep the manifest aligned.
---

# Item icon atlas

Use this workflow when adding an item or ability icon to `public/assets/icons/`.

1. Keep the square color PNG in `public/assets/icons/wip/` as the source artifact.
2. Check `public/assets/icons/manifest.js` for the intended unique lowercase ID.
3. Run the importer from the repository root:

   ```sh
   deno run -A .agents/skills/icon-atlas/scripts/addIconToAtlas.js <icon_id> <source.png>
   ```

   Optional matching map images can be passed as `--normal <path>` and
   `--emissive <path>`. If omitted, the importer creates a neutral normal tile
   and a black emissive tile.

4. Review the generated icon in all three atlas images and confirm the ID and
   dimensions in `manifest.js`. The script appends entries in row-major order,
   expands the atlas when needed, and rejects duplicate IDs or mismatched maps.
5. Run `deno check .agents/skills/icon-atlas/scripts/addIconToAtlas.js public/assets/icons/manifest.js`
   and `deno test tests/webgl_foundation_test.js`.

Do not edit atlas coordinates by hand: the manifest computes them from each
icon's row-major position. Keep the `wip/` source when importing so the icon can
be regenerated or revised later.
