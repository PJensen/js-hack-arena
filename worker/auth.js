const SESSION_COOKIE = '__Host-arena_session';
const OIDC_STATE_COOKIE = '__Host-arena_oidc_state';
const ROOM_HANDOFF_TTL_SECONDS = 60;
const SESSION_TTL_SECONDS = 60 * 60 * 8;

export async function authLogin(request, env) {
  const config = requireAuthConfig(env);
  const discovery = await fetchDiscovery(config.issuer, env);
  const state = randomToken(32);
  const nonce = randomToken(32);
  const verifier = randomToken(48);
  const challenge = await sha256Base64Url(verifier);
  const returnTo = safeReturnPath(new URL(request.url).searchParams.get('return'));
  const stateValue = await signPayload(env.ARENA_SESSION_SECRET, { state, nonce, verifier, returnTo, exp: nowSeconds() + 600 });
  const authorization = new URL(discovery.authorization_endpoint);
  authorization.search = new URLSearchParams({
    client_id: config.clientId, redirect_uri: config.redirectUri, response_type: 'code',
    scope: config.scopes, state, nonce, code_challenge: challenge, code_challenge_method: 'S256',
  }).toString();
  return new Response(null, { status: 302, headers: {
    location: authorization.toString(),
    'set-cookie': cookieHeader(OIDC_STATE_COOKIE, stateValue, 600),
    'cache-control': 'no-store',
  } });
}

export async function authCallback(request, env) {
  const config = requireAuthConfig(env);
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');
  const stateCookie = readCookie(request.headers.get('cookie'), OIDC_STATE_COOKIE);
  if (!code || !returnedState || !stateCookie) return authError('invalid login callback', 400);
  const state = await verifyPayload(env.ARENA_SESSION_SECRET, stateCookie);
  if (!state || state.exp < nowSeconds() || state.state !== returnedState) return authError('invalid login state', 400);

  const discovery = await fetchDiscovery(config.issuer, env);
  const tokenResponse = await basementFetch(env, discovery.token_endpoint, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: config.clientId,
      client_secret: config.clientSecret, redirect_uri: config.redirectUri, code_verifier: state.verifier }),
  });
  if (!tokenResponse.ok) return authError('Basement token exchange failed', 502);
  const tokens = await tokenResponse.json();
  if (!tokens.id_token || !tokens.access_token) return authError('Basement token response incomplete', 502);

  const claims = await verifyIdToken(tokens.id_token, discovery, config, state.nonce, env);
  let profile = claims;
  if (discovery.userinfo_endpoint) {
    const userinfoResponse = await basementFetch(env, discovery.userinfo_endpoint, { headers: { authorization: `Bearer ${tokens.access_token}` } });
    if (!userinfoResponse.ok) return authError('Basement user info failed', 502);
    profile = await userinfoResponse.json();
    if (profile.sub !== claims.sub) return authError('Basement subject mismatch', 502);
  }

  const session = await signPayload(env.ARENA_SESSION_SECRET, {
    sub: String(claims.sub), name: safeDisplayName(profile.name || profile.preferred_username || claims.sub),
    iat: nowSeconds(), exp: nowSeconds() + SESSION_TTL_SECONDS,
  });
  const destination = new URL(state.returnTo || '/', url.origin);
  const headers = new Headers({ location: destination.toString(), 'cache-control': 'no-store' });
  headers.append('set-cookie', cookieHeader(SESSION_COOKIE, session, SESSION_TTL_SECONDS));
  headers.append('set-cookie', cookieHeader(OIDC_STATE_COOKIE, '', 0));
  return new Response(null, { status: 302, headers });
}

export async function authMe(request, env) {
  const session = await readSession(request, env);
  if (!session) return json({ authenticated: false }, 401);
  return json({ authenticated: true, user: { id: session.sub, name: session.name } });
}

export async function authLogout() {
  return new Response(null, { status: 302, headers: {
    location: '/', 'set-cookie': cookieHeader(SESSION_COOKIE, '', 0), 'cache-control': 'no-store',
  } });
}

export function authConfigStatus(env) {
  return {
    issuer: Boolean(env.BASEMENT_ISSUER),
    clientId: Boolean(env.BASEMENT_CLIENT_ID),
    redirectUri: Boolean(env.BASEMENT_REDIRECT_URI),
    clientSecret: Boolean(env.BASEMENT_CLIENT_SECRET),
    sessionSecret: Boolean(env.ARENA_SESSION_SECRET),
  };
}

export async function readSession(request, env) {
  const value = readCookie(request.headers.get('cookie'), SESSION_COOKIE);
  if (!value) return null;
  const payload = await verifyPayload(env.ARENA_SESSION_SECRET, value);
  return payload && payload.exp >= nowSeconds() && payload.sub ? payload : null;
}

export async function createRoomHandoff(session, roomId, env) {
  return signPayload(env.ARENA_SESSION_SECRET, { sub: session.sub, name: session.name, roomId, exp: nowSeconds() + ROOM_HANDOFF_TTL_SECONDS });
}

