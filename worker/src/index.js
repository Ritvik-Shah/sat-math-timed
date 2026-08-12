// Cloudflare Worker: proxies the SAT Math Practice site's "AI Tutor" requests
// to Ollama Cloud, so the Ollama API key stays server-side (set via
// `wrangler secret put OLLAMA_API_KEY`, never committed to the repo).
//
// The static site is public on GitHub Pages, so this worker is the only
// thing standing between the public internet and a billed API key — keep the
// origin allowlist, payload cap, and rate limit in place even though traffic
// is expected to be low.

const MAX_PAYLOAD_CHARS = 20000;
const MAX_HISTORY_MESSAGES = 12;
const MAX_REPLY_INPUT_CHARS = 4000; // per free-text field we splice into the prompt

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    const allowedOrigins = (env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const corsHeaders = buildCorsHeaders(origin, allowedOrigins);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/tutor") {
      return json({ error: "Not found" }, 404, corsHeaders);
    }

    if (!allowedOrigins.includes(origin)) {
      return json({ error: "Origin not allowed" }, 403, corsHeaders);
    }

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (env.RATE_LIMITER) {
      const { success } = await env.RATE_LIMITER.limit({ key: ip });
      if (!success) {
        return json({ error: "You're asking a lot of questions at once — wait a moment and try again." }, 429, corsHeaders);
      }
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: "Invalid JSON body" }, 400, corsHeaders);
    }

    if (JSON.stringify(body).length > MAX_PAYLOAD_CHARS) {
      return json({ error: "Request too large" }, 413, corsHeaders);
    }

    const { mode, context, messages } = body;
    if (!["explain", "chat", "summary"].includes(mode)) {
      return json({ error: "Invalid mode" }, 400, corsHeaders);
    }

    if (!env.OLLAMA_API_KEY) {
      return json({ error: "Server misconfigured: OLLAMA_API_KEY is not set." }, 500, corsHeaders);
    }

    const systemPrompt = buildSystemPrompt(mode, sanitizeContext(context));
    const history = Array.isArray(messages)
      ? messages
          .slice(-MAX_HISTORY_MESSAGES)
          .filter((m) => m && typeof m.content === "string" && (m.role === "user" || m.role === "assistant"))
          .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_REPLY_INPUT_CHARS) }))
      : [];

    let ollamaRes;
    try {
      ollamaRes = await fetch("https://ollama.com/api/chat", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OLLAMA_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: env.OLLAMA_MODEL || "gpt-oss:120b-cloud",
          messages: [{ role: "system", content: systemPrompt }, ...history],
          stream: false,
        }),
      });
    } catch (e) {
      return json({ error: "Could not reach Ollama Cloud." }, 502, corsHeaders);
    }

    if (!ollamaRes.ok) {
      const errText = await ollamaRes.text().catch(() => "");
      return json({ error: "Ollama Cloud returned an error.", detail: errText.slice(0, 500) }, 502, corsHeaders);
    }

    const data = await ollamaRes.json().catch(() => null);
    const reply = data?.message?.content;
    if (!reply) {
      return json({ error: "Ollama Cloud returned an empty response." }, 502, corsHeaders);
    }

    return json({ reply }, 200, corsHeaders);
  },
};

function sanitizeContext(context) {
  if (!context || typeof context !== "object") return {};
  const clean = {};
  for (const [k, v] of Object.entries(context)) {
    if (typeof v === "string") clean[k] = v.slice(0, MAX_REPLY_INPUT_CHARS);
    else if (Array.isArray(v)) clean[k] = v.slice(0, 50);
    else clean[k] = v;
  }
  return clean;
}

function buildCorsHeaders(origin, allowedOrigins) {
  const headers = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
  if (allowedOrigins.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function json(obj, status, extraHeaders) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

function buildSystemPrompt(mode, context) {
  const base =
    "You are a patient, encouraging SAT Math tutor. Keep answers concise (under 200 words unless the student explicitly asks for more detail), use plain language, and reason step by step when explaining math. Never just restate the final answer without explaining the reasoning. Only discuss SAT-level math — politely decline anything else.";

  if (mode === "explain") {
    const c = context;
    return `${base}

The student just answered this SAT Math question:
Category: ${c.category || "?"} (${c.subcategory || "?"})
Question: ${c.prompt || ""}
Correct answer: ${c.correctAnswer || ""}
Student's answer: ${c.studentAnswer || ""}
${c.workText ? `Student's work:\n${c.workText}` : "The student did not show any work."}

Existing explanation already shown to the student: ${c.explanation || ""}

The student wants more help understanding this question. If they showed work, look at it closely and point out specifically where their reasoning went right or wrong. Then walk through the correct approach clearly, building on what they already tried rather than just repeating the existing explanation verbatim.`;
  }

  if (mode === "summary") {
    const c = context;
    const breakdown = Array.isArray(c.categoryBreakdown)
      ? c.categoryBreakdown.map((b) => `${b.category}: ${b.correct}/${b.total}`).join(", ")
      : "";
    const missed = Array.isArray(c.missedQuestions)
      ? c.missedQuestions
          .map((m) => `- [${m.category} / ${m.subcategory}] ${m.prompt} (correct answer: ${m.correctAnswer}, student answered: ${m.studentAnswer})`)
          .join("\n")
      : "";
    return `${base}

The student just finished a practice session and scored ${c.totalCorrect ?? "?"}/${c.totalQuestions ?? "?"}.
Score by category: ${breakdown || "n/a"}

Questions they missed:
${missed || "(none missed)"}

Based on the specific pattern of what they missed (not generic SAT advice), identify the 2-3 most important fundamental skills or concepts for this student to focus on next, in priority order, and give one concrete, actionable way to practice each.`;
  }

  // chat mode
  const c = context;
  if (c && c.prompt) {
    return `${base}

The student is asking follow-up questions about this specific SAT Math question:
Category: ${c.category || "?"} (${c.subcategory || "?"})
Question: ${c.prompt}
Correct answer: ${c.correctAnswer || ""}
${c.workText ? `Student's work:\n${c.workText}` : ""}

Answer their questions helpfully, using the question above as context. Stay focused on helping them understand the underlying math, not just this one answer.`;
  }
  return `${base}

The student is asking general questions about SAT Math concepts and how to improve. Answer helpfully and concretely.`;
}
