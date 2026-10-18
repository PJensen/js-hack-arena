# Arena → Hairylogic migration plan

Status: planning

Arena should become a first-class Hairylogic product at `arena.hairylogic.com`, using Basement for identity and the Basement friends API for social relationships. The migration should preserve the current static/offline game while making every server-backed player session attributable to a verified Hairylogic user.

## Outcomes

- `https://arena.hairylogic.com` serves the Arena client and Worker.
- Arena has a registered Basement OIDC client named `arena`.
- Arena owns its own product session; Basement remains the identity issuer and friends authority.
- Authenticated WebSocket sessions use the canonical Hairylogic user ID, not a browser-supplied name.
- Friends can be used for discovery, invitations, room permissions, and future cooperative features without moving game state into Basement.
- Anonymous/offline play remains available unless a later product decision explicitly makes login mandatory.

## Boundaries to preserve

Basement owns canonical users, upstream Google identities, authentication, current friendships, and blocks. Arena owns rooms, player presence, game state, history, progression, invitations, and the meaning of an Arena relationship.

Basement access tokens are bearer credentials and should not be stored in browser JavaScript or exposed to the game client. Arena's Worker should complete the OIDC code exchange, store the resulting product session, and call `friends.hairylogic.com` server-to-server when it needs friend data.

Arena should not trust a `name` query parameter as identity. A display name may remain editable presentation data, but ownership and authorization must come from the verified Basement subject.

## Phase 0 — decisions and inventory

Before changing production configuration:

1. Confirm `arena.hairylogic.com` as the canonical hostname and decide whether any existing preview hostname redirects to it.
2. Decide whether Arena's first release requires login for multiplayer, or permits anonymous rooms with authenticated identity as an enhancement. Recommended: preserve anonymous local play, require login for persistent identity and friend features.
3. Decide whether friends are initially used only for discovery/invites or also for room admission. Recommended first slice: friend list plus explicit invite/join authorization; do not automatically make every friend visible in every room.
4. Choose a stable Arena session model: an HttpOnly, Secure, host-only cookie issued by Arena after its server-side OIDC exchange.
5. Confirm the target Cloudflare account, `hairylogic.com` zone, and Arena Worker name before deploying or adding DNS.

## Phase 1 — register Arena with Basement

Add an explicit `arena` OIDC client in Basement with:

- exact production redirect URI, for example `https://arena.hairylogic.com/auth/callback`;
- exact production logout/return URI;
- a separate generated client secret stored only as an Arena Worker secret;
- `friends_access` enabled only when the first friends-backed feature is ready;
- `https://arena.hairylogic.com` added to the Basement friends API CORS allowlist.

The client registration must be performed through the reviewed Basement provisioning flow. Do not copy another product's client secret or reuse a product database. Add local callback configuration separately for development; do not weaken exact redirect URI matching.

Basement changes should be deployed and checked independently before Arena begins its OIDC exchange. Verify discovery, authorization, token exchange, UserInfo, logout, and friends API authorization with the new client.

## Phase 2 — attach the subdomain

Update Arena's Wrangler configuration for the production Worker and static assets, then attach the custom hostname through the `hairylogic.com` zone. The intended routing is:

- `arena.hairylogic.com/*` → the Arena Worker;
- `/api/*` → Arena application/session endpoints;
- `/ws/*` → the existing `GameRoom` Durable Object routing;
- all other paths → Arena static assets.

DNS and TLS verification must happen before changing application redirects. Confirm that the hostname serves the expected Worker version, that WebSocket upgrade requests reach the Durable Object, and that static assets do not bypass the Worker routes that need authentication.

The first production deployment should be a domain-only release with the existing anonymous behavior intact. This separates DNS/routing failures from auth failures.

## Phase 3 — add Arena's identity boundary

Implement the OIDC Authorization Code + PKCE flow in the Arena Worker:

1. `GET /auth/login` creates state, nonce, and PKCE values and redirects to Basement discovery/authorization.
2. `GET /auth/callback` validates the exact state, nonce, code, and redirect URI, then exchanges the code server-side using the Arena client secret.
3. Arena validates the returned identity and creates its own short-lived product session.
4. `GET /auth/me` returns only the current Arena session's canonical user ID and safe display information.
5. `POST /auth/logout` clears the Arena session and performs the intended Basement RP logout flow where appropriate.

Use host-only, Secure, HttpOnly cookies. Do not make Basement's `__Host-session` cookie available to Arena, and do not place access tokens in local storage, query strings, WebSocket URLs, or client-visible HTML.

The Arena session should contain or resolve:

- canonical Hairylogic user ID;
- Arena session expiry and issuance time;
- display name as presentation data, not as the identity key;
- any bounded authorization context needed to establish a WebSocket session.