export async function verifyRoomHandoff(value, roomId, env) {
  if (!value) return null;
  const payload = await verifyPayload(env.ARENA_SESSION_SECRET, value);
  if (!payload || payload.exp < nowSeconds() || payload.roomId !== roomId || !payload.sub) return null;
  return { userId: String(payload.sub), displayName: safeDisplayName(payload.name) };
}

function requireAuthConfig(env) {
  const config = {
    issuer: String(env.BASEMENT_ISSUER || '').replace(/\/$/, ''), clientId: String(env.BASEMENT_CLIENT_ID || ''),
    clientSecret: String(env.BASEMENT_CLIENT_SECRET || ''), redirectUri: String(env.BASEMENT_REDIRECT_URI || ''),
    scopes: String(env.BASEMENT_SCOPES || 'openid profile'),
  };
  if (!env.ARENA_SESSION_SECRET || !config.issuer || !config.clientId || !config.clientSecret || !config.redirectUri) {
    throw new Error('Arena authentication is not configured');
  }
  return config;
}

async function fetchDiscovery(issuer, env) {
  const response = await basementFetch(env, `${issuer}/.well-known/openid-configuration`);
  if (!response.ok) throw new Error(`Basement discovery failed: ${response.status}`);
  const discovery = await response.json();
  if (discovery.issuer && normalizeIssuer(discovery.issuer) !== normalizeIssuer(issuer)) throw new Error('Basement issuer mismatch');
  for (const field of ['authorization_endpoint', 'token_endpoint', 'jwks_uri']) if (!discovery[field]) throw new Error(`Basement discovery missing ${field}`);
  return discovery;
}

async function verifyIdToken(rawToken, discovery, config, nonce, env) {
  const [encodedHeader, encodedPayload, encodedSignature] = String(rawToken).split('.');
  if (!encodedHeader || !encodedPayload || !encodedSignature) throw new Error('invalid Basement id token');
  const header = JSON.parse(decodeBase64Url(encodedHeader));
  const claims = JSON.parse(decodeBase64Url(encodedPayload));
  if (header.alg !== 'RS256' || !claims.sub || normalizeIssuer(claims.iss) !== normalizeIssuer(config.issuer) || claims.nonce !== nonce) throw new Error('invalid Basement id token claims');
  if (claims.exp < nowSeconds() || (claims.iat && claims.iat > nowSeconds() + 60)) throw new Error('expired Basement id token');
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(config.clientId)) throw new Error('Basement id token audience mismatch');
  const jwksResponse = await basementFetch(env, discovery.jwks_uri);
  if (!jwksResponse.ok) throw new Error('Basement JWKS lookup failed');
  const jwks = await jwksResponse.json();
  const jwk = jwks.keys?.find((key) => key.kid === header.kid && key.kty === 'RSA');
  if (!jwk) throw new Error('Basement signing key not found');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decodeBase64UrlBytes(encodedSignature), new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`));
  if (!valid) throw new Error('Basement id token signature invalid');
  return claims;
}

function basementFetch(env, url, options) {
  if (env.BASEMENT) return env.BASEMENT.fetch(new Request(url, options));
  return fetch(url, options);
}

async function signPayload(secret, payload) {
  const encoded = encodeBase64Url(JSON.stringify(payload));
  return `${encoded}.${await hmac(secret, encoded)}`;
}

async function verifyPayload(secret, value) {
  const [encoded, signature] = String(value).split('.');
  if (!encoded || !signature || !secret) return null;
  const expected = await hmac(secret, encoded);
  if (expected.length !== signature.length) return null;
  const valid = await crypto.subtle.timingSafeEqual(decodeBase64UrlBytes(expected), decodeBase64UrlBytes(signature));
  if (!valid) return null;
  try { return JSON.parse(decodeBase64Url(encoded)); } catch { return null; }
}

async function hmac(secret, value) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return encodeBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))));
}

async function sha256Base64Url(value) {
  return encodeBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
}

function randomToken(bytes) { const values = new Uint8Array(bytes); crypto.getRandomValues(values); return encodeBase64Url(values); }
function encodeBase64Url(value) { let binary = ''; for (const byte of value instanceof Uint8Array ? value : new TextEncoder().encode(value)) binary += String.fromCharCode(byte); return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function decodeBase64Url(value) { return new TextDecoder().decode(decodeBase64UrlBytes(value)); }
function decodeBase64UrlBytes(value) { const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '='); const binary = atob(normalized); return Uint8Array.from(binary, (char) => char.charCodeAt(0)); }
function cookieHeader(name, value, maxAge) { return `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; Secure; HttpOnly; SameSite=Lax`; }
function readCookie(header, name) { for (const part of String(header || '').split(';')) { const [key, ...rest] = part.trim().split('='); if (key === name) return decodeURIComponent(rest.join('=')); } return null; }
function safeReturnPath(value) { return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/'; }
function normalizeIssuer(value) { return String(value || '').replace(/\/$/, ''); }
function safeDisplayName(value) { return String(value || 'Adventurer').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20) || 'Adventurer'; }
function nowSeconds() { return Math.floor(Date.now() / 1000); }
function authError(message, status) { return json({ ok: false, error: message }, status); }
function json(body, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } }); }
