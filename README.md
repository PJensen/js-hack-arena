# js-hack-arena

Experimental cooperative cave-delving prototype.

## Runtime Shape

- Static client: `public/index.html`, `public/sw.js`, and browser modules under `public/src/`.
- Cloudflare asset root: `public/`.
- Server runtime: Cloudflare Worker in `worker/index.js`.
- Realtime rooms: Cloudflare Durable Object `GameRoom`, routed through `/ws/:roomId`.
- Shared net contract: `public/src/net/protocol.js`.

The client should remain deployable as static assets. Worker code owns server
routes such as `/api/*` and `/ws/*`, then falls back to static asset serving.

## Cloudflare Sketch

`wrangler.toml` is configured for one project containing both pieces:

- `[assets]` serves the static client from `public/`.
- `.assetsignore` keeps Worker/config/test files out of the static upload.
- `GAME_ROOM` binds a Durable Object class for socket-backed game rooms.

Useful routes once running under Wrangler:

- `/api/health` - Worker health check.
- `/api/rooms/default?room=lobby` - returns the WebSocket URL for a room.
- `/ws/lobby` - upgrades to a room WebSocket.

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