Missing or invalid production secrets must produce an explicit error. There should be no fake identity, insecure fallback, or silently anonymous upgrade of an authenticated request.

## Phase 4 — bind identity to realtime rooms

Change the WebSocket handshake so the Worker authenticates the request before passing it to `GameRoom`.

- Resolve the Arena session from the request cookie.
- Pass the verified user ID and display name into the Durable Object request context or a signed, short-lived handoff created by the Worker.
- Have `GameRoom` create a connection peer ID separately from the stable user ID.
- Reject duplicate or conflicting identity claims according to a documented policy.
- Keep peer connection lifecycle separate from user identity; reconnects must not create a new account.

Snapshots may expose a safe display name and transient peer information, but never session tokens, email addresses, private Basement data, or unverified client claims. Room authorization must be checked on the server before join, invite acceptance, or privileged room actions.

The protocol should remain compatible with local/offline play. The browser can use a local player identity only when it is not connected to a server-backed room.

## Phase 5 — introduce friends as a deeper platform feature

Start with read-only friend discovery:

- Arena Worker calls `GET /friends` with a Basement access token obtained during the server-side OIDC exchange.
- Arena maps the result to a minimal product response: canonical user ID, display name, and current friendship status.
- Browser clients never call the friends API directly with a bearer token.

Then add explicit social actions:

- friend requests and acceptance remain Basement operations;
- Arena may provide UI that forwards those actions through Arena's server, but must not duplicate friendship state in Arena's database;
- blocks must be respected before showing invites, joining rooms, or delivering social actions;
- current friendship must be rechecked at authorization time, not trusted solely from a cached list.

The first Arena-specific use should be explicit room invitations:

1. A signed-in player chooses a current friend.
2. Arena verifies the friendship through Basement.
3. Arena creates an invitation or room grant owned by Arena.
4. The recipient accepts through an authenticated Arena request.
5. Arena rechecks current friendship and block state before granting room access.
6. The room receives a stable user ID and a short-lived join authorization, never a reusable browser token.

Later features can include friend presence, private rooms, party formation, shared progression, and post-run results. Each should define its own Arena meaning and retention policy rather than expanding Basement's data model prematurely.

## Data and privacy rules

- Store the canonical user ID, not Google email, as Arena ownership.
- Store only the minimum product profile needed for display and authorization.
- Do not expose private identity sources, Google claims, Basement access tokens, or friendship internals to peers.
- Treat friend lists and invitations as user-controlled social data with explicit access checks.
- Decide retention for room membership, invitations, and run history before adding durable Arena storage.
- If a user disconnects from Basement or blocks another user, new Arena grants must stop immediately; existing room behavior needs an explicit product policy.

## Rollout and verification

### Local

- Run the existing Deno tests and type checks.
- Add Worker tests for login state, callback rejection, session expiry, logout, and authenticated WebSocket admission.
- Add friends-client tests for missing scopes, expired tokens, blocked users, and friendship changes between cache and authorization.
- Test anonymous/offline play separately from authenticated multiplayer.

### Staging or preview

- Use a dedicated callback URI and a separately registered non-production client when possible.
- Verify Google sign-in, Basement OIDC discovery, session creation, logout, and token expiry.
- Verify the real WebSocket upgrade path through the hostname, not only direct Worker tests.
- Exercise friend request, acceptance, block, unfriend, and invite flows with two test users.

### Production

1. Deploy the domain-only release.
2. Register/provision the Arena Basement client and secrets.
3. Deploy auth behind a controlled feature flag or login entry point.
4. Enable friends access after identity and server-side token handling are verified.
5. Enable friend invitations only after recheck and block behavior is verified.
6. Monitor auth failures, callback failures, WebSocket rejects, room joins, and friends API errors.

Rollback should disable the Arena client or friends permission in Basement, turn off the Arena feature flag, and revert the Arena Worker version. Do not delete identity or friendship records as part of application rollback.

## Completion criteria

The migration is complete when a user can sign in at `arena.hairylogic.com`, receive an Arena-owned session, enter a realtime room with a verified stable user identity, and use a friend-backed invitation whose authorization is checked against current Basement friendship and block state. Anonymous/offline play continues to work according to the Phase 0 decision, and all secrets/configuration have been reviewed against the intended Cloudflare account and zone.

## Open decisions

- Is login required for server-backed multiplayer, or only for identity and social features?
- Should Arena have a separate public profile/display-name editor, or initially use Basement profile data?
- Are friends allowed to discover one another in Arena, or only interact through explicit invitations?
- What happens to an active room when friendship ends or a block is created?
- Which Arena data, if any, should persist beyond a room session?
