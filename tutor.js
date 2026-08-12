// Thin client for the AI Tutor Cloudflare Worker (see worker/). Talks to
// whatever URL is set in tutor-config.js — no API key lives in this file or
// anywhere else in the browser.

(function (root) {
  "use strict";

  async function ask(mode, context, messages) {
    const apiUrl = (window.TUTOR_CONFIG && window.TUTOR_CONFIG.apiUrl) || "";
    if (!apiUrl || apiUrl.includes("REPLACE_WITH_YOUR_WORKER_URL")) {
      throw new Error("The AI Tutor isn't set up yet. Deploy worker/ and set apiUrl in tutor-config.js.");
    }

    let res;
    try {
      res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

    if (!res.ok) {
      throw new Error(data.error || `AI Tutor request failed (${res.status}).`);
    }
    return data.reply;
  }

  // Minimal, safe renderer for the LLM's reply: escapes HTML first, then
  // supports **bold**, `code`, "- " bullet lists, and paragraph breaks.
  function renderLite(text) {
    const esc = escapeHtml(text);
    const withBold = esc.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
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
    return html || `<p>${esc}</p>`;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str);
    return div.innerHTML;
  }

  root.TUTOR = { ask, renderLite };
})(window);
