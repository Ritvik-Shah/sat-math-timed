(function () {
  "use strict";

  const BANK = window.SAT_MATH_BANK;
  const SEEN_KEY = "satmath_seen_v2";
  const MIN_WORK_CHARS = 20;

  // ---------- DOM ----------
  const setupScreen = document.getElementById("setupScreen");
  const quizScreen = document.getElementById("quizScreen");
  const resultsScreen = document.getElementById("resultsScreen");
  const lockdownBadge = document.getElementById("lockdownBadge");

  const categorySelect = document.getElementById("categorySelect");
  const questionCountSelect = document.getElementById("questionCount");
  const startBtn = document.getElementById("startBtn");
  const historyCountEl = document.getElementById("historyCount");
  const resetHistoryBtn = document.getElementById("resetHistoryBtn");

  const qIndexEl = document.getElementById("qIndex");
  const qTotalEl = document.getElementById("qTotal");
  const qSubcategoryEl = document.getElementById("qSubcategory");
  const timerWrap = document.getElementById("timerWrap");
  const timerBar = document.getElementById("timerBar");
  const timerText = document.getElementById("timerText");
  const qCategoryEl = document.getElementById("qCategory");
  const qPromptEl = document.getElementById("qPrompt");
  const qVisualEl = document.getElementById("qVisual");
  const qOptionsEl = document.getElementById("qOptions");
  const workArea = document.getElementById("workArea");
  const workHint = document.getElementById("workHint");
  const submitBtn = document.getElementById("submitBtn");
  const feedbackEl = document.getElementById("feedback");

  const scoreSummaryEl = document.getElementById("scoreSummary");
  const violationsSummaryEl = document.getElementById("violationsSummary");
  const categoryBreakdownEl = document.getElementById("categoryBreakdown");
  const reviewListEl = document.getElementById("reviewList");
  const restartBtn = document.getElementById("restartBtn");

  const warningOverlay = document.getElementById("warningOverlay");
  const warningReason = document.getElementById("warningReason");
  const warningDismiss = document.getElementById("warningDismiss");

  // ---------- Repeat-avoidance cache (localStorage) ----------
  let seenSet = loadSeenSet();

  function loadSeenSet() {
    try {
      const raw = localStorage.getItem(SEEN_KEY);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch (e) {
      return new Set();
    }
  }
  function persistSeenSet() {
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify([...seenSet]));
    } catch (e) {
      /* localStorage unavailable (e.g. private mode) — cache just won't persist */
    }
  }
  function updateHistoryCount() {
    historyCountEl.textContent = `${seenSet.size} question${seenSet.size === 1 ? "" : "s"} attempted so far`;
  }
  updateHistoryCount();

  resetHistoryBtn.addEventListener("click", () => {
    if (!confirm("Clear your local practice history? You may see repeat questions again after this.")) return;
    seenSet = new Set();
    persistSeenSet();
    updateHistoryCount();
  });

  // Generates a question from the bank, avoiding anything already in the seen-cache.
  // If a template's reachable parameter space has been exhausted, its cache entries
  // are cleared so the pool of values for that template effectively renews.
  function generateUniqueQuestion(categoryFilter) {
    let q, tries = 0;
    do {
      q = BANK.generateQuestion(categoryFilter);
      tries++;
    } while (seenSet.has(q.signature) && tries < 60);

    if (seenSet.has(q.signature)) {
      const prefix = q.signature.split("|")[0] + "|";
      [...seenSet].forEach((s) => {
        if (s.startsWith(prefix)) seenSet.delete(s);
      });
    }
    seenSet.add(q.signature);
    persistSeenSet();
    updateHistoryCount();
    return q;
  }

  // ---------- State ----------
  let settings = { category: "MIX", count: 10, timed: true };
  let sessionQuestions = [];
  let currentIndex = 0;
  let results = [];
  let selectedOptionIndex = null;
  let timerHandle = null;
  let timerEndAt = 0;
  let timerTotal = 0;
  let questionResolved = false;
  let quizActive = false;
  let pendingSwap = false;

  function show(el) { el.classList.remove("hidden"); }
  function hide(el) { el.classList.add("hidden"); }

  // ---------- Setup screen ----------
  startBtn.addEventListener("click", async () => {
    settings.category = categorySelect.value;
    settings.count = parseInt(questionCountSelect.value, 10);
    settings.timed = document.querySelector('input[name="timedMode"]:checked').value === "timed";

    sessionQuestions = Array.from({ length: settings.count }, () => generateUniqueQuestion(settings.category));
    currentIndex = 0;
    results = [];

    try {
      await document.documentElement.requestFullscreen();
    } catch (e) {
      // fullscreen can be denied/unsupported by the browser; lockdown still runs on focus/visibility events
    }

    show(lockdownBadge);
    hide(setupScreen);
    show(quizScreen);
    quizActive = true;
    qTotalEl.textContent = String(settings.count);
    loadQuestion(currentIndex);
  });

  // ---------- Question rendering ----------
  function loadQuestion(index) {
    const q = sessionQuestions[index];
    questionResolved = false;
    selectedOptionIndex = null;

    qIndexEl.textContent = String(index + 1);
    qCategoryEl.textContent = q.category;
    qSubcategoryEl.textContent = q.subcategory || "";
    qPromptEl.textContent = q.prompt;
    if (q.visual) {
      qVisualEl.innerHTML = window.DIAGRAMS.renderVisual(q.visual);
      show(qVisualEl);
    } else {
      qVisualEl.innerHTML = "";
      hide(qVisualEl);
    }
    workArea.value = "";
    workArea.disabled = false;
    updateWorkHint();
    hide(feedbackEl);
    feedbackEl.className = "feedback hidden";
    submitBtn.textContent = "Submit Answer";
    submitBtn.disabled = true;
    submitBtn.onclick = handleSubmit;

    qOptionsEl.innerHTML = "";
    if (q.type === "mc") {
      q.options.forEach((opt, i) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "option-btn";
        btn.innerHTML = `<span class="opt-letter">${String.fromCharCode(65 + i)}</span><span>${opt}</span>`;
        btn.addEventListener("click", () => {
          selectedOptionIndex = i;
          [...qOptionsEl.children].forEach((c) => c.classList.remove("selected"));
          btn.classList.add("selected");
          updateSubmitEnabled();
        });
        qOptionsEl.appendChild(btn);
      });
    } else {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "grid-input";
      input.id = "gridInput";
      input.placeholder = "Enter your numeric answer";
      input.addEventListener("input", updateSubmitEnabled);
      qOptionsEl.appendChild(input);
    }

    if (settings.timed) {
      show(timerWrap);
      startTimer(q.timeLimit);
    } else {
      hide(timerWrap);
      stopTimer();
    }
  }

  function updateWorkHint() {
    const len = workArea.value.trim().length;
    if (len >= MIN_WORK_CHARS) {
      workHint.textContent = "Work requirement met.";
      workHint.classList.add("ok");
    } else {
      workHint.textContent = `Write at least ${MIN_WORK_CHARS} characters of real work to unlock submit. (${len}/${MIN_WORK_CHARS})`;
      workHint.classList.remove("ok");
    }
  }

  workArea.addEventListener("input", () => {
    updateWorkHint();
    updateSubmitEnabled();
  });

  function updateSubmitEnabled() {
    if (questionResolved) return;
    const q = sessionQuestions[currentIndex];
    const hasWork = workArea.value.trim().length >= MIN_WORK_CHARS;
    const hasAnswer =
      q.type === "mc"
        ? selectedOptionIndex !== null
        : (document.getElementById("gridInput") || {}).value?.trim().length > 0;
    submitBtn.disabled = !(hasWork && hasAnswer);
  }

  // ---------- Timer ----------
  function startTimer(seconds) {
    clearInterval(timerHandle);
    timerTotal = seconds;
    timerEndAt = Date.now() + seconds * 1000;
    timerBar.classList.remove("warn");
    timerText.classList.remove("warn");
    tickTimer();
    timerHandle = setInterval(tickTimer, 200);
  }

  function tickTimer() {
    const remainingMs = timerEndAt - Date.now();
    const remaining = Math.max(0, remainingMs / 1000);
    const pct = Math.max(0, Math.min(100, (remaining / timerTotal) * 100));
    timerBar.style.setProperty("--pct", pct + "%");
    timerText.textContent = formatTime(remaining);

    if (remaining <= 15) {
      timerBar.classList.add("warn");
      timerText.classList.add("warn");
    }

    if (remainingMs <= 0) {
      clearInterval(timerHandle);
      if (!questionResolved) handleTimeout();
    }
  }
  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.max(0, Math.floor(sec % 60));
    return `${m}:${String(s).padStart(2, "0")}`;
  }
  function stopTimer() {
    clearInterval(timerHandle);
  }

  // ---------- Submit / grading ----------
  function handleSubmit() {
    if (questionResolved) return;
    const q = sessionQuestions[currentIndex];
    let correct = false;
    let userAnswerDisplay = "";

    if (q.type === "mc") {
      correct = selectedOptionIndex === q.answer;
      userAnswerDisplay = `${String.fromCharCode(65 + selectedOptionIndex)}. ${q.options[selectedOptionIndex]}`;
    } else {
      const val = document.getElementById("gridInput").value.trim();
      correct = val === String(q.answer);
      userAnswerDisplay = val;
    }

    resolveQuestion({ correct, timedOut: false, flagged: false, userAnswerDisplay });
  }

  function handleTimeout() {
    resolveQuestion({ correct: false, timedOut: true, flagged: false, userAnswerDisplay: "(no answer — time expired)" });
  }

  function resolveQuestion({ correct, timedOut, flagged, userAnswerDisplay }) {
    questionResolved = true;
    stopTimer();
    const q = sessionQuestions[currentIndex];

    results.push({
      question: q,
      correct,
      timedOut,
      flagged,
      workText: workArea.value.trim(),
      userAnswerDisplay,
    });

    lockControls();
    renderFeedback({ correct, timedOut, flagged, q });

    submitBtn.disabled = false;
    submitBtn.textContent = currentIndex === sessionQuestions.length - 1 ? "See Results" : "Next Question";
    submitBtn.onclick = advance;
  }

  function lockControls() {
    workArea.disabled = true;
    [...qOptionsEl.querySelectorAll("button, input")].forEach((el) => (el.disabled = true));
  }

  function renderFeedback({ correct, timedOut, flagged, q }) {
    feedbackEl.className = "feedback " + (correct ? "correct" : "incorrect");
    const correctAnswerText = q.type === "mc" ? `${String.fromCharCode(65 + q.answer)}. ${q.options[q.answer]}` : q.answer;

    let headline;
    if (flagged) headline = "Marked wrong — lockdown violation.";
    else if (timedOut) headline = "Time's up — marked wrong.";
    else headline = correct ? "Correct!" : "Not quite.";

    feedbackEl.innerHTML = `
      <strong>${headline}</strong><br/>
      Correct answer: ${correctAnswerText}
      <div class="explanation">${escapeHtml(q.explanation)}</div>
    `;
    show(feedbackEl);
  }

  function advance() {
    if (currentIndex < sessionQuestions.length - 1) {
      currentIndex++;
      loadQuestion(currentIndex);
    } else {
      finishSession();
    }
  }

  // ---------- Lockdown mode (always on) ----------
  function isQuizLive() {
    return quizActive && !resultsVisible() && !questionResolved && !pendingSwap;
  }
  function resultsVisible() {
    return !resultsScreen.classList.contains("hidden");
  }

  function triggerLockdownViolation(reason) {
    if (!isQuizLive()) return;

    pendingSwap = true;
    questionResolved = true;
    stopTimer();

    const q = sessionQuestions[currentIndex];
    results.push({
      question: q,
      correct: false,
      timedOut: false,
      flagged: true,
      workText: workArea.value.trim(),
      userAnswerDisplay: `(flagged: ${reason})`,
    });

    lockControls();
    warningReason.innerHTML = `Your active question was marked <strong>wrong</strong> (${reason}) and replaced with a new one.`;
    show(warningOverlay);
  }

  warningDismiss.addEventListener("click", () => {
    hide(warningOverlay);
    pendingSwap = false;
    sessionQuestions[currentIndex] = generateUniqueQuestion(settings.category);
    loadQuestion(currentIndex);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) triggerLockdownViolation("tab switched or window hidden");
  });

  window.addEventListener("blur", () => {
    setTimeout(() => {
      if (document.hidden) return; // visibilitychange handler already caught it
      if (!document.hasFocus()) triggerLockdownViolation("window lost focus");
    }, 50);
  });

  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && quizActive) {
      triggerLockdownViolation("exited fullscreen");
    }
  });

  // ---------- Results ----------
  function finishSession() {
    quizActive = false;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    hide(quizScreen);
    show(resultsScreen);
    hide(lockdownBadge);

    const correctCount = results.filter((r) => r.correct).length;
    const flaggedCount = results.filter((r) => r.flagged).length;
    const total = results.length;

    scoreSummaryEl.innerHTML = `${correctCount} / ${total} <span style="font-size:16px;color:var(--text-dim);font-weight:500;"> correct</span>`;

    if (flaggedCount > 0) {
      violationsSummaryEl.textContent = `⚠️ ${flaggedCount} question${flaggedCount > 1 ? "s" : ""} auto-marked wrong due to lockdown violations (tab switch / focus loss / exited fullscreen).`;
      show(violationsSummaryEl);
    } else {
      hide(violationsSummaryEl);
    }

    renderCategoryBreakdown();
    renderReviewList();
  }

  function renderCategoryBreakdown() {
    const byCategory = {};
    results.forEach((r) => {
      const cat = r.question.category;
      if (!byCategory[cat]) byCategory[cat] = { correct: 0, total: 0 };
      byCategory[cat].total++;
      if (r.correct) byCategory[cat].correct++;
    });

    categoryBreakdownEl.innerHTML = "";
    Object.entries(byCategory).forEach(([cat, stat]) => {
      const pct = Math.round((stat.correct / stat.total) * 100);
      const row = document.createElement("div");
      row.className = "cat-row";
      row.innerHTML = `
        <div class="cat-row-head">
          <span>${cat}</span>
          <span>${stat.correct} / ${stat.total} (${pct}%)</span>
        </div>
        <div class="cat-bar"><div class="cat-bar-fill" style="width:${pct}%"></div></div>
      `;
      categoryBreakdownEl.appendChild(row);
    });
  }

  function renderReviewList() {
    reviewListEl.innerHTML = "";
    results.forEach((r, i) => {
      const div = document.createElement("div");
      const status = r.flagged ? "flagged" : r.correct ? "right" : "wrong";
      div.className = `review-item ${status}`;
      const tagText = r.flagged ? "Flagged" : r.correct ? "Correct" : r.timedOut ? "Timed Out" : "Wrong";
      const correctAnswerText =
        r.question.type === "mc"
          ? `${String.fromCharCode(65 + r.question.answer)}. ${r.question.options[r.question.answer]}`
          : r.question.answer;

      div.innerHTML = `
        <div class="review-q">Q${i + 1} · ${r.question.category}${r.question.subcategory ? " · " + r.question.subcategory : ""}: ${escapeHtml(r.question.prompt)}</div>
        <div class="review-meta">
          <span class="review-tag ${status}">${tagText}</span>
          Your answer: ${escapeHtml(r.userAnswerDisplay || "—")} &nbsp;|&nbsp; Correct answer: ${escapeHtml(String(correctAnswerText))}
        </div>
        ${r.workText ? `<div class="review-meta" style="margin-top:6px;">Work shown: "${escapeHtml(r.workText)}"</div>` : ""}
        ${!r.correct ? `<div class="review-explanation"><strong>Why:</strong> ${escapeHtml(r.question.explanation)}</div>` : ""}
      `;
      reviewListEl.appendChild(div);
    });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str);
    return div.innerHTML;
  }

  restartBtn.addEventListener("click", () => {
    hide(resultsScreen);
    show(setupScreen);
  });
})();
