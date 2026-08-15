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

    // Body needs to be parsed here — earlier than in the original flow — so
    // the auth/subscription/quota gate below (which needs `mode` to decide
    // whether it even applies) can sit in its required position: right
    // after the origin check and before the per-IP rate limiter backstop.
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
    if (!["warmup", "explain", "chat", "summary"].includes(mode)) {
      return json({ error: "Invalid mode" }, 400, corsHeaders);
    }

    // Auth + subscription + monthly-quota gate. "warmup" is an invisible
    // backend pre-warm call with no user content, so it stays open exactly
    // as before; every other mode now requires a logged-in, subscribed,
    // under-quota Supabase user. There's no billing system here — access is
    // granted purely by the site admin inserting a row into `subscriptions`
    // by hand, so this just checks whether such a row exists and is active.
    const gate = await checkAuthAndQuota(mode, request, env);
    if (gate) {
      return json(gate.body, gate.status, corsHeaders);
    }

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (env.RATE_LIMITER) {
      const { success } = await env.RATE_LIMITER.limit({ key: ip });
      if (!success) {
        return json({ error: "You're asking a lot of questions at once — wait a moment and try again." }, 429, corsHeaders);
      }
    }

    if (!env.OLLAMA_API_KEY) {
      return json({ error: "Server misconfigured: OLLAMA_API_KEY is not set." }, 500, corsHeaders);
    }

    const model = env.OLLAMA_MODEL || "gpt-oss:120b-cloud";

    // "warmup" is fired silently by the client at the start of a practice
    // session, well before the student would reach the results screen and
    // actually want a reply. It triggers Ollama to start loading the model
    // (num_predict: 1 keeps the actual generation — and cost — minimal) and
    // returns immediately; it doesn't wait for or care about the outcome.
    // keep_alive is set generously so the model stays loaded between uses
    // instead of unloading after Ollama's short default idle timeout.
    if (mode === "warmup") {
      try {
        await fetch("https://ollama.com/api/chat", {
          method: "POST",
          headers: { Authorization: `Bearer ${env.OLLAMA_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: "Hi" }],
            stream: false,
            keep_alive: "30m",
            options: { num_predict: 1 },
          }),
        });
      } catch (e) {
        // best-effort — a failed warmup just means the first real request falls back to the normal retry path
      }
      return json({ warmed: true }, 200, corsHeaders);
    }

    const systemPrompt = buildSystemPrompt(mode, sanitizeContext(context));
    const history = Array.isArray(messages)
      ? messages
          .slice(-MAX_HISTORY_MESSAGES)
          .filter((m) => m && typeof m.content === "string" && (m.role === "user" || m.role === "assistant"))
          .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_REPLY_INPUT_CHARS) }))
      : [];

    // "explain" and "summary" put everything into the system prompt and send
    // no chat history, so without this the request has zero user-role
    // messages. Ollama Cloud appears to silently reject that shape (comes
    // back as done_reason: "load" instead of a real error), so always send
    // at least one user turn.
    if (history.length === 0) {
      const kickoff =
        mode === "explain"
          ? "Please help me understand this question."
          : mode === "summary"
            ? "Please give me my study plan."
            : "Hi.";
      history.push({ role: "user", content: kickoff });
    }

    const ollamaBody = JSON.stringify({
      model,
      messages: [{ role: "system", content: systemPrompt }, ...history],
      stream: false,
      keep_alive: "30m",
    });

    // Ollama Cloud models that aren't already "warm" respond to the first call
    // with an immediate empty reply (done_reason: "load") while it loads the
    // model in the background, instead of waiting — and a cold load can take
    // 30s+. Rather than have one Worker invocation sit waiting that whole
    // time (bad UX either way, and risks the platform's own execution
    // limits), do a couple of quick attempts here and otherwise hand a
    // distinguishable "warming_up" code back to the client, which retries
    // with its own visible progress state (see tutor.js).
    const MAX_ATTEMPTS = 3;
    let lastError = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let ollamaRes;
      try {
        ollamaRes = await fetch("https://ollama.com/api/chat", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.OLLAMA_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: ollamaBody,
        });
      } catch (e) {
        lastError = { error: "Could not reach Ollama Cloud." };
        break;
      }

      if (!ollamaRes.ok) {
        const errText = await ollamaRes.text().catch(() => "");
        lastError = { error: "Ollama Cloud returned an error.", detail: errText.slice(0, 500) };
        break; // real errors (auth, bad request, etc.) won't fix themselves on retry
      }

      const data = await ollamaRes.json().catch(() => null);
      const reply = data?.message?.content;
      if (reply) {
        return json({ reply }, 200, corsHeaders);
      }

      const stillLoading = data?.done_reason === "load";
      lastError = stillLoading
        ? { error: "The AI model is still warming up.", code: "warming_up" }
        : { error: "Ollama Cloud returned an empty response." };
      if (stillLoading && attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1200));
        continue;
      }
      break;
    }

    const finalError = lastError || { error: "Ollama Cloud returned an empty response." };
    return json(finalError, finalError.code === "warming_up" ? 503 : 502, corsHeaders);
  },
};

// Gates every mode except "warmup" behind a logged-in, subscribed, under-quota
// Supabase user. Returns null when the request may proceed, or
// { status, body } describing the rejection response otherwise.
//
// There's no Stripe/billing integration in this build — a "subscription" is
// just a row in the `subscriptions` table that the site admin inserts by
// hand via the Supabase SQL editor. This only checks whether such a row
// exists and is currently active; it doesn't care how it got there.
async function checkAuthAndQuota(mode, request, env) {
  if (mode === "warmup") return null;

  const authHeader = request.headers.get("Authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = match && match[1];
  if (!token) {
    return {
      status: 401,
      body: { error: "Sign up and subscribe to use the AI Tutor.", code: "auth_required" },
    };
  }

  // Step 1: verify the token against Supabase Auth and pull out the user id.
  let userId;
  try {
    const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: env.SUPABASE_ANON_KEY,
      },
    });
    if (!userRes.ok) {
      // Invalid or expired token — same message/code as a missing one.
      return {
        status: 401,
        body: { error: "Sign up and subscribe to use the AI Tutor.", code: "auth_required" },
      };
    }
    const userData = await userRes.json().catch(() => null);
    userId = userData && userData.id;
    if (!userId) {
      return {
        status: 401,
        body: { error: "Sign up and subscribe to use the AI Tutor.", code: "auth_required" },
      };
    }
  } catch (e) {
    // Couldn't reach Supabase Auth at all — fail closed, don't crash.
    return { status: 502, body: { error: "Could not verify your account right now. Try again shortly." } };
  }

  // Step 2: look up their subscription with the service-role key (bypasses
  // RLS, since this worker isn't acting as the user).
  let sub;
  try {
    const subRes = await fetch(
      `${env.SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${userId}&select=status,current_period_end`,
      {
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );
    if (!subRes.ok) throw new Error(`subscriptions lookup failed: ${subRes.status}`);
    const rows = await subRes.json();
    sub = Array.isArray(rows) ? rows[0] : null;
  } catch (e) {
    return { status: 502, body: { error: "Could not verify your subscription right now. Try again shortly." } };
  }

  // "Active" mirrors is_subscription_active from the SQL schema: status is
  // 'active' and current_period_end is either unset or still in the future.
  const isActive =
    !!sub &&
    sub.status === "active" &&
    (!sub.current_period_end || new Date(sub.current_period_end).getTime() > Date.now());

  if (!isActive) {
    return {
      status: 402,
      body: { error: "Subscribe to unlock the AI Tutor.", code: "subscription_required" },
    };
  }

  // Step 3: check and increment the monthly quota, bucketed by
  // (user_id, period_start) where period_start is the first of the current
  // UTC month.
  const now = new Date();
  const periodStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const quota = parseInt(env.TUTOR_MONTHLY_QUOTA, 10) || 300;

  try {
    const usageRes = await fetch(
      `${env.SUPABASE_URL}/rest/v1/tutor_usage?user_id=eq.${userId}&period_start=eq.${periodStart}&select=request_count`,
      {
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );
    if (!usageRes.ok) throw new Error(`tutor_usage lookup failed: ${usageRes.status}`);
    const usageRows = await usageRes.json();
    const currentCount = (usageRows && usageRows[0] && usageRows[0].request_count) || 0;

    if (currentCount >= quota) {
      return {
        status: 429,
        body: {
          error: "You've hit your monthly AI Tutor limit. It resets next month.",
          code: "quota_exceeded",
        },
      };
    }

    // Best-effort upsert — if two requests race, one may lose an increment.
    // That's an acceptable minor imprecision for a quota counter; not worth
    // locking over.
    //
    // on_conflict is required here: tutor_usage has no primary key, only a
    // unique(user_id, period_start) constraint, and PostgREST's
    // resolution=merge-duplicates only knows which constraint to upsert
    // against if told explicitly — without this it silently falls back to a
    // plain insert and 409s on the second request of the month.
    const upsertRes = await fetch(`${env.SUPABASE_URL}/rest/v1/tutor_usage?on_conflict=user_id,period_start`, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({ user_id: userId, period_start: periodStart, request_count: currentCount + 1 }),
    });
    if (!upsertRes.ok) throw new Error(`tutor_usage upsert failed: ${upsertRes.status}`);
  } catch (e) {
    return { status: 502, body: { error: "Could not update your usage right now. Try again shortly." } };
  }

  return null; // authenticated, subscribed, under quota — proceed to Ollama
}

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
    // Content-Type was here from the start; Authorization was added once
    // logged-in requests started sending a bearer token (see tutor.js) but
    // the preflight allowlist below never caught up — without it the browser
    // blocks the actual request before it's even sent, which surfaces to the
    // user as a generic "couldn't reach the server" network error.
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
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
    "You are a patient, encouraging SAT Math tutor. Keep answers concise (under 200 words unless the student explicitly asks for more detail), use plain language, and reason step by step when explaining math. Never just restate the final answer without explaining the reasoning. Only discuss SAT-level math — politely decline anything else." +
    " Formatting rules — the student's screen renders a specific Markdown subset: \"### \" headers, \"- \" bullet points, \"1. \" numbered lists, **bold**, and *italic*; nothing else gets rendered, so avoid it entirely: no horizontal rules (---), no code blocks or backticks, no tables, no nested/multi-level lists, no LaTeX (\\( \\), \\[ \\], $ $, \\frac, \\sqrt). For math specifically, write exponents as x^2, square roots as sqrt(16), fractions as a/b, multiplication as 2 * 3, and inequalities as <= >= !=. Put standalone equations on their own line rather than burying them mid-sentence, but as plain text within a normal paragraph — not inside a code block.";

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

Based on the specific pattern of what they missed (not generic SAT advice), identify the 2-3 most important fundamental skills or concepts for this student to focus on next, in priority order, and give one concrete, actionable way to practice each.

Structure the whole reply as a clean study-plan document, since the student can download it as a PDF: a "### " header per skill in the form "### 1. Skill name" (number them in priority order), then within each section a **Why it matters:** label followed by one sentence, and a **Actionable practice:** label followed by one concrete drill. Close with one short paragraph tying the plan together — no header on that closing paragraph.`;
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
