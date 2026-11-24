# Repository workflow

- Use `README.md` for human-facing project documentation and `AGENTS.md` for agent workflows and verification instructions.
- Commit and push in clear rungs. Each rung should deliver one coherent, reviewable change and pass the checks appropriate to it. For a multi-step task, commit and push each completed rung before moving on. A small task can be one rung.
- The owner gives standing authorization to stage, commit, and push in-scope work to the repository's normal remote and branch, including `origin/main` when it is the intended target. Proceed without routine confirmation unless the task directs otherwise.
- Use the Conventional Commits format and choose the type using [CONTRIBUTING.md](CONTRIBUTING.md#commit-messages).
- Review the exact diff and run checks appropriate to the change before pushing. Include only work you own or that the user explicitly asked you to include. Preserve unrelated work and keep commits focused.
- Follow branch protections and explicit instructions for the task. Ask before force-pushing, rewriting shared history, deleting shared refs, or publishing to an unrelated remote or branch. Report failed checks or a rejected push instead of bypassing safeguards.

# Rendering guidance

## Mob previews

- Open `/?spawn=spider&seed=42` to verify a spider at the entrance in an isolated offline run. The available `spawn` values are `spider`, `goblin`, `wraith`, and `cube`.
- Register new mobs in `public/src/runtime/mobPreview.js` so agents can verify their movement, attacks, and effects directly. Test at phone and desktop sizes.

## Visual effects

- Make the effect visibly happen to its source or target. For Burning, emit rising particles from the actor and cast warm, flickering light onto the nearby floor. For an area hazard, show where the effect begins and where it can reach.
- Give fire, ice, impact, and other effects distinct motion, color, and shape. Reserve generic orbs, discs, and spinning glows for effects whose design calls for those shapes.
- Preserve the player silhouette, combat cues, and readable status at normal gameplay zoom. Check effects in motion on the live renderer at both phone and desktop sizes, including entry, sustained contact, and expiration.

## WebGL shaders

- Keep GLSL source out of renderer orchestration files. Store each shader in its own module under `public/src/display/webgl/shaders/`, using a descriptive filename such as `frostBolt.frag.js` or `projectile.vert.js`.
- A shader module exports GLSL source only, except for intentionally parameterized sources such as the dynamic-light shader. Do not duplicate shader strings in `arenaRenderer.js`.
- Keep WebGL resource setup strict and explicit. When `device.program()` returns a raw `WebGLProgram`, retain that value and pass it directly to `uniform(gl, program, name)` before wrapping it in an object with named locations:

  ```js
  const program = device.program(VERTEX_SOURCE, FRAGMENT_SOURCE);
  const shader = {
    program,
    view: uniform(gl, program, 'u_view'),
    position: uniform(gl, program, 'u_position'),
  };
  ```

- Do not call `uniform()` with `shader.program` until `shader` is actually the wrapper object. Do not use a raw `WebGLProgram` as though it already has a `.program` property.
- Do not wrap shader initialization in `try/catch` fallbacks. A shader compile, link, or uniform-layout failure must fail loudly during renderer initialization so the defect is fixed rather than hidden behind a degraded frame.
- Before handing off a shader change, run `deno check` on the renderer and shader modules plus `deno test tests/webgl_foundation_test.js`.
- For new directional effects, use a dedicated vertex shader with explicit orientation uniforms rather than stretching a circular `drawDisc()` or generic orb. Keep the visual primitive and its shader semantics aligned.

## Authoritative simulation and gameplay invariants

- The Worker/authoritative simulation is the source of truth for gameplay state. Browser configuration is presentation/client setup only; any world rule or encounter configuration must be applied to the Worker as well.
- Keep rules that affect combat, spawning, targeting, safe areas, loot, and lifecycle deterministic and covered by simulation tests. Do not rely on a client-only guard for a server-authoritative rule.
- Preserve existing component and field contracts when extending behavior. In particular, retain `AI.aggroRange` semantics when adding patrols or other unalerted behavior; do not rename or retune an existing gameplay parameter without an explicit design reason.
- Unalerted enemies should remain in authored encounter state (for example, patrol routes or idle groups). Combat initiation must be gated by the existing aggro/sight rules and line of sight, rather than assigning every enemy a player target globally.
- Keep opening-area protection as a simple encounter-placement exclusion radius around the starting spawn. Do not add safe-area arguments to unrelated AI systems; future NPC services such as merchants or trainers can share the starting spawn location without coupling to combat AI.
- Room progression should be finite by default: killing an enemy must not implicitly create another enemy. Any future respawn or encounter director must be explicit, tested, and use authored locations rather than placing enemies beside players.

### General lessons from gameplay changes

- Scope/contract violation: do not rename, retune, or replace an existing gameplay parameter such as `AI.aggroRange` while implementing an adjacent feature. Preserve the contract and make the smallest change that satisfies the request.
- Authority mismatch: when a rule is changed, trace every authoritative construction path. The Worker room simulation, not only the browser/offline simulation, must receive the same world configuration.
- Lifecycle regression: never leave an implicit respawn or replacement path active when the intended encounter is finite. Add a regression test that kills an entity and asserts the population remains reduced.
- Architecture overreach: do not add ad hoc arguments to unrelated systems for one map rule. Prefer the existing domain owner—map geometry for safe rooms, encounter data for placement, and AI fields for AI behavior.
- Simplicity failure: when the requirement is “do not place entities within X radius,” implement that direct distance check before adding map carving, route rewriting, or cross-system state.
- Verification gap: before commit, test the real authority path and inspect runtime population/target state, not just static checks or client behavior. New gameplay behavior needs focused tests for initial state, transition, and terminal state.
