(function () {
  "use strict";

  const BANK = window.SAT_MATH_BANK;
  const SEEN_KEY = "satmath_seen_v2";
  const MIN_WORK_CHARS = 20;

  // ---------- DOM ----------
  const setupScreen = document.getElementById("setupScreen");
  const quizScreen = document.getElementById("quizScreen");
  const resultsScreen = document.getElementById("resultsScreen");
  const progressScreen = document.getElementById("progressScreen");
  const lockdownBadge = document.getElementById("lockdownBadge");
  const accountSlot = document.getElementById("accountSlot");

  const authModal = document.getElementById("authModal");
  const authModalClose = document.getElementById("authModalClose");
  const authError = document.getElementById("authError");
  const loginForm = document.getElementById("loginForm");
  const loginEmail = document.getElementById("loginEmail");
  const loginPassword = document.getElementById("loginPassword");
  const setPasswordForm = document.getElementById("setPasswordForm");
  const newPassword = document.getElementById("newPassword");
  const confirmPassword = document.getElementById("confirmPassword");

  const progressEmptyState = document.getElementById("progressEmptyState");
  const progressContent = document.getElementById("progressContent");
  const progressStatsEl = document.getElementById("progressStats");
  const accuracyTrendEl = document.getElementById("accuracyTrend");
  const progressCategoryBreakdownEl = document.getElementById("progressCategoryBreakdown");
  const pathTo800Btn = document.getElementById("pathTo800Btn");
  const pathTo800Content = document.getElementById("pathTo800Content");
  const progressBackBtn = document.getElementById("progressBackBtn");

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
  const requiredMark = document.getElementById("requiredMark");
  const submitBtn = document.getElementById("submitBtn");
  const feedbackEl = document.getElementById("feedback");

  const scoreSummaryEl = document.getElementById("scoreSummary");
  const violationsSummaryEl = document.getElementById("violationsSummary");
  const studyPlanBtn = document.getElementById("studyPlanBtn");
  const studyPlanContent = document.getElementById("studyPlanContent");
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
  //
  // Anonymous path (localStorage seenSet) is unchanged. When logged-in+subscribed,
  // a question is ALSO considered "seen" if it's in serverSeenSet — an in-memory
  // Set populated once at session start from a single Supabase query (see
  // startBtn's click handler) rather than queried per-question here.
  function generateUniqueQuestion(categoryFilter) {
    let q, tries = 0;
    do {
      q = BANK.generateQuestion(categoryFilter);
      tries++;
    } while ((seenSet.has(q.signature) || (isSubscribed && serverSeenSet.has(q.signature))) && tries < 60);

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
  let sessionStartedAt = null;

  // ---------- Account / subscription state ----------
  // Cached rather than re-checked per-render: AUTH.isSubscribed() is async and
  // hits the network, so it's only re-evaluated on auth state changes.
  let currentUser = null;
  let currentSession = null;
  let isSubscribed = false;
  let serverSeenSet = new Set(); // populated once per session, when subscribed (see startBtn)

  function show(el) { el.classList.remove("hidden"); }
  function hide(el) { el.classList.add("hidden"); }

  // ---------- Account / Auth ----------
  function renderAccountSlot() {
    accountSlot.innerHTML = "";
    if (!currentUser) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "account-tab account-tab-login";
      btn.textContent = "Log in";
      btn.addEventListener("click", openAuthModal);
      accountSlot.appendChild(btn);
      return;
    }

    const label = document.createElement("span");
    label.className = "account-email";
    label.textContent = currentUser.email;
    accountSlot.appendChild(label);

    if (isSubscribed) {
      const progressTab = document.createElement("button");
      progressTab.type = "button";
      progressTab.className = "account-tab account-tab-progress";
      const isOnProgressScreen = !progressScreen.classList.contains("hidden");
      if (isOnProgressScreen) progressTab.classList.add("active");
      progressTab.textContent = "📊 Progress";
      progressTab.addEventListener("click", openProgressScreen);
      accountSlot.appendChild(progressTab);
    }

    const logoutBtn = document.createElement("button");
    logoutBtn.type = "button";
    logoutBtn.className = "account-tab account-tab-logout";
    logoutBtn.textContent = "Log out";
    logoutBtn.addEventListener("click", () => AUTH.signOut());
    accountSlot.appendChild(logoutBtn);
  }

  function openAuthModal() {
    authError.textContent = "";
    hide(authError);
    if (AUTH.isInviteOrRecoveryFlow()) {
      hide(loginForm);
      show(setPasswordForm);
    } else {
      show(loginForm);
      hide(setPasswordForm);
    }
    show(authModal);
  }
  function closeAuthModal() {
    hide(authModal);
  }
  authModalClose.addEventListener("click", closeAuthModal);

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    authError.textContent = "";
    hide(authError);
    const loginSubmitBtn = document.getElementById("loginSubmitBtn");
    loginSubmitBtn.disabled = true;
    try {
      await AUTH.signIn(loginEmail.value, loginPassword.value);
      loginForm.reset();
      closeAuthModal();
    } catch (e) {
      authError.textContent = e.message || "Login failed. Check your email and password.";
      show(authError);
    } finally {
      loginSubmitBtn.disabled = false;
    }
  });

  setPasswordForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    authError.textContent = "";
    hide(authError);
    if (newPassword.value !== confirmPassword.value) {
      authError.textContent = "Passwords don't match.";
      show(authError);
      return;
    }
    const setPasswordSubmitBtn = document.getElementById("setPasswordSubmitBtn");
    setPasswordSubmitBtn.disabled = true;
    try {
      await AUTH.setPassword(newPassword.value);
      setPasswordForm.reset();
      closeAuthModal();
    } catch (e) {
      authError.textContent = e.message || "Couldn't set password. Try again.";
      show(authError);
    } finally {
      setPasswordSubmitBtn.disabled = false;
    }
  });

  // On page load, if this is an invite/recovery link, surface the
  // set-password form immediately instead of waiting for a "Log in" click.
  if (window.AUTH && AUTH.isInviteOrRecoveryFlow()) {
    openAuthModal();
  }

  if (window.AUTH) {
    AUTH.onAuthChange(async (user, session) => {
      currentUser = user;
      currentSession = session;
      isSubscribed = false;
      renderAccountSlot();
      if (user) {
        try {
          isSubscribed = await AUTH.isSubscribed();
        } catch (e) {
          isSubscribed = false;
        }
        renderAccountSlot();
      }
    });
  }

  function openProgressScreen() {
    hide(setupScreen);
    hide(quizScreen);
    hide(resultsScreen);
    show(progressScreen);
    loadProgressScreen();
    renderAccountSlot(); // re-render so the Progress tab shows as active
  }

  progressBackBtn.addEventListener("click", () => {
    hide(progressScreen);
    show(setupScreen);
    renderAccountSlot(); // clear the Progress tab's active state
  });

  // ---------- Setup screen ----------
  startBtn.addEventListener("click", async () => {
    settings.category = categorySelect.value;
    settings.count = parseInt(questionCountSelect.value, 10);
    settings.timed = document.querySelector('input[name="timedMode"]:checked').value === "timed";

    // Subscribed accounts also dedup against server-side history: fetch it
    // once here (a single query) rather than per-question in the generation loop.
    serverSeenSet = new Set();
    if (isSubscribed && currentUser) {
      try {
        const { data } = await AUTH.getClient()
          .from("question_attempts")
          .select("signature")
          .eq("user_id", currentUser.id);
        if (data) data.forEach((row) => serverSeenSet.add(row.signature));
      } catch (e) {
        // Best-effort: fall back to localStorage-only dedup if this query fails.
      }
    }

    sessionQuestions = Array.from({ length: settings.count }, () => generateUniqueQuestion(settings.category));
    currentIndex = 0;
    results = [];
    sessionStartedAt = new Date().toISOString();

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

    // Fire-and-forget: start loading the AI model now so it's hopefully
    // already warm by the time the student reaches the results screen.
    TUTOR.warmup();
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
    requiredMark.textContent = settings.timed ? "(optional)" : "(required — explain your steps)";
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
    if (settings.timed) {
      workHint.textContent = "Optional in timed mode — jot down your reasoning if it helps.";
      workHint.classList.add("ok");
    } else if (len >= MIN_WORK_CHARS) {
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
    const hasWork = settings.timed || workArea.value.trim().length >= MIN_WORK_CHARS;
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
    renderFeedback({ timedOut, flagged });

    submitBtn.disabled = false;
    submitBtn.textContent = currentIndex === sessionQuestions.length - 1 ? "See Results" : "Next Question";
    submitBtn.onclick = advance;

    // Fire-and-forget: record this attempt server-side for subscribed accounts.
    // Never awaited, never allowed to throw into the UI flow — mirrors
    // TUTOR.warmup()'s fire-and-forget pattern.
    if (isSubscribed && currentUser && AUTH.getClient()) {
      AUTH.getClient()
        .rpc("upsert_question_attempt", {
          p_signature: q.signature,
          p_category: q.category,
          p_subcategory: q.subcategory || null,
          p_correct: correct,
        })
        .then(() => {})
        .catch(() => {});
    }
  }

  function lockControls() {
    workArea.disabled = true;
    [...qOptionsEl.querySelectorAll("button, input")].forEach((el) => (el.disabled = true));
  }

  function renderFeedback({ timedOut, flagged }) {
    // Correctness, the right answer, and explanations are always saved for
    // the results screen at the end — timed or not — so a session plays out
    // like a real test instead of confirming each answer as you go.
    feedbackEl.className = "feedback neutral";
    const headline = flagged ? "Flagged — moving to a new question." : timedOut ? "Time's up." : "Answer recorded.";
    feedbackEl.innerHTML = `<strong>${headline}</strong> Results and explanations are available when the session ends.`;
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

    hide(studyPlanContent);
    studyPlanContent.innerHTML = "";
    studyPlanBtn.disabled = false;
    studyPlanBtn.textContent = "🤖 Get My AI Study Plan";

    renderCategoryBreakdown();
    renderReviewList();

    // Fire-and-forget: save a session summary row for subscribed accounts.
    // Never awaited, never allowed to throw into the UI flow.
    if (isSubscribed && currentUser && AUTH.getClient()) {
      const byCategory = {};
      results.forEach((r) => {
        const cat = r.question.category;
        if (!byCategory[cat]) byCategory[cat] = { correct: 0, total: 0 };
        byCategory[cat].total++;
        if (r.correct) byCategory[cat].correct++;
      });
      const categoryBreakdown = Object.entries(byCategory).map(([category, s]) => ({
        category, correct: s.correct, total: s.total,
      }));
      AUTH.getClient()
        .from("sessions")
        .insert({
          user_id: currentUser.id,
          category_filter: settings.category,
          question_count: settings.count,
          timed: settings.timed,
          correct_count: correctCount,
          total_count: total,
          flagged_count: flaggedCount,
          category_breakdown: categoryBreakdown,
          started_at: sessionStartedAt,
          finished_at: new Date().toISOString(),
        })
        .then(() => {})
        .catch(() => {});
    }
  }

  // ---------- AI Tutor ----------
  function buildQuestionContext(r) {
    const q = r.question;
    const correctAnswerText =
      q.type === "mc" ? `${String.fromCharCode(65 + q.answer)}. ${q.options[q.answer]}` : q.answer;
    return {
      category: q.category,
      subcategory: q.subcategory,
      prompt: q.prompt,
      correctAnswer: String(correctAnswerText),
      studentAnswer: r.userAnswerDisplay,
      workText: r.workText,
      explanation: q.explanation,
    };
  }

  function buildSummaryContext() {
    const byCategory = {};
    results.forEach((r) => {
      const cat = r.question.category;
      if (!byCategory[cat]) byCategory[cat] = { correct: 0, total: 0 };
      byCategory[cat].total++;
      if (r.correct) byCategory[cat].correct++;
    });
    const categoryBreakdown = Object.entries(byCategory).map(([category, s]) => ({
      category, correct: s.correct, total: s.total,
    }));
    const missedQuestions = results
      .filter((r) => !r.correct)
      .map((r) => {
        const ctx = buildQuestionContext(r);
        return {
          category: ctx.category, subcategory: ctx.subcategory, prompt: ctx.prompt,
          correctAnswer: ctx.correctAnswer, studentAnswer: ctx.studentAnswer,
        };
      });
    return {
      totalCorrect: results.filter((r) => r.correct).length,
      totalQuestions: results.length,
      categoryBreakdown,
      missedQuestions,
    };
  }

  // ---------- Progress screen (Insights) ----------
  // Queries sessions/question_attempts directly via the Supabase client — RLS
  // already scopes results to the current user, so this doesn't need to route
  // through the Worker. Builds a richer context (accuracy trend + per-category/
  // subcategory strength/weakness) for a /tutor mode:"summary" "path to 800" call.
  let lastProgressData = null; // cached for the pathTo800Btn handler

  async function buildHistoricalSummaryContext() {
    const [{ data: sessions }, { data: attempts }] = await Promise.all([
      AUTH.getClient()
        .from("sessions")
        .select("*")
        .eq("user_id", currentUser.id)
        .order("finished_at", { ascending: true }),
      AUTH.getClient()
        .from("question_attempts")
        .select("category, subcategory, last_correct")
        .eq("user_id", currentUser.id),
    ]);

    const accuracyTrend = (sessions || []).map((s) => ({
      finishedAt: s.finished_at,
      correct: s.correct_count,
      total: s.total_count,
    }));

    const bySubcategory = {};
    (attempts || []).forEach((a) => {
      const key = `${a.category}${a.subcategory ? " · " + a.subcategory : ""}`;
      if (!bySubcategory[key]) bySubcategory[key] = { category: a.category, subcategory: a.subcategory, correct: 0, total: 0 };
      bySubcategory[key].total++;
      if (a.last_correct) bySubcategory[key].correct++;
    });
    const categoryBreakdown = Object.values(bySubcategory);

    return {
      sessions: sessions || [],
      attempts: attempts || [],
      accuracyTrend,
      categoryBreakdown,
    };
  }

  async function loadProgressScreen() {
    hide(progressContent);
    hide(progressEmptyState);
    accuracyTrendEl.innerHTML = `<div class="tutor-loading">Loading your history...</div>`;
    show(progressContent);

    if (!currentUser || !AUTH.getClient()) {
      hide(progressContent);
      show(progressEmptyState);
      return;
    }

    let data;
    try {
      data = await buildHistoricalSummaryContext();
    } catch (e) {
      hide(progressContent);
      progressEmptyState.textContent = "Couldn't load your history right now. Try again shortly.";
      show(progressEmptyState);
      return;
    }
    lastProgressData = data;

    if (data.sessions.length === 0) {
      hide(progressContent);
      progressEmptyState.textContent = "No practice sessions saved to your account yet. Complete a session while logged in and it'll show up here.";
      show(progressEmptyState);
      return;
    }

    hide(progressEmptyState);
    show(progressContent);
    renderProgressStats(data.sessions);
    renderSessionHistory(data.sessions);
    renderProgressCategoryBreakdown(data.categoryBreakdown);

    hide(pathTo800Content);
    pathTo800Content.innerHTML = "";
    pathTo800Btn.disabled = false;
    pathTo800Btn.textContent = "🤖 Generate My Path to 800";
  }

  // Whole-account rollup shown above the session-by-session list: total
  // sessions completed and lifetime accuracy across all of them.
  function renderProgressStats(sessions) {
    const sessionCount = sessions.length;
    const totalCorrect = sessions.reduce((sum, s) => sum + (s.correct_count || 0), 0);
    const totalQuestions = sessions.reduce((sum, s) => sum + (s.total_count || 0), 0);
    const pct = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
    progressStatsEl.innerHTML = `
      <div class="progress-stat"><span class="progress-stat-num">${sessionCount}</span> session${sessionCount === 1 ? "" : "s"} completed</div>
      <div class="progress-stat"><span class="progress-stat-num">${totalCorrect} / ${totalQuestions}</span> correct overall (${pct}%)</div>
    `;
  }

  // One row per completed session, most recent first: date, timed/untimed,
  // category filter, score, and any lockdown-flagged questions — everything
  // needed to answer "how did that session go" without re-deriving it from
  // question_attempts.
  function renderSessionHistory(sessions) {
    if (sessions.length === 0) {
      accuracyTrendEl.innerHTML = `<div class="progress-empty">No sessions yet.</div>`;
      return;
    }
    const mostRecentFirst = [...sessions].sort(
      (a, b) => new Date(b.finished_at) - new Date(a.finished_at)
    );
    accuracyTrendEl.innerHTML = mostRecentFirst
      .map((s) => {
        const correct = s.correct_count || 0;
        const total = s.total_count || 0;
        const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
        const date = s.finished_at
          ? new Date(s.finished_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
          : "—";
        const timedLabel = s.timed ? "Timed" : "Untimed";
        const category = s.category_filter && s.category_filter !== "MIX" ? s.category_filter : "Mixed";
        const flagged = s.flagged_count
          ? `<span class="session-flag">${s.flagged_count} flagged</span>`
          : "";
        return `
          <div class="cat-row">
            <div class="cat-row-head">
              <span>${escapeHtml(date)} · <span class="session-pill">${escapeHtml(timedLabel)}</span> · ${escapeHtml(category)}</span>
              <span>${correct} / ${total} (${pct}%) ${flagged}</span>
            </div>
            <div class="cat-bar"><div class="cat-bar-fill" style="width:${pct}%"></div></div>
          </div>
        `;
      })
      .join("");
  }

  function renderProgressCategoryBreakdown(breakdown) {
    if (breakdown.length === 0) {
      progressCategoryBreakdownEl.innerHTML = `<div class="progress-empty">No question history yet.</div>`;
      return;
    }
    progressCategoryBreakdownEl.innerHTML = breakdown
      .map((s) => {
        const pct = s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0;
        const label = s.subcategory ? `${s.category} · ${s.subcategory}` : s.category;
        return `
          <div class="cat-row">
            <div class="cat-row-head">
              <span>${escapeHtml(label)}</span>
              <span>${s.correct} / ${s.total} (${pct}%)</span>
            </div>
            <div class="cat-bar"><div class="cat-bar-fill" style="width:${pct}%"></div></div>
          </div>
        `;
      })
      .join("");
  }

  pathTo800Btn.addEventListener("click", async () => {
    if (!isSubscribed) {
      show(pathTo800Content);
      pathTo800Content.innerHTML = lockedTutorHtml();
      return;
    }
    if (!lastProgressData) return;
    pathTo800Btn.disabled = true;
    pathTo800Btn.textContent = "Thinking...";
    show(pathTo800Content);
    pathTo800Content.innerHTML = `<div class="tutor-loading">Analyzing your history...</div>`;
    try {
      const reply = await TUTOR.ask("summary", lastProgressData, [], (attempt) => {
        pathTo800Content.innerHTML = `<div class="tutor-loading">${escapeHtml(warmupMessage(attempt))}</div>`;
      });
      pathTo800Content.innerHTML = TUTOR.renderLite(reply);
    } catch (e) {
      pathTo800Content.innerHTML = `<div class="tutor-error">${escapeHtml(e.message)}</div>`;
    } finally {
      pathTo800Btn.disabled = false;
      pathTo800Btn.textContent = "🤖 Generate My Path to 800";
    }
  });

  function warmupMessage(attempt) {
    return attempt === 1
      ? "Waking up the AI model — first request can take up to a minute..."
      : `Still warming up (attempt ${attempt})...`;
  }

  // The Worker rejects explain/chat/summary requests from unauthenticated or
  // unsubscribed callers anyway — check the cached subscription status here so
  // the UI never fires a request that's guaranteed to bounce.
  const LOCKED_MESSAGE = "Ask the site admin for access to the AI Tutor.";
  function lockedTutorHtml() {
    return `<div class="tutor-locked">${escapeHtml(LOCKED_MESSAGE)}</div>`;
  }

  studyPlanBtn.addEventListener("click", async () => {
    if (!isSubscribed) {
      show(studyPlanContent);
      studyPlanContent.innerHTML = lockedTutorHtml();
      return;
    }
    studyPlanBtn.disabled = true;
    studyPlanBtn.textContent = "Thinking...";
    show(studyPlanContent);
    studyPlanContent.innerHTML = `<div class="tutor-loading">Analyzing your results...</div>`;
    try {
      const reply = await TUTOR.ask("summary", buildSummaryContext(), [], (attempt) => {
        studyPlanContent.innerHTML = `<div class="tutor-loading">${escapeHtml(warmupMessage(attempt))}</div>`;
      });
      studyPlanContent.innerHTML = TUTOR.renderLite(reply);
    } catch (e) {
      studyPlanContent.innerHTML = `<div class="tutor-error">${escapeHtml(e.message)}</div>`;
    } finally {
      studyPlanBtn.disabled = false;
      studyPlanBtn.textContent = "🤖 Get My AI Study Plan";
    }
  });

  function renderTutorMessages(idx) {
    const r = results[idx];
    const messagesEl = reviewListEl.querySelector(`[data-messages-idx="${idx}"]`);
    if (!messagesEl) return;
    let html = (r.tutorMessages || [])
      .map((m) => `<div class="tutor-bubble ${m.role}">${TUTOR.renderLite(m.content)}</div>`)
      .join("");
    if (r.tutorLoading) html += `<div class="tutor-bubble assistant tutor-loading">${escapeHtml(r.tutorLoadingText || "Thinking...")}</div>`;
    if (r.tutorError) html += `<div class="tutor-bubble error">${escapeHtml(r.tutorError)}</div>`;
    messagesEl.innerHTML = html;
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  async function fetchExplain(idx) {
    if (!isSubscribed) {
      const messagesEl = reviewListEl.querySelector(`[data-messages-idx="${idx}"]`);
      if (messagesEl) messagesEl.innerHTML = lockedTutorHtml();
      return;
    }
    const r = results[idx];
    r.tutorLoading = true;
    r.tutorLoadingText = "Thinking...";
    r.tutorError = null;
    renderTutorMessages(idx);
    try {
      const reply = await TUTOR.ask("explain", buildQuestionContext(r), [], (attempt) => {
        r.tutorLoadingText = warmupMessage(attempt);
        renderTutorMessages(idx);
      });
      r.tutorMessages.push({ role: "assistant", content: reply });
    } catch (e) {
      r.tutorError = e.message;
    } finally {
      r.tutorLoading = false;
      renderTutorMessages(idx);
    }
  }

  async function sendFollowUp(idx) {
    if (!isSubscribed) {
      const messagesEl = reviewListEl.querySelector(`[data-messages-idx="${idx}"]`);
      if (messagesEl) messagesEl.innerHTML = lockedTutorHtml();
      return;
    }
    const inputEl = reviewListEl.querySelector(`[data-input-idx="${idx}"]`);
    if (!inputEl) return;
    const text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = "";
    const r = results[idx];
    r.tutorMessages.push({ role: "user", content: text });
    r.tutorLoading = true;
    r.tutorLoadingText = "Thinking...";
    r.tutorError = null;
    renderTutorMessages(idx);
    try {
      const reply = await TUTOR.ask("chat", buildQuestionContext(r), r.tutorMessages, (attempt) => {
        r.tutorLoadingText = warmupMessage(attempt);
        renderTutorMessages(idx);
      });
      r.tutorMessages.push({ role: "assistant", content: reply });
    } catch (e) {
      r.tutorError = e.message;
    } finally {
      r.tutorLoading = false;
      renderTutorMessages(idx);
    }
  }

  reviewListEl.addEventListener("click", (e) => {
    const toggleBtn = e.target.closest(".tutor-toggle-btn");
    if (toggleBtn) {
      const idx = Number(toggleBtn.dataset.idx);
      const panel = reviewListEl.querySelector(`[data-panel-idx="${idx}"]`);
      if (!panel) return;
      if (panel.classList.contains("hidden")) {
        show(panel);
        toggleBtn.textContent = "🤖 Hide AI Tutor";
        const r = results[idx];
        if (!r.tutorMessages) r.tutorMessages = [];
        if (r.tutorMessages.length === 0) fetchExplain(idx);
      } else {
        hide(panel);
        toggleBtn.textContent = "🤖 Ask AI to explain";
      }
      return;
    }
    const sendBtn = e.target.closest(".tutor-send-btn");
    if (sendBtn) {
      sendFollowUp(Number(sendBtn.dataset.sendIdx));
    }
  });

  reviewListEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.classList.contains("tutor-input")) {
      e.preventDefault();
      sendFollowUp(Number(e.target.dataset.inputIdx));
    }
  });

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
        <div class="tutor-toggle-row">
          <button type="button" class="btn-link tutor-toggle-btn" data-idx="${i}">🤖 Ask AI to explain</button>
        </div>
        <div class="tutor-panel hidden" data-panel-idx="${i}">
          <div class="tutor-messages" data-messages-idx="${i}"></div>
          <div class="tutor-input-row">
            <input type="text" class="tutor-input" data-input-idx="${i}" placeholder="Ask a follow-up question..." />
            <button type="button" class="tutor-send-btn" data-send-idx="${i}">Send</button>
          </div>
        </div>
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
