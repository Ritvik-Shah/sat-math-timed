# AI Tutor proxy (Cloudflare Worker)

The site is static (GitHub Pages), so it can't hold a secret API key — anything shipped in the
page's JS is public. This Worker is the only piece with server-side code: it holds your Ollama
Cloud API key and is the sole thing the browser talks to for AI Tutor features. Deploy it once;
after that the key never touches the repo, the browser, or this chat.

## One-time setup

You'll need a free [Cloudflare account](https://dash.cloudflare.com/sign-up), an
[Ollama Cloud API key](https://ollama.com/settings/keys), and a Supabase project (the AI Tutor
requires a logged-in, subscribed Supabase user — see "Auth, subscriptions, and quota" below).

```bash
cd worker

# 1. Log into your Cloudflare account (opens a browser tab to authorize).
npx wrangler login

# 2. Store your Ollama API key as a secret. It's entered interactively and
#    stored encrypted on Cloudflare — never written to any file or committed.
npx wrangler secret put OLLAMA_API_KEY
# (paste your key when prompted, press Enter)

# 3. Store your Supabase service-role key as a secret too — same pattern.
#    Find it in your Supabase project under Settings > API ("service_role"
#    key, not "anon"). It bypasses RLS, so it must never be shipped to the
#    browser or committed — this is the only place it should live.
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
# (paste your key when prompted, press Enter)

# 4. Set your Supabase project URL and anon key in wrangler.toml (see
#    "Configuration knobs" below for exactly which lines to edit) — these
#    aren't secret, so they go in the file rather than via wrangler secret.

# 5. Deploy.
npx wrangler deploy
```

Wrangler will print your Worker's URL, something like:

```
https://sat-math-tutor.YOUR-SUBDOMAIN.workers.dev
```

## Point the site at it

Edit [`../tutor-config.js`](../tutor-config.js) and set `apiUrl` to that URL plus `/tutor`:

```js
window.TUTOR_CONFIG = {
  apiUrl: "https://sat-math-tutor.YOUR-SUBDOMAIN.workers.dev/tutor",
};
```

Commit and push — `tutor-config.js` has no secret in it, just the (public) Worker URL.

## Configuration knobs (`wrangler.toml`)

- **`OLLAMA_MODEL`** — defaults to `gpt-oss:120b-cloud`. Swap to `gpt-oss:20b-cloud` for
  faster/cheaper responses if 120b feels slow.
- **`ALLOWED_ORIGINS`** — comma-separated list of origins allowed to call the Worker. Already
  includes the GitHub Pages URL and `http://localhost:8811` for local dev; add any other origin
  you test from.
- **`[[ratelimits]]`** — caps each IP to 20 requests/minute. This is a blanket backstop against
  someone hammering the public Worker URL directly and running up your Ollama bill — the static
  site's own origin check helps, but a public HTTP endpoint can always be called directly, so this
  limit is what actually bounds cost. Lower it if you want tighter protection.
- **`SUPABASE_URL`** / **`SUPABASE_ANON_KEY`** — your Supabase project URL and its public anon
  key (Settings > API in the Supabase dashboard). Used to verify the logged-in user's bearer token
  on every AI Tutor request. Safe to keep as plain vars — the anon key is meant to be public.
- **`TUTOR_MONTHLY_QUOTA`** — per-account cap on AI Tutor requests (`explain`/`chat`/`summary`
  combined) per calendar month, enforced via the `tutor_usage` table. Defaults to `"300"`, a
  conservative starting guess made with no real usage data — tune it once you can see actual
  per-user volume.

After changing `wrangler.toml`, redeploy with `npx wrangler deploy`.

## Auth, subscriptions, and quota

`mode: "warmup"` stays open to anyone — it's an invisible backend pre-warm call with no user
content. Every other mode (`explain`/`chat`/`summary`) requires a logged-in, subscribed Supabase
user:

1. The request must include `Authorization: Bearer <token>`, a Supabase access token from the
   signed-in browser session. Missing it gets a `401` (`code: "auth_required"`).
2. The Worker verifies the token against Supabase Auth. An invalid/expired token also gets a
   `401` (`code: "auth_required"`).
3. The Worker looks up the user's row in the `subscriptions` table (via `SUPABASE_SERVICE_ROLE_KEY`,
   which bypasses RLS). If there isn't an active row, the request gets a `402`
   (`code: "subscription_required"`).

   **There's no Stripe/billing integration in this build.** A user becomes "subscribed" purely
   by the site admin manually inserting a row into `subscriptions` via the Supabase SQL editor —
   see the Supabase schema/setup docs (owned by another part of this project) for the exact
   columns and how `is_subscription_active` is defined. The Worker just checks that a row exists
   with `status = 'active'` and `current_period_end` either unset or still in the future.
4. If subscribed, the Worker checks/increments a monthly counter in `tutor_usage`, keyed by
   `(user_id, period_start)` where `period_start` is the first of the current UTC month. Once the
   count reaches `TUTOR_MONTHLY_QUOTA`, further requests get a `429` (`code: "quota_exceeded"`)
   until the counter resets next month.

If Supabase itself is unreachable or returns something unexpected during any of these checks, the
Worker fails closed with a `502` rather than silently letting the request through or crashing.

## Local testing

```bash
cd worker
npx wrangler dev --port 8787 \
  --var OLLAMA_API_KEY:your-real-key-for-local-testing-only \
  --var SUPABASE_SERVICE_ROLE_KEY:your-real-service-role-key-for-local-testing-only
```

Then point `tutor-config.js` at `http://127.0.0.1:8787/tutor` temporarily. Don't commit that
change — it's for local testing only.

## Automatic deploys (CI)

`.github/workflows/deploy-worker.yml` runs `wrangler deploy` automatically whenever a change
under `worker/` lands on `main` (direct push or merged PR). This closes a gap that otherwise bites
you every time: **`git push` never touches Cloudflare** — the live Worker keeps running whatever
code was deployed last until someone runs `wrangler deploy` by hand. With this workflow in place,
merging to `main` *is* the deploy.

Two one-time manual steps to wire it up (secrets, by nature, aren't something CI can bootstrap
itself):

1. **Create a Cloudflare API token** — dashboard → click your profile icon → *My Profile* → *API
   Tokens* → *Create Token* → use the **"Edit Cloudflare Workers"** template (scope it to this one
   account rather than "All accounts" if given the choice). Copy the token — Cloudflare only shows
   it once.
2. **Add two GitHub repo secrets** — this repo's GitHub page → *Settings* → *Secrets and variables*
   → *Actions* → *New repository secret*:
   - `CLOUDFLARE_API_TOKEN` — the token from step 1.
   - `CLOUDFLARE_ACCOUNT_ID` — from `npx wrangler whoami`, or the Cloudflare dashboard sidebar.

After that, every merge to `main` that touches `worker/` redeploys automatically — no more silent
drift between what's in the repo and what's actually live. You can also trigger a redeploy by hand
from the repo's *Actions* tab (the workflow has a `workflow_dispatch` trigger) without needing a
code change.

Reminder: this workflow only pushes code + `[vars]` + bindings from `wrangler.toml` — it never
touches secrets set via `wrangler secret put` (`OLLAMA_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).
Those are set once, by hand, and persist across every future deploy, CI or manual.
