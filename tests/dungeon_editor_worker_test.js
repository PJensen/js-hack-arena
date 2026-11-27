import { assertEquals } from 'https://deno.land/std@0.220.0/assert/mod.ts';
import { timingSafeEqual } from 'node:crypto';
import app from '../worker/index.js';
import { isDungeonEditor } from '../worker/auth.js';

if (!crypto.subtle.timingSafeEqual) crypto.subtle.timingSafeEqual = timingSafeEqual;

const encoder = new TextEncoder();
const base64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function signedSessionCookie(secret, sub) {
  const encoded = base64url(encoder.encode(JSON.stringify({ sub, name: 'Tester', exp: Math.floor(Date.now() / 1000) + 3600 })));
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(encoded))));
  return `__Host-arena_session=${encodeURIComponent(`${encoded}.${signature}`)}`;
}

function makeKv() {
  const records = new Map();
  return {
    records,
    async put(key, value, options) { records.set(key, { value, metadata: options.metadata }); },
    async get(key) {
      const record = records.get(key);
      return record ? JSON.parse(record.value) : null;
    },
    async list({ prefix }) {
      return {
        keys: [...records.entries()].filter(([key]) => key.startsWith(prefix)).map(([name, record]) => ({ name, metadata: record.metadata })),
        list_complete: true,
      };
    },
  };
}

function makeEnv() {
  return {
    ARENA_SESSION_SECRET: 'test-session-secret',
    DUNGEON_EDITOR_USER_ID: 'owner-sub',
    DUNGEONS: makeKv(),
  };
}

function request(path, { method = 'GET', cookie = '', body = null } = {}) {
  const headers = new Headers({ origin: 'https://arena.hairylogic.com' });
  if (cookie) headers.set('cookie', cookie);
  if (body != null) { headers.set('content-type', 'application/json'); }
  return new Request(`https://arena.hairylogic.com${path}`, { method, headers, body: body == null ? null : JSON.stringify(body) });
}

Deno.test('dungeon editor API permits only the configured stable user ID', async () => {
  assertEquals(isDungeonEditor({ sub: 'owner-sub' }, { DUNGEON_EDITOR_USER_ID: 'owner-sub' }), true);
  assertEquals(isDungeonEditor({ sub: 'other-sub' }, { DUNGEON_EDITOR_USER_ID: 'owner-sub' }), false);
  assertEquals(isDungeonEditor({ sub: 'owner-sub' }, { DUNGEON_EDITOR_USER_ID: '' }), false);
  const response = await app.fetch(request('/api/editor/dungeons'), makeEnv());
  assertEquals(response.status, 401);
  const editorPage = await app.fetch(request('/tools/dungeon-editor/'), makeEnv());
  assertEquals(editorPage.status, 302);
});

Deno.test('dungeon editor API stores and loads normalized layouts for the authorized user', async () => {
  const env = makeEnv(), cookie = await signedSessionCookie(env.ARENA_SESSION_SECRET, 'owner-sub');
  const editorFiles = { html: '<title>Dungeon Editor</title>', script: 'export {};' };
  const editorPage = await app.fetch(request('/tools/dungeon-editor/', { cookie }), env, editorFiles);
  assertEquals(editorPage.status, 200);
  assertEquals(await editorPage.text(), editorFiles.html);
  assertEquals(editorPage.headers.get('cache-control'), 'private, no-store');
  const script = await app.fetch(request('/tools/dungeon-editor/editor.js', { cookie }), env, editorFiles);
  assertEquals(await script.text(), editorFiles.script);
  const ownerProfile = await app.fetch(request('/auth/me', { cookie }), env);
  assertEquals((await ownerProfile.json()).canEditDungeons, true);
  const indexPage = await app.fetch(request('/tools/dungeon-editor/index.html', { cookie }), env);
  assertEquals(indexPage.headers.get('location'), 'https://arena.hairylogic.com/tools/dungeon-editor/');
  const layout = {
    schema: 'hack-arena.hand-carved-dungeon', version: 1, id: 'test-cave', name: 'Test Cave',
    width: 1000, height: 1000, cellSize: 8,
    start: { x: 500, y: 500 },
    roughness: 35,
    placements: [{ id: 'torch', kind: 'decoration', variant: 'torch', x: 500, y: 500 }],
    strokes: [
      { id: 'room-one', type: 'circle', cx: 500, cy: 500, r: 120 },
      { id: 'water', type: 'circle', cx: 500, cy: 500, r: 60, floor: 'water' },
      { id: 'lava', type: 'circle', cx: 550, cy: 500, r: 40, floor: 'lava' },
    ],
  };
  const unauthorizedCookie = await signedSessionCookie(env.ARENA_SESSION_SECRET, 'other-sub');
  const otherProfile = await app.fetch(request('/auth/me', { cookie: unauthorizedCookie }), env);
  assertEquals((await otherProfile.json()).canEditDungeons, undefined);
  const deniedPage = await app.fetch(request('/tools/dungeon-editor/', { cookie: unauthorizedCookie }), env, editorFiles);
  assertEquals(deniedPage.status, 403);
  const denied = await app.fetch(request('/api/editor/dungeons', { cookie: unauthorizedCookie }), env);
  assertEquals(denied.status, 403);

  const saved = await app.fetch(request('/api/editor/dungeons/test-cave', { method: 'PUT', cookie, body: layout }), env);
  assertEquals(saved.status, 200);
  const savedBody = await saved.json();
  assertEquals(savedBody.layout.id, 'test-cave');
  assertEquals(savedBody.layout.cellSize, 8);
  assertEquals(savedBody.layout.start, layout.start);
  assertEquals(savedBody.layout.roughness, undefined);
  assertEquals(savedBody.layout.placements, layout.placements);
  assertEquals(savedBody.layout.strokes, [{ ...layout.strokes[0], roughness: 35 }, ...layout.strokes.slice(1)]);
  assertEquals(typeof savedBody.updatedAt, 'string');

  const listed = await app.fetch(request('/api/editor/dungeons', { cookie }), env);
  assertEquals((await listed.json()).dungeons.map(({ id }) => id), ['test-cave']);
  const loaded = await app.fetch(request('/api/editor/dungeons/test-cave', { cookie }), env);
  assertEquals((await loaded.json()).layout, savedBody.layout);

  const second = await app.fetch(request('/api/editor/dungeons/second-cave', {
    method: 'PUT', cookie, body: { ...layout, id: 'second-cave', name: 'Second Cave' },
  }), env);
  assertEquals(second.status, 200);
  const catalog = await app.fetch(request('/api/dungeons', { cookie: unauthorizedCookie }), env);
  assertEquals(catalog.status, 200);
  assertEquals(await catalog.json(), { dungeons: [
    { id: 'test-cave', name: 'Test Cave' },
    { id: 'second-cave', name: 'Second Cave' },
  ] });
  assertEquals((await app.fetch(request('/api/dungeons'), env)).status, 401);
  assertEquals((await app.fetch(request('/api/dungeons', { method: 'PUT', cookie }), env)).status, 405);
  assertEquals((await app.fetch(request('/api/editor/dungeons/test-cave', { cookie: unauthorizedCookie }), env)).status, 403);
});
