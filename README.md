# js-hack-arena

Experimental cooperative cave-delving prototype.

## Runtime Shape

- Static client: `public/index.html`, `public/sw.js`, and browser modules under `public/src/`.
- Cloudflare asset root: `public/`.
- Server runtime: Cloudflare Worker in `worker/index.js`.
- Realtime rooms: Cloudflare Durable Object `GameRoom`, routed through `/ws/:roomId`.
- Shared net contract: `public/src/shared/net/protocol.js`.

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

The Durable Object currently simulates basic player movement from the latest
input frames on a 20 Hz room tick and broadcasts authoritative player positions
at 10 Hz. The browser still runs local movement immediately for responsiveness;
reconciliation is a later step.

The room also owns the first networked combat slice: deterministic mob spawns,
player frost-bolt projectiles from fire input, projectile wall collision, and
projectile damage against server-owned mobs. These are broadcast as snapshot
entities and drawn as a network overlay by the browser. Snapshot events carry
projectile impacts and mob deaths for synchronized particles/removals.
When connected to a room, the browser disables local AI/combat/projectile
simulation and renders server-owned state to avoid dual simulation drift.

## Commands

```bash
deno task dev
deno task deploy
```

Existing Deno tests can still be run directly:

```bash
deno task test
deno test --allow-read tests/geometry_test.js
```
