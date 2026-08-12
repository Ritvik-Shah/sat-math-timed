# AI Tutor proxy (Cloudflare Worker)

The site is static (GitHub Pages), so it can't hold a secret API key — anything shipped in the
page's JS is public. This Worker is the only piece with server-side code: it holds your Ollama
Cloud API key and is the sole thing the browser talks to for AI Tutor features. Deploy it once;
after that the key never touches the repo, the browser, or this chat.

## One-time setup

You'll need a free [Cloudflare account](https://dash.cloudflare.com/sign-up) and an
[Ollama Cloud API key](https://ollama.com/settings/keys).

```bash
cd worker

# 1. Log into your Cloudflare account (opens a browser tab to authorize).
npx wrangler login

# 2. Store your Ollama API key as a secret. It's entered interactively and
#    stored encrypted on Cloudflare — never written to any file or committed.
npx wrangler secret put OLLAMA_API_KEY
# (paste your key when prompted, press Enter)

# 3. Deploy.
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
- **`[[ratelimits]]`** — caps each IP to 20 requests/minute. This is the main protection against
  someone hammering the public Worker URL directly and running up your Ollama bill — the static
  site's own origin check helps, but a public HTTP endpoint can always be called directly, so this
  limit is what actually bounds cost. Lower it if you want tighter protection.

After changing `wrangler.toml`, redeploy with `npx wrangler deploy`.

## Local testing

```bash
cd worker
npx wrangler dev --port 8787 --var OLLAMA_API_KEY:your-real-key-for-local-testing-only
```

Then point `tutor-config.js` at `http://127.0.0.1:8787/tutor` temporarily. Don't commit that
change — it's for local testing only.
