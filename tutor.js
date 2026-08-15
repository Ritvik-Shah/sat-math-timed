// Thin client for the AI Tutor Cloudflare Worker (see worker/). Talks to
// whatever URL is set in tutor-config.js — no API key lives in this file or
// anywhere else in the browser.

(function (root) {
  "use strict";

  const WARMUP_MAX_ATTEMPTS = 10;
  const WARMUP_DELAY_MS = 4000;

  // Ollama Cloud models that have gone idle take a while (up to ~30-40s) to
  // load back in. The worker returns a distinguishable { code: "warming_up" }
  // for that case rather than sitting on the connection itself; retry here
  // instead, with an onProgress callback so the UI can show real feedback
  // rather than one long silent spinner.
  async function ask(mode, context, messages, onProgress) {
    const apiUrl = (window.TUTOR_CONFIG && window.TUTOR_CONFIG.apiUrl) || "";
    if (!apiUrl || apiUrl.includes("REPLACE_WITH_YOUR_WORKER_URL")) {
      throw new Error("The AI Tutor isn't set up yet. Deploy worker/ and set apiUrl in tutor-config.js.");
    }

    // Attach the Supabase access token when a session exists, so the Worker
    // can authorize explain/chat/summary requests (warmup stays open either
    // way). No header at all when logged out — anonymous warmup calls are
    // unaffected. The UI is expected to avoid calling explain/chat/summary in
    // the first place when logged out/unsubscribed; this header is defense in
    // depth for the subscribed case.
    const headers = { "Content-Type": "application/json" };
    if (window.AUTH) {
      const session = await AUTH.getSession();
      if (session && session.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }
    }

    for (let attempt = 1; attempt <= WARMUP_MAX_ATTEMPTS; attempt++) {
      let res;
      try {
        res = await fetch(apiUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({ mode, context, messages: messages || [] }),
        });
      } catch (e) {
        throw new Error("Couldn't reach the AI Tutor server. Check your connection or try again shortly.");
      }

      let data;
      try {
        data = await res.json();
      } catch (e) {
        throw new Error("The AI Tutor server returned an unreadable response.");
      }

      if (res.ok) return data.reply;

      if (data.code === "warming_up" && attempt < WARMUP_MAX_ATTEMPTS) {
        if (onProgress) onProgress(attempt);
        await new Promise((resolve) => setTimeout(resolve, WARMUP_DELAY_MS));
        continue;
      }

      throw new Error(data.error || `AI Tutor request failed (${res.status}).`);
    }
  }

  // Minimal, safe renderer for the LLM's reply: escapes HTML first, then
  // supports **bold**, `code`, "- " bullet lists, paragraph breaks, and
  // lightweight math formatting (see prettifyMath).
  function renderLite(text) {
    const esc = escapeHtml(text);
    // Defense in depth: the system prompt tells the model to stick to plain
    // prose/bullets/bold, but strip stray markdown this renderer doesn't
    // understand anyway, so it degrades to readable text instead of showing
    // raw "##"/"```"/"---" syntax if the model doesn't fully comply.
    const stripped = esc
      .replace(/^#{1,6}[ \t]*/gm, "")
      .replace(/^-{3,}[ \t]*$/gm, "")
      .replace(/```[a-zA-Z]*\n?/g, "")
      .replace(/```/g, "");
    const mathified = prettifyMath(stripped);
    const withBold = mathified.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    const withCode = withBold.replace(/`([^`]+)`/g, "<code>$1</code>");
    const lines = withCode.split("\n");
    let html = "";
    let inList = false;
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (/^[-*]\s+/.test(line)) {
        if (!inList) { html += "<ul>"; inList = true; }
        html += `<li>${line.replace(/^[-*]\s+/, "")}</li>`;
      } else {
        if (inList) { html += "</ul>"; inList = false; }
        if (line) html += `<p>${line}</p>`;
      }
    }
    if (inList) html += "</ul>";
    return html || `<p>${mathified}</p>`;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str);
    return div.innerHTML;
  }

  // Turns the plain-text math the model writes (per the worker's system
  // prompt: x^2, sqrt(16), <=, etc. — never LaTeX) into something more
  // readable: real superscripts, a root sign, and proper comparison/times
  // symbols. Runs on already-HTML-escaped text, so &lt;/&gt; entities are
  // what show up for < and >. Whitespace matches are restricted to [ \t]
  // (never \s) so a run-on match can't accidentally swallow a newline and
  // merge two lines together.
  function prettifyMath(escapedText) {
    const delatexed = stripLatexArtifacts(escapedText);
    return delatexed
      .replace(/&lt;=/g, "≤")
      .replace(/&gt;=/g, "≥")
      .replace(/!=/g, "≠")
      .replace(/\bsqrt\(([^)\n]+)\)/gi, "√($1)")
      .replace(/(\d)[ \t]*\*[ \t]*(\d)/g, "$1 × $2")
      .replace(/([A-Za-z0-9)\]])\^\(([^()\n]+)\)/g, "$1<sup>$2</sup>")
      .replace(/([A-Za-z0-9)\]])\^(-?\d+(?:\.\d+)?)/g, "$1<sup>$2</sup>");
  }

  // Defense in depth: the system prompt tells the model to never use LaTeX,
  // but smaller models don't always comply — strip the common LaTeX
  // artifacts down to plain text so a lapse degrades gracefully instead of
  // showing raw \( \), \frac{}{}, \text{} etc. Order matters: unwrap
  // delimiters and named commands before the plain-text math rules above run.
  function stripLatexArtifacts(text) {
    return text
      .replace(/\\\(|\\\)|\\\[|\\\]/g, "")
      .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "$1/$2")
      .replace(/\\sqrt\{([^{}]+)\}/g, "sqrt($1)")
      .replace(/\\text\{([^{}]*)\}/g, "$1")
      .replace(/\\quad/g, " ")
      .replace(/\\times/g, "*")
      .replace(/\\cdot/g, "*")
      .replace(/\\le\b/g, "≤")
      .replace(/\\ge\b/g, "≥")
      .replace(/\\neq\b/g, "≠")
      .replace(/\\pi\b/g, "π");
  }

  // Fire-and-forget: tells the worker to start loading the model now, so
  // it's hopefully already warm by the time the student reaches the results
  // screen. Silently does nothing if the tutor isn't configured, and never
  // throws — this must never disrupt the practice session itself.
  function warmup() {
    const apiUrl = (window.TUTOR_CONFIG && window.TUTOR_CONFIG.apiUrl) || "";
    if (!apiUrl || apiUrl.includes("REPLACE_WITH_YOUR_WORKER_URL")) return;
    fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "warmup" }),
    }).catch(() => {});
  }

  root.TUTOR = { ask, renderLite, warmup };
})(window);
