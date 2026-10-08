# Locking down the Cloudflare Worker

The app talks to Airtable through `https://gym-tracker.stephen-nolan85.workers.dev`.
That URL is visible in the page source, so unless the Worker checks something,
anyone who finds it can read or change the Gym Tracker base.

From v9 the app can send a per-device **sync key** in an `X-Sync-Key` header.
The key is typed into Manage → Data → Sync key on each phone and is never
stored in this repo or the page.

## Steps (in this order)

1. **Make a key.** Any long random string, for example from a password manager,
   or `openssl rand -hex 24`.
2. **Store it as a Worker secret** (not a plain variable):
   - Dashboard: Workers & Pages → gym-tracker → Settings → Variables and Secrets →
     Add → Type *Secret*, name `SYNC_KEY`.
   - Or with Wrangler: `npx wrangler secret put SYNC_KEY`
3. **Add the guard below to the Worker** and deploy.
4. **On each phone**, open Clean Slate → Manage → Data → Sync key, paste the key,
   tap Save. The app refreshes from Airtable and sends any queued changes.

Until step 4, the phone's requests get `401` and its changes wait in the offline
queue. Nothing is lost.

## Guard to add at the top of the Worker's `fetch` handler

```js
// Only the GitHub Pages site may call this from a browser, and every request
// must carry the shared key. Keep your existing routing below this block.
const ALLOWED_ORIGIN = 'https://imademybones.github.io';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Sync-Key',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

// constant-time comparison so the key can't be guessed by timing
function sameKey(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    if (!sameKey(request.headers.get('X-Sync-Key'), env.SYNC_KEY)) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders() });
    }

    // …existing routing to Airtable…
    // Make sure every response it returns also carries corsHeaders(),
    // replacing any existing 'Access-Control-Allow-Origin: *'.
  }
};
```

If the Worker already has its own `OPTIONS` handling or CORS headers, merge
them: the important parts are `X-Sync-Key` in `Access-Control-Allow-Headers`,
the origin locked to `https://imademybones.github.io`, and the 401 check.

### Optional hardening

- Only allow the four tables the app uses: `workouts`, `exercises`, `settings`,
  `sessions`. Return `404` for anything else.
- Keep the Airtable token as a Worker secret too (it probably already is).

## Checking it worked

- Without the key: `curl -i https://gym-tracker.stephen-nolan85.workers.dev/settings` → `401 Unauthorized`.
- With the key: `curl -i -H "X-Sync-Key: <your key>" …/settings` → `200`.
- In the app: Manage → Data shows no red "Airtable refused the request" line,
  and the sync dot on Home is green.
