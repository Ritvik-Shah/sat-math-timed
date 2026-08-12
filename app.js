(function () {
  "use strict";

  // ---------- DOM ----------
  const setupScreen = document.getElementById("setupScreen");
  const quizScreen = document.getElementById("quizScreen");
  const resultsScreen = document.getElementById("resultsScreen");
  const lockdownBadge = document.getElementById("lockdownBadge");

  const lockdownToggle = document.getElementById("lockdownToggle");
  const fullscreenToggle = document.getElementById("fullscreenToggle");
  const questionCountSelect = document.getElementById("questionCount");
  const startBtn = document.getElementById("startBtn");

  const qIndexEl = document.getElementById("qIndex");
  const qTotalEl = document.getElementById("qTotal");
  const timerBar = document.getElementById("timerBar");
  const timerText = document.getElementById("timerText");
  const qCategoryEl = document.getElementById("qCategory");
  const qPromptEl = document.getElementById("qPrompt");
  const qOptionsEl = document.getElementById("qOptions");
  const workArea = document.getElementById("workArea");
  const workHint = document.getElementById("workHint");
  const submitBtn = document.getElementById("submitBtn");
  const feedbackEl = document.getElementById("feedback");

  const scoreSummaryEl = document.getElementById("scoreSummary");
  const violationsSummaryEl = document.getElementById("violationsSummary");
  const reviewListEl = document.getElementById("reviewList");
  const restartBtn = document.getElementById("restartBtn");

  const warningOverlay = document.getElementById("warningOverlay");
  const warningDismiss = document.getElementById("warningDismiss");

  const MIN_WORK_CHARS = 20;

  // ---------- State ----------
  let settings = { lockdown: true, fullscreen: true, count: 10 };
  let sessionQuestions = [];
  let reservePool = [];
  let currentIndex = 0;
  let results = []; // { question, correct, timedOut, flagged, workText, selectedAnswer }
  let selectedOptionIndex = null;
  let timerHandle = null;
  let timerEndAt = 0;
  let timerTotal = 0;
  let questionResolved = false; // true once answered/timed-out/flagged, guards double-handling
  let quizActive = false; // true while the quiz screen is live (between start and results)
  let pendingSwap = false; // true while warning overlay is showing, waiting for dismiss

  // ---------- Helpers ----------
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.max(0, Math.floor(sec % 60));
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function show(el) { el.classList.remove("hidden"); }
  function hide(el) { el.classList.add("hidden"); }

  // ---------- Setup screen ----------
  startBtn.addEventListener("click", async () => {
    settings.lockdown = lockdownToggle.checked;
    settings.fullscreen = fullscreenToggle.checked;
    settings.count = parseInt(questionCountSelect.value, 10);

    const pool = shuffle(QUESTIONS);
    sessionQuestions = pool.slice(0, settings.count);
    reservePool = pool.slice(settings.count);
    currentIndex = 0;
    results = [];

    if (settings.fullscreen) {
      try {
        await document.documentElement.requestFullscreen();
      } catch (e) {
        // fullscreen can be denied/unsupported; continue anyway
      }
    }

    lockdownBadge.classList.toggle("hidden", !settings.lockdown);

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
    qPromptEl.textContent = q.prompt;
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

    startTimer(q.timeLimit);
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
    const q = sessionQuestions[currentIndex];
    let userAnswerDisplay = "(no answer — time expired)";
    resolveQuestion({ correct: false, timedOut: true, flagged: false, userAnswerDisplay });
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
    const correctAnswerText =
      q.type === "mc" ? `${String.fromCharCode(65 + q.answer)}. ${q.options[q.answer]}` : q.answer;

    let headline;
    if (flagged) headline = "Marked wrong — lockdown violation.";
    else if (timedOut) headline = "Time's up — marked wrong.";
    else headline = correct ? "Correct!" : "Not quite.";

    feedbackEl.innerHTML = `<strong>${headline}</strong><br/>Correct answer: ${correctAnswerText}`;
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

  // ---------- Lockdown mode ----------
  function isQuizLive() {
    return quizActive && !resultsVisible() && !questionResolved && !pendingSwap;
  }

  function resultsVisible() {
    return !resultsScreen.classList.contains("hidden");
  }

  function triggerLockdownViolation(reason) {
    if (!settings.lockdown) return;
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
    show(warningOverlay);
  }

  warningDismiss.addEventListener("click", () => {
    hide(warningOverlay);
    pendingSwap = false;

    // Swap the flagged question out for a fresh one from the reserve pool, if available.
    if (reservePool.length > 0) {
      const next = reservePool.shift();
      sessionQuestions[currentIndex] = next;
      loadQuestion(currentIndex);
    } else if (currentIndex < sessionQuestions.length - 1) {
      currentIndex++;
      loadQuestion(currentIndex);
    } else {
      finishSession();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) triggerLockdownViolation("tab switched or window hidden");
  });

  window.addEventListener("blur", () => {
    // Debounce: only fires as a violation if the page is still nominally "visible"
    // per visibilitychange (covers alt-tab / switching apps on some platforms)
    // but skip if we already handled it via visibilitychange.
    setTimeout(() => {
      if (document.hidden) return; // visibilitychange handler already caught it
      if (!document.hasFocus()) triggerLockdownViolation("window lost focus");
    }, 50);
  });

  document.addEventListener("fullscreenchange", () => {
    if (settings.fullscreen && settings.lockdown && !document.fullscreenElement && quizActive) {
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

    const correctCount = results.filter((r) => r.correct).length;
    const flaggedCount = results.filter((r) => r.flagged).length;
    const total = results.length;

    scoreSummaryEl.innerHTML = `${correctCount} / ${total} <span style="font-size:16px;color:var(--text-dim);font-weight:500;"> correct</span>`;

    if (flaggedCount > 0) {
      violationsSummaryEl.textContent = `⚠️ ${flaggedCount} question${flaggedCount > 1 ? "s" : ""} auto-marked wrong due to lockdown violations (tab switch / focus loss).`;
      show(violationsSummaryEl);
    } else {
      hide(violationsSummaryEl);
    }

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
        <div class="review-q">Q${i + 1}: ${r.question.prompt}</div>
        <div class="review-meta">
          <span class="review-tag ${status}">${tagText}</span>
          Your answer: ${r.userAnswerDisplay || "—"} &nbsp;|&nbsp; Correct answer: ${correctAnswerText}
        </div>
        ${r.workText ? `<div class="review-meta" style="margin-top:6px;">Work shown: "${escapeHtml(r.workText)}"</div>` : ""}
      `;
      reviewListEl.appendChild(div);
    });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  restartBtn.addEventListener("click", () => {
    hide(resultsScreen);
    show(setupScreen);
    lockdownBadge.classList.add("hidden");
  });
})();
