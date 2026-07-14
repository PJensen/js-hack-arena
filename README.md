# js-hack-arena

Experimental cooperative cave-delving prototype.

## Runtime Shape

- Static client: `public/index.html`, `public/sw.js`, and browser modules under `public/src/`.
- Cloudflare asset root: `public/`.
- Server runtime: Cloudflare Worker in `worker/index.js`.
- Realtime rooms: Cloudflare Durable Object `GameRoom`, routed through `/ws/:roomId`.
- Shared net contract: `public/src/shared/net/protocol.js`.
- Canonical simulation contract: `public/src/rules/sim/arenaSim.js`.

The client should remain deployable as static assets. Worker code owns server
routes such as `/api/*` and `/ws/*`, then falls back to static asset serving.

## Cloudflare Sketch

`wrangler.toml` is configured for one project containing both pieces:

- `[assets]` serves the static client from `public/`.
- `.assetsignore` keeps Worker/config/test files out of the static upload.
- `GAME_ROOM` binds a Durable Object class for socket-backed game rooms.

Useful routes once running under Wrangler:

- `/api/health` - Worker health check.
- `/api/rooms/default?room=lobby` - returns the room seed and WebSocket URL.
- `/ws/lobby` - upgrades to a room WebSocket.

Rooms are server-seeded. On a Worker-backed connection, `WELCOME` includes the
authoritative room seed and the browser generates cave geometry from that seed.
Static/offline play still falls back to the local seed resolver.

The Durable Object simulates the latest player commands at the canonical 20 Hz
rate and broadcasts authoritative snapshots at 10 Hz. The browser resolves
those snapshots into its ECS world and renders that world; it does not keep a
second peer-state model. Static/offline play constructs the same simulation and
steps it locally.

## Simulation Architecture

`createArenaSimulation()` is the boundary between game rules and runtime hosts.
It owns:

- the seeded ECS `World` and a room-local, explicit rule-system pipeline;
- stable network identities and peer-to-player ownership;
- command validation and application;
- monotonic input acceptance and per-player acknowledgement;
- the simulation tick and fixed-step default;
- authoritative enemies, combat, projectiles, deaths, pickups, terrain hits,
  and deterministic loot rolls;
- versioned snapshot capture, structural revisions, and presentation events.

The browser and Worker are hosts. They may provide clocks, sockets, input
devices, cameras, render effects, and persistence, but they should not implement
movement, combat, spawning, collision, or other gameplay decisions. The network
protocol carries commands and opaque simulation snapshots; it does not define a
parallel player-state schema.

The current canonical ruleset contains player movement and casting, enemy AI,
contact combat, projectile motion and hits, health and death, pickups, terrain
carving facts, and deterministic server-seeded drops. The Worker runs that
pipeline. A network client creates a replica and cannot advance gameplay.

Particles, projectile trails and lights, death bursts, bolt rendering, camera,
remote interpolation, and local movement prediction are client-owned. The
client derives them from authoritative entities and a bounded presentation-event
journal; none can feed results back into combat. Predicted and interpolated
coordinates remain separate from authoritative replica ECS positions.

Snapshot records are keyed by stable simulation identity (`player:<peer-id>`,
`mob:<id>`, `projectile:<id>`, and `item:<id>`), not by a client's local ECS
entity number. Applying a newer structural revision creates, updates, and
removes local entities as needed; stale snapshots are ignored. Revision ordering
is independent of simulation ticks so players joining during the same tick are
visible immediately. This is the reconciliation seam for later local prediction
and replay, deltas, interest management, and persistence.
Every player record includes the last accepted input sequence, so a predicting
client can discard acknowledged inputs before replaying the remainder.

## Commands

```bash
deno task dev
deno task deploy
```

Existing Deno tests can still be run directly:

```bash
deno task test
```

The contract tests cover deterministic replay, authoritative combat and loot,
same-tick multiplayer joins, authority-to-replica events, and interpolation that
does not mutate authoritative state. Add a deterministic scenario whenever a
new gameplay fact enters the server simulation.
