# SAT Math — Timed Practice

A no-build, static SAT-style math practice site designed to stop students from just pasting
questions into AI:

- **Timed questions** — each question has a countdown (75–105s depending on difficulty). Time
  runs out, it's marked wrong.
- **Work required** — students must type a minimum amount of real work/reasoning in a text box
  before the submit button unlocks.
- **Lockdown Mode** — if the student switches tabs, loses window focus, or exits fullscreen while
  a question is active, that question is immediately marked wrong and swapped out for a different
  question from the bank.

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

## Adding questions

Edit [questions.js](questions.js). Each question is:

```js
{
  id: "unique-id",
  category: "Algebra",
  type: "mc" | "grid",       // multiple choice or numeric free-response
  prompt: "...",
  options: ["...", "...", "...", "..."], // mc only
  answer: 0,                  // mc: option index; grid: string of the numeric answer
  timeLimit: 90,               // seconds
}
```

## Notes on Lockdown Mode

Lockdown Mode uses the browser's Page Visibility API, window focus/blur events, and the
Fullscreen API. It raises the difficulty of casually alt-tabbing to an AI tool mid-question, but
it is **not** a proctoring-grade anti-cheat system — a determined student can still work around it
(e.g. a second device). Treat it as a deterrent and honesty nudge, not a guarantee.
