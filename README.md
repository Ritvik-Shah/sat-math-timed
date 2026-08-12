# SAT Math — Practice

A no-build, static SAT-style math practice site designed to stop students from just pasting
questions into AI:

- **10,000+ unique questions, generated on the fly** — see [Question generation](#question-generation)
  below for how this works and why it's more reliable than a hand-written question bank at this scale.
- **Diagrams, graphs, and tables** — questions that need a figure get one: right triangles, circles,
  boxes, and coordinate-plane graphs are rendered as inline SVG built from the question's own numbers;
  data-analysis questions that call for a bar chart, scatterplot, or table (including two-way
  frequency tables) get one too. See [diagrams.js](diagrams.js).
- **Timed or untimed sessions** — timed mode gives each question 65–105 seconds based on difficulty;
  untimed removes the clock. Either way, Lockdown Mode and fullscreen stay on.
- **Work required** — students must type a minimum amount of real work/reasoning in a text box
  before the submit button unlocks.
- **Lockdown Mode (always on)** — if the student switches tabs, loses window focus, or exits
  fullscreen while a question is active, that question is immediately marked wrong and swapped
  out for a freshly generated one.
- **Category drilling** — practice a single SAT content domain (Algebra, Advanced Math,
  Problem Solving & Data Analysis, Geometry & Trigonometry), or mix all four at the real digital
  SAT's approximate weighting (35% / 35% / 15% / 15%).
- **Session lengths** — 5, 10, 15, 20, or a Full Practice Test (44 questions, matching the digital
  SAT Math section).
- **Score breakdown with explanations** — after a session, see a per-category right/wrong
  breakdown plus a full review of every question, with a worked "why" explanation for anything
  missed.
- **No-repeat cache** — each attempted question's exact parameters are cached in the browser's
  `localStorage` so you won't see the same question twice. Once a template's easily-reachable
  variations are exhausted, its cache resets and starts producing fresh values again. Clear it
  anytime from the "Reset practice history" link on the start screen.
- **AI Tutor (optional)** — on the results screen, "Get My AI Study Plan" analyzes what you missed
  and tells you what fundamentals to focus on; each question in the review list has an "Ask AI to
  explain" chat that uses your own submitted work to pinpoint where your reasoning went wrong (or
  just answers whatever you're stuck on). This is powered by an LLM (gpt-oss via Ollama Cloud)
  behind a small Cloudflare Worker proxy — see [worker/README.md](worker/README.md) to set it up.
  It's entirely optional; the rest of the site works with zero setup and no API key.

## Question generation

Rather than hand-writing thousands of static questions (error-prone at that scale — a single typo
in an answer key silently teaches the wrong thing), [generator.js](generator.js) defines ~40
parametrized templates across the four SAT Math content domains. Each template:

1. Picks random parameters (numbers, points, coefficients — whatever the problem needs).
2. Builds the question prompt from those exact numbers.
3. **Computes** the correct answer from the same numbers (never hand-typed).
4. Builds a step-by-step explanation from the same numbers.

With dozens of independent random parameters per template across 40 templates, the reachable
space of distinct question instances is in the hundreds of thousands — comfortably past 10,000 —
and every single one is guaranteed mathematically correct because the answer is derived, not
authored. This was verified with a fuzz test that generated 25,000+ questions across every
template and checked structural and numeric correctness (see the template list in
[generator.js](generator.js) for exactly what's covered).

## Running locally

No build step. Just open `index.html` in a browser, or serve the folder:

```bash
npx serve .
```

## Deploying to GitHub Pages

1. Push this repo to GitHub.
2. In the repo, go to **Settings → Pages**.
3. Under "Build and deployment", set **Source** to `Deploy from a branch`, branch `main`, folder `/ (root)`.
4. Save — the site will be live at `https://<username>.github.io/<repo-name>/`.

## Adding a new question template

Templates live in [generator.js](generator.js), registered with `registerMC(...)` (multiple
choice) or `registerGrid(...)` (numeric free-response). Each template's `build()` function returns
the prompt, the computed correct answer (plus plausible wrong options for MC), a step-by-step
explanation, and the raw `params` used (for the no-repeat signature). Follow the existing
templates as a pattern — pick target values first, then derive the "given" numbers from them, so
answers stay clean and explanations stay simple.

## Notes on Lockdown Mode

Lockdown Mode uses the browser's Page Visibility API, window focus/blur events, and the
Fullscreen API. It raises the difficulty of casually alt-tabbing to an AI tool mid-question, but
it is **not** a proctoring-grade anti-cheat system — a determined student can still work around it
(e.g. a second device). Treat it as a deterrent and honesty nudge, not a guarantee.
