// URL of the Cloudflare Worker proxy that holds the Ollama API key server-side.
// Deploy worker/ (see worker/README.md), then replace this with the URL wrangler
// prints, e.g. "https://sat-math-tutor.YOUR-SUBDOMAIN.workers.dev/tutor".
// Nothing secret lives in this file — the URL alone is not sensitive.
window.TUTOR_CONFIG = {
  apiUrl: "https://sat-math-tutor.ritvikshah.workers.dev/tutor",
};
