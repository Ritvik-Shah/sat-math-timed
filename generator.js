// Procedural SAT Math question generator.
//
// Rather than hand-writing thousands of static questions (error-prone at
// scale, and impossible to keep correct), each "template" below generates
// a fresh question from randomized parameters, computes its own answer and
// step-by-step explanation from those exact numbers, and reports a
// signature the caller can use to avoid repeats. With ~40 templates each
// spanning a wide parameter space, the reachable pool of distinct question
// instances is comfortably in the hundreds of thousands — far past 10,000 —
// while every single one is guaranteed correct because the answer is
// computed, not authored by hand.
//
// Categories and their weights mirror the digital SAT Math content domains.

(function (root) {
  "use strict";

  // ---------- Generic helpers ----------
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  function randIntNonZero(min, max) {
    let v;
    do { v = randInt(min, max); } while (v === 0);
    return v;
  }
  function choice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function gcd(a, b) {
    a = Math.abs(a); b = Math.abs(b);
    while (b) { [a, b] = [b, a % b]; }
    return a || 1;
  }
  function simplifyFraction(n, d) {
    if (d < 0) { n = -n; d = -d; }
    const g = gcd(n, d) || 1;
    return [n / g, d / g];
  }
  function fracStr(n, d) {
    const [sn, sd] = simplifyFraction(n, d);
    return sd === 1 ? String(sn) : `${sn}/${sd}`;
  }
  function roundTo(x, decimals) {
    const f = Math.pow(10, decimals);
    return Math.round(x * f) / f;
  }
  function fmtDecimal(x, decimals) {
    return roundTo(x, decimals).toFixed(decimals);
  }
  function fmtPercent1(x) {
    return `${fmtDecimal(x, 1)}%`;
  }
  // Formats a trinomial a*x^2 + b*x + c, omitting zero terms and handling signs/1-coefficients.
  function polyStr3(a, b, c) {
    const terms = [];
    if (a !== 0) terms.push([a, "x^2"]);
    if (b !== 0) terms.push([b, "x"]);
    if (c !== 0) terms.push([c, ""]);
    if (terms.length === 0) return "0";
    return terms
      .map(([coef, sym], i) => {
        const abs = Math.abs(coef);
        const coefStr = abs === 1 && sym ? "" : String(abs);
        const term = `${coefStr}${sym}`;
        if (i === 0) return coef < 0 ? `-${term}` : term;
        return coef < 0 ? ` - ${term}` : ` + ${term}`;
      })
      .join("");
  }
  const PYTHAGOREAN_TRIPLES = [
    [3, 4, 5], [5, 12, 13], [6, 8, 10], [8, 15, 17], [7, 24, 25],
    [9, 12, 15], [10, 24, 26], [12, 16, 20], [20, 21, 29], [9, 40, 41],
  ];
  function pythagTriple() {
    const t = choice(PYTHAGOREAN_TRIPLES);
    const scale = choice([1, 1, 1, 2]);
    return t.map((v) => v * scale);
  }

  // ---------- Categories ----------
  const CATEGORIES = {
    ALGEBRA: "Algebra",
    ADVANCED_MATH: "Advanced Math",
    DATA_ANALYSIS: "Problem Solving & Data Analysis",
    GEOMETRY: "Geometry & Trigonometry",
  };
  const CATEGORY_LIST = [
    CATEGORIES.ALGEBRA,
    CATEGORIES.ADVANCED_MATH,
    CATEGORIES.DATA_ANALYSIS,
    CATEGORIES.GEOMETRY,
  ];
  // Approximate digital SAT Math content-domain weighting.
  const CATEGORY_WEIGHTS = {
    [CATEGORIES.ALGEBRA]: 0.35,
    [CATEGORIES.ADVANCED_MATH]: 0.35,
    [CATEGORIES.DATA_ANALYSIS]: 0.15,
    [CATEGORIES.GEOMETRY]: 0.15,
  };

  // ---------- Template registry ----------
  const TEMPLATES = [];

  function registerMC({ id, category, subcategory, timeLimit, build }) {
    TEMPLATES.push({
      id, category, subcategory, type: "mc",
      generate() {
        let r, optionValues, tries = 0;
        do {
          r = build();
          optionValues = [r.correct, ...r.distractors];
          tries++;
        } while (new Set(optionValues).size !== optionValues.length && tries < 6);

        const options = shuffle(optionValues);
        const answer = options.indexOf(r.correct);
        return {
          category, subcategory, type: "mc",
          prompt: r.prompt,
          options,
          answer,
          explanation: r.explanation,
          visual: r.visual || null,
          timeLimit: r.timeLimit || timeLimit,
          signature: `${id}|${JSON.stringify(r.params)}`,
        };
      },
    });
  }

  function registerGrid({ id, category, subcategory, timeLimit, build }) {
    TEMPLATES.push({
      id, category, subcategory, type: "grid",
      generate() {
        const r = build();
        return {
          category, subcategory, type: "grid",
          prompt: r.prompt,
          answer: String(r.answer),
          explanation: r.explanation,
          visual: r.visual || null,
          timeLimit: r.timeLimit || timeLimit,
          signature: `${id}|${JSON.stringify(r.params)}`,
        };
      },
    });
  }

  // ================= ALGEBRA =================

  registerGrid({
    id: "alg-two-step", category: CATEGORIES.ALGEBRA, subcategory: "Linear equations", timeLimit: 80,
    build() {
      const x = randInt(-12, 12);
      const a = randInt(2, 9);
      const b = randInt(-20, 20);
      const c = a * x + b;
      const bTerm = b >= 0 ? `+ ${b}` : `- ${Math.abs(b)}`;
      return {
        prompt: `If ${a}x ${bTerm} = ${c}, what is the value of x?`,
        answer: x,
        explanation: `Subtract ${b} from both sides: ${a}x = ${c - b}. Divide both sides by ${a}: x = ${x}.`,
        params: { x, a, b },
      };
    },
  });

  registerGrid({
    id: "alg-distribute", category: CATEGORIES.ALGEBRA, subcategory: "Linear equations", timeLimit: 90,
    build() {
      const x = randInt(-10, 10);
      const a = randInt(2, 6);
      const b = randInt(-10, 10);
      let c = randInt(1, a + 3);
      if (c === a) c += 1;
      const d = (a - c) * x + a * b;
      const bTerm = b >= 0 ? `+ ${b}` : `- ${Math.abs(b)}`;
      const dTerm = d >= 0 ? `+ ${d}` : `- ${Math.abs(d)}`;
      return {
        prompt: `If ${a}(x ${bTerm}) = ${c}x ${dTerm}, what is the value of x?`,
        answer: x,
        explanation: `Distribute: ${a}x ${a * b >= 0 ? "+ " + a * b : "- " + Math.abs(a * b)} = ${c}x ${dTerm}. Move x-terms to one side: ${a - c}x = ${d - a * b}. Divide: x = ${x}.`,
        params: { x, a, b, c },
      };
    },
  });

  registerMC({
    id: "alg-slope", category: CATEGORIES.ALGEBRA, subcategory: "Linear functions", timeLimit: 80,
    build() {
      const m = randIntNonZero(-6, 6);
      const x1 = randInt(-6, 6);
      const dx = randInt(1, 6);
      const x2 = x1 + dx;
      const y1 = randInt(-10, 10);
      const y2 = y1 + m * dx;
      const correct = String(m);
      const distractors = [String(-m), fracStr(dx, y2 - y1), String(m + (m >= 0 ? 1 : -1))];
      return {
        prompt: `A line passes through the points (${x1}, ${y1}) and (${x2}, ${y2}). What is the slope of the line?`,
        correct, distractors,
        explanation: `Slope = (y2 - y1) / (x2 - x1) = (${y2} - ${y1}) / (${x2} - ${x1}) = ${y2 - y1}/${dx} = ${m}.`,
        params: { m, x1, dx, y1 },
        visual: {
          type: "coordinate-plane",
          plotPoints: [
            { x: x1, y: y1, label: `(${x1}, ${y1})` },
            { x: x2, y: y2, label: `(${x2}, ${y2})` },
          ],
          line: { m, b: y1 - m * x1 },
        },
      };
    },
  });

  registerGrid({
    id: "alg-sum-diff-system", category: CATEGORIES.ALGEBRA, subcategory: "Systems of linear equations", timeLimit: 85,
    build() {
      const x0 = randInt(-10, 10);
      const y0 = randInt(-10, 10);
      const s = x0 + y0;
      const d = x0 - y0;
      return {
        prompt: `If x + y = ${s} and x - y = ${d}, what is the value of x?`,
        answer: x0,
        explanation: `Add the two equations: (x + y) + (x - y) = ${s} + ${d}, so 2x = ${s + d}. Divide by 2: x = ${x0}.`,
        params: { x0, y0 },
      };
    },
  });

  registerMC({
    id: "alg-inequality", category: CATEGORIES.ALGEBRA, subcategory: "Linear inequalities", timeLimit: 85,
    build() {
      const a = choice([2, 3, 4, 5, -2, -3, -4, -5]);
      const x0 = randInt(-10, 10);
      const b = randInt(-15, 15);
      const c = a * x0 + b;
      const ops = ["<", ">", "≤", "≥"];
      const op = choice(ops);
      const flipMap = { "<": ">", ">": "<", "≤": "≥", "≥": "≤" };
      const finalOp = a < 0 ? flipMap[op] : op;
      const correct = `x ${finalOp} ${x0}`;
      const distractors = ops.filter((o) => o !== finalOp).map((o) => `x ${o} ${x0}`);
      const bTerm = b >= 0 ? `+ ${b}` : `- ${Math.abs(b)}`;
      return {
        prompt: `If ${a}x ${bTerm} ${op} ${c}, which of the following describes all solutions for x?`,
        correct, distractors,
        explanation: `Subtract ${b} from both sides: ${a}x ${op} ${c - b}. Divide both sides by ${a}${a < 0 ? " (flip the inequality sign since you're dividing by a negative number)" : ""}: x ${finalOp} ${x0}.`,
        params: { a, x0, b, op },
      };
    },
  });

  registerGrid({
    id: "alg-function-eval", category: CATEGORIES.ALGEBRA, subcategory: "Linear functions", timeLimit: 70,
    build() {
      const m = randIntNonZero(-8, 8);
      const b = randInt(-15, 15);
      const k = randInt(-10, 10);
      const answer = m * k + b;
      const bTerm = b >= 0 ? `+ ${b}` : `- ${Math.abs(b)}`;
      return {
        prompt: `The function f is defined by f(x) = ${m}x ${bTerm}. What is f(${k})?`,
        answer,
        explanation: `Substitute x = ${k}: f(${k}) = ${m}(${k}) ${bTerm} = ${m * k} ${bTerm} = ${answer}.`,
        params: { m, b, k },
      };
    },
  });

  registerMC({
    id: "alg-x-intercept", category: CATEGORIES.ALGEBRA, subcategory: "Linear functions", timeLimit: 85,
    build() {
      const m = choice([-6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6]);
      const b = randInt(-20, 20) || 3;
      const correct = `(${fracStr(-b, m)}, 0)`;
      const distractors = [`(0, ${b})`, `(${fracStr(b, m)}, 0)`, `(${-b}, 0)`];
      const bTerm = b >= 0 ? `+ ${b}` : `- ${Math.abs(b)}`;
      return {
        prompt: `The function f(x) = ${m}x ${bTerm} is graphed in the xy-plane. What is the x-intercept of the graph?`,
        correct, distractors,
        explanation: `The x-intercept occurs where f(x) = 0: ${m}x ${bTerm} = 0, so x = ${fracStr(-b, m)}. The x-intercept is (${fracStr(-b, m)}, 0).`,
        params: { m, b },
        visual: {
          type: "coordinate-plane",
          plotPoints: [{ x: 0, y: b, label: `(0, ${b})` }],
          line: { m, b },
        },
      };
    },
  });

  registerGrid({
    id: "alg-rate-word", category: CATEGORIES.ALGEBRA, subcategory: "Linear functions", timeLimit: 75,
    build() {
      const start = randInt(5, 100);
      const rate = randInt(2, 20);
      const t = randInt(2, 30);
      const answer = start + rate * t;
      return {
        prompt: `A tank starts with ${start} gallons of water and is filled at a constant rate of ${rate} gallons per minute. How many gallons will it contain after ${t} minutes?`,
        answer,
        explanation: `Total = starting amount + rate × time = ${start} + ${rate} × ${t} = ${start} + ${rate * t} = ${answer}.`,
        params: { start, rate, t },
      };
    },
  });

  registerGrid({
    id: "alg-abs-value", category: CATEGORIES.ALGEBRA, subcategory: "Linear equations", timeLimit: 100,
    build() {
      let a, xL, xG;
      do {
        a = randInt(2, 6);
        xL = randInt(-8, 7);
        xG = randInt(xL + 1, 8);
      } while ((xG + xL) % 2 !== 0);
      const b = (a * (xG + xL)) / 2;
      const c = (a * (xG - xL)) / 2;
      const bTerm = b >= 0 ? `- ${b}` : `+ ${Math.abs(b)}`;
      return {
        prompt: `If |${a}x ${bTerm}| = ${c}, what is the greatest possible value of x?`,
        answer: xG,
        explanation: `Split into two cases: ${a}x ${bTerm} = ${c} and ${a}x ${bTerm} = -${c}. Solving each gives x = ${xG} and x = ${xL}. The greatest value is ${xG}.`,
        params: { a, xL, xG },
      };
    },
  });

  registerGrid({
    id: "alg-substitution", category: CATEGORIES.ALGEBRA, subcategory: "Systems of linear equations", timeLimit: 80,
    build() {
      const a = randInt(2, 6);
      const b = randInt(2, 6);
      const k = randInt(-8, 8);
      const x0 = randInt(-10, 10);
      const c = a * x0 - b * k;
      return {
        prompt: `If ${a}x - ${b}y = ${c} and y = ${k}, what is the value of x?`,
        answer: x0,
        explanation: `Substitute y = ${k}: ${a}x - ${b}(${k}) = ${c}, so ${a}x = ${c} + ${b * k} = ${a * x0}. Divide by ${a}: x = ${x0}.`,
        params: { a, b, k, x0 },
      };
    },
  });

  // ================= ADVANCED MATH =================

  registerMC({
    id: "adv-factor-expand", category: CATEGORIES.ADVANCED_MATH, subcategory: "Equivalent expressions", timeLimit: 85,
    build() {
      const p = randIntNonZero(-9, 9);
      const q = randIntNonZero(-9, 9);
      const b = p + q, c = p * q;
      const correct = polyStr3(1, b, c);
      const distractors = [polyStr3(1, -b, c), polyStr3(1, b, -c), polyStr3(1, -b, -c)];
      const pTerm = p >= 0 ? `+ ${p}` : `- ${Math.abs(p)}`;
      const qTerm = q >= 0 ? `+ ${q}` : `- ${Math.abs(q)}`;
      return {
        prompt: `Which of the following is equivalent to (x ${pTerm})(x ${qTerm})?`,
        correct, distractors,
        explanation: `FOIL: x² ${q >= 0 ? "+" : "-"} ${Math.abs(q)}x ${p >= 0 ? "+" : "-"} ${Math.abs(p)}x + ${p}(${q}) = x² + (${p} + ${q})x + ${p * q} = ${correct}.`,
        params: { p, q },
      };
    },
  });

  registerGrid({
    id: "adv-quadratic-roots", category: CATEGORIES.ADVANCED_MATH, subcategory: "Nonlinear equations", timeLimit: 100,
    build() {
      const p = randInt(-10, 10);
      const q = randInt(-10, 10);
      const B = -(p + q), C = p * q;
      const answer = Math.max(p, q);
      const pTerm = p >= 0 ? `- ${p}` : `+ ${Math.abs(p)}`;
      const qTerm = q >= 0 ? `- ${q}` : `+ ${Math.abs(q)}`;
      return {
        prompt: `If ${polyStr3(1, B, C)} = 0, what is the greatest value of x that satisfies the equation?`,
        answer,
        explanation: `Factor: (x ${pTerm})(x ${qTerm}) = 0, so x = ${p} or x = ${q}. The greatest value is ${answer}.`,
        params: { p, q },
        visual: { type: "parabola", r1: p, r2: q, opensUp: true },
      };
    },
  });

  registerMC({
    id: "adv-geometric-growth", category: CATEGORIES.ADVANCED_MATH, subcategory: "Nonlinear functions", timeLimit: 100,
    build() {
      const a = randInt(2, 9);
      const b = randInt(2, 4);
      const n = randInt(2, 6);
      const answer = a * Math.pow(b, n);
      const correct = String(answer);
      const distractors = [String(a * Math.pow(b, n - 1)), String(a * b * n), String(a + b * n)];
      return {
        prompt: `For the exponential function g, g(0) = ${a} and g(x) = g(x - 1) × ${b} for all integers x > 0. What is g(${n})?`,
        correct, distractors,
        explanation: `Each step multiplies by ${b}: g(${n}) = ${a} × ${b}^${n} = ${answer}.`,
        params: { a, b, n },
      };
    },
  });

  registerGrid({
    id: "adv-quadratic-eval", category: CATEGORIES.ADVANCED_MATH, subcategory: "Nonlinear functions", timeLimit: 90,
    build() {
      const a = randIntNonZero(-5, 5);
      const b = randInt(-9, 9);
      const c = randInt(-15, 15);
      const k = randInt(-6, 6);
      const answer = a * k * k + b * k + c;
      return {
        prompt: `If f(x) = ${polyStr3(a, b, c)}, what is f(${k})?`,
        answer,
        explanation: `Substitute x = ${k}: f(${k}) = ${a}(${k})² + ${b}(${k}) + ${c} = ${a * k * k} + ${b * k} + ${c} = ${answer}.`,
        params: { a, b, c, k },
      };
    },
  });

  registerMC({
    id: "adv-exponent-multiply", category: CATEGORIES.ADVANCED_MATH, subcategory: "Equivalent expressions", timeLimit: 70,
    build() {
      const a = randInt(2, 9);
      const b = randInt(2, 9);
      const correct = `x^${a + b}`;
      const distractors = [`x^${a * b}`, `x^${Math.abs(a - b)}`, `x^${a + b + 1}`];
      return {
        prompt: `Which expression is equivalent to x^${a} · x^${b} (for x ≠ 0)?`,
        correct, distractors,
        explanation: `When multiplying powers with the same base, add the exponents: x^${a} · x^${b} = x^(${a}+${b}) = x^${a + b}.`,
        params: { a, b },
      };
    },
  });

  registerMC({
    id: "adv-exponent-power", category: CATEGORIES.ADVANCED_MATH, subcategory: "Equivalent expressions", timeLimit: 70,
    build() {
      const a = randInt(2, 8);
      const b = randInt(2, 6);
      const correct = `x^${a * b}`;
      const distractors = [`x^${a + b}`, `x^${a}`, `x^${a * b + 1}`];
      return {
        prompt: `Which expression is equivalent to (x^${a})^${b} (for x ≠ 0)?`,
        correct, distractors,
        explanation: `When raising a power to a power, multiply the exponents: (x^${a})^${b} = x^(${a}×${b}) = x^${a * b}.`,
        params: { a, b },
      };
    },
  });

  registerMC({
    id: "adv-diff-squares", category: CATEGORIES.ADVANCED_MATH, subcategory: "Equivalent expressions", timeLimit: 95,
    build() {
      const a = randInt(2, 12);
      const a2 = a * a;
      const correct = `x + ${a}`;
      const distractors = [`x - ${a}`, `x² + ${a}`, `${a}`];
      return {
        prompt: `For x ≠ ${a}, which expression is equivalent to (x² - ${a2})/(x - ${a})?`,
        correct, distractors,
        explanation: `The numerator is a difference of squares: x² - ${a2} = (x - ${a})(x + ${a}). Dividing by (x - ${a}) leaves x + ${a}.`,
        params: { a },
      };
    },
  });

  registerGrid({
    id: "adv-sqrt-equation", category: CATEGORIES.ADVANCED_MATH, subcategory: "Nonlinear equations", timeLimit: 90,
    build() {
      const b = randInt(2, 10);
      const a = randInt(-15, 15);
      const x0 = b * b - a;
      const aTerm = a >= 0 ? `+ ${a}` : `- ${Math.abs(a)}`;
      return {
        prompt: `If √(x ${aTerm}) = ${b}, what is the value of x?`,
        answer: x0,
        explanation: `Square both sides: x ${aTerm} = ${b}² = ${b * b}. Solve for x: x = ${b * b} ${a >= 0 ? "- " + a : "+ " + Math.abs(a)} = ${x0}.`,
        params: { a, b },
      };
    },
  });

  registerGrid({
    id: "adv-direct-variation", category: CATEGORIES.ADVANCED_MATH, subcategory: "Nonlinear functions", timeLimit: 85,
    build() {
      const x1 = randInt(1, 10);
      const k = randInt(1, 9);
      const y1 = k * x1;
      const x2 = randInt(1, 15);
      const answer = k * x2;
      return {
        prompt: `y varies directly with x. If y = ${y1} when x = ${x1}, what is the value of y when x = ${x2}?`,
        answer,
        explanation: `Find the constant of variation: k = y/x = ${y1}/${x1} = ${k}. Then y = kx = ${k} × ${x2} = ${answer}.`,
        params: { x1, k, x2 },
      };
    },
  });

  registerMC({
    id: "adv-poly-subtract", category: CATEGORIES.ADVANCED_MATH, subcategory: "Equivalent expressions", timeLimit: 95,
    build() {
      const a = randInt(-9, 9), b = randInt(-9, 9), c = randInt(-9, 9);
      const d = randInt(-9, 9), e = randInt(-9, 9), f = randInt(-9, 9);
      const correct = polyStr3(a - d, b - e, c - f);
      const distractors = [
        polyStr3(a + d, b + e, c + f),
        polyStr3(a - d, b + e, c - f),
        polyStr3(a - d, b - e, c + f),
      ];
      return {
        prompt: `What is (${polyStr3(a, b, c)}) - (${polyStr3(d, e, f)}) written in standard form?`,
        correct, distractors,
        explanation: `Distribute the negative sign to every term of the second polynomial, then combine like terms: (${a} - (${d}))x² + (${b} - (${e}))x + (${c} - (${f})) = ${correct}.`,
        params: { a, b, c, d, e, f },
      };
    },
  });

  // ================= PROBLEM SOLVING & DATA ANALYSIS =================

  registerMC({
    id: "data-percent-combo", category: CATEGORIES.DATA_ANALYSIS, subcategory: "Percentages", timeLimit: 100,
    build() {
      const m = randInt(10, 60);
      const d = randInt(5, 50);
      const finalPct = (1 + m / 100) * (1 - d / 100) * 100;
      const correct = fmtPercent1(finalPct);
      const distractors = [
        fmtPercent1(100 - (m - d)),
        fmtPercent1(100 + (m - d)),
        fmtPercent1((1 - m / 100) * (1 + d / 100) * 100),
      ];
      return {
        prompt: `A store marks up the price of an item by ${m}% and then offers a ${d}% discount on the marked-up price. The final price is what percent of the original price? (Round to the nearest tenth of a percent.)`,
        correct, distractors,
        explanation: `Multiply by 1 + ${m}/100 for the markup, then by 1 - ${d}/100 for the discount: 100% × ${(1 + m / 100).toFixed(2)} × ${(1 - d / 100).toFixed(2)} = ${correct}.`,
        params: { m, d },
      };
    },
  });

  registerGrid({
    id: "data-mean-missing", category: CATEGORIES.DATA_ANALYSIS, subcategory: "One-variable data", timeLimit: 95,
    build() {
      const n = randInt(4, 6);
      const avg = randInt(8, 30);
      const total = avg * n;
      let list, remaining;
      do {
        list = Array.from({ length: n - 1 }, () => randInt(1, 40));
        remaining = total - list.reduce((s, v) => s + v, 0);
      } while (remaining < 0 || remaining > 60);
      return {
        prompt: `The average (arithmetic mean) of the ${n} numbers shown in the table is ${avg}. What is the value of the missing number?`,
        answer: remaining,
        explanation: `The sum of all ${n} numbers is ${avg} × ${n} = ${total}. Subtract the known numbers: ${total} - ${list.join(" - ")} = ${remaining}.`,
        params: { n, avg, list },
        visual: { type: "table", headers: list.map((_, i) => `Number ${i + 1}`).concat(`Number ${n}`), rows: [[...list, "?"]] },
      };
    },
  });

  registerGrid({
    id: "data-unit-rate", category: CATEGORIES.DATA_ANALYSIS, subcategory: "Ratios & rates", timeLimit: 90,
    build() {
      const mpg = randInt(15, 40);
      const g1 = randInt(4, 15);
      const d1 = mpg * g1;
      const g2 = g1 + randInt(2, 25);
      const d2 = mpg * g2;
      return {
        prompt: `The table shows the distance a car travels on a given amount of gas, assuming a constant rate. How many gallons of gas would the car need to travel ${d2} miles?`,
        answer: g2,
        explanation: `Find the rate: ${d1} miles ÷ ${g1} gallons = ${mpg} miles per gallon. Then ${d2} ÷ ${mpg} = ${g2} gallons.`,
        params: { mpg, g1, g2 },
        visual: {
          type: "table",
          headers: ["Distance (miles)", "Gas used (gallons)"],
          rows: [[d1, g1], [d2, "?"]],
        },
      };
    },
  });

  registerGrid({
    id: "data-percent-of", category: CATEGORIES.DATA_ANALYSIS, subcategory: "Percentages", timeLimit: 75,
    build() {
      const p = choice([5, 10, 15, 20, 25, 40, 50, 60, 75, 80]);
      const g = gcd(p, 100);
      const base = 100 / g;
      const k = randInt(1, 15);
      const n = base * k;
      const answer = (p / g) * k;
      return {
        prompt: `What is ${p}% of ${n}?`,
        answer,
        explanation: `${p}% of ${n} = (${p}/100) × ${n} = ${answer}.`,
        params: { p, n },
      };
    },
  });

  registerMC({
    id: "data-probability", category: CATEGORIES.DATA_ANALYSIS, subcategory: "Probability", timeLimit: 85,
    build() {
      const r = randInt(1, 12), b = randInt(1, 12), g = randInt(1, 12);
      const total = r + b + g;
      const colorPick = choice(["red", "blue", "green"]);
      const count = colorPick === "red" ? r : colorPick === "blue" ? b : g;
      const correct = fracStr(count, total);
      const distractors = [fracStr(count, total - count), fracStr(total - count, total), fracStr(count + 1, total)];
      return {
        prompt: `A bag contains ${r} red marbles, ${b} blue marbles, and ${g} green marbles. If one marble is drawn at random, what is the probability that it is ${colorPick}?`,
        correct, distractors,
        explanation: `Probability = favorable outcomes / total outcomes = ${count}/${total}${`${count}/${total}` !== correct ? ` = ${correct}` : ""}.`,
        params: { r, b, g, colorPick },
      };
    },
  });

  registerGrid({
    id: "data-weighted-avg", category: CATEGORIES.DATA_ANALYSIS, subcategory: "One-variable data", timeLimit: 100,
    build() {
      const n1 = randInt(5, 30), n2 = randInt(5, 30);
      const a1 = randInt(60, 100), a2 = randInt(60, 100);
      const total = n1 * a1 + n2 * a2;
      const answer = fmtDecimal(total / (n1 + n2), 1);
      return {
        prompt: `The table shows the number of students and average test score for two classes. What is the average score of all the students combined? (Round to the nearest tenth.)`,
        answer,
        explanation: `Total points = ${n1} × ${a1} + ${n2} × ${a2} = ${n1 * a1} + ${n2 * a2} = ${total}. Combined average = ${total} / (${n1} + ${n2}) = ${answer}.`,
        params: { n1, n2, a1, a2 },
        visual: {
          type: "table",
          headers: ["Class", "Number of Students", "Average Score"],
          rows: [["A", n1, a1], ["B", n2, a2]],
        },
      };
    },
  });

  registerGrid({
    id: "data-ratio-part", category: CATEGORIES.DATA_ANALYSIS, subcategory: "Ratios & rates", timeLimit: 90,
    build() {
      const rm = randInt(1, 9), rw = randInt(1, 9);
      const k = randInt(2, 15);
      const total = (rm + rw) * k;
      const answer = rw * k;
      return {
        prompt: `In a group of ${total} people, the ratio of men to women is ${rm}:${rw}. How many women are in the group?`,
        answer,
        explanation: `The ratio has ${rm + rw} total parts. Each part = ${total} / ${rm + rw} = ${k} people. Women make up ${rw} parts: ${rw} × ${k} = ${answer}.`,
        params: { rm, rw, k },
      };
    },
  });

  registerGrid({
    id: "data-median", category: CATEGORIES.DATA_ANALYSIS, subcategory: "One-variable data", timeLimit: 80,
    build() {
      const n = choice([5, 7, 9]);
      const sorted = Array.from({ length: n }, () => randInt(1, 99)).sort((a, b) => a - b);
      const display = shuffle(sorted);
      const answer = sorted[(n - 1) / 2];
      return {
        prompt: `The table shows a data set of ${n} values. What is the median of the data set?`,
        answer,
        explanation: `Sort the values from least to greatest: ${sorted.join(", ")}. With ${n} values in order, the median is the middle value: ${answer}.`,
        params: { sorted },
        visual: { type: "table", headers: display.map((_, i) => `#${i + 1}`), rows: [display] },
      };
    },
  });

  registerGrid({
    id: "data-range", category: CATEGORIES.DATA_ANALYSIS, subcategory: "One-variable data", timeLimit: 70,
    build() {
      const n = randInt(5, 9);
      const list = Array.from({ length: n }, () => randInt(1, 99));
      const answer = Math.max(...list) - Math.min(...list);
      return {
        prompt: `The table shows a data set of ${n} values. What is the range of the data set?`,
        answer,
        explanation: `Range = maximum - minimum = ${Math.max(...list)} - ${Math.min(...list)} = ${answer}.`,
        params: { list },
        visual: { type: "table", headers: list.map((_, i) => `#${i + 1}`), rows: [list] },
      };
    },
  });

  registerGrid({
    id: "data-worker-days", category: CATEGORIES.DATA_ANALYSIS, subcategory: "Ratios & rates", timeLimit: 95,
    build() {
      const w = randInt(2, 10);
      const k = randInt(2, 5);
      const d = k * randInt(2, 10);
      const w2 = w * k;
      const answer = d / k;
      return {
        prompt: `It takes ${w} workers ${d} days to complete a job, all working at the same constant rate. How many days would it take ${w2} workers to complete the same job?`,
        answer,
        explanation: `Total work = ${w} × ${d} = ${w * d} worker-days. With ${w2} workers: ${w * d} / ${w2} = ${answer} days.`,
        params: { w, k, d },
      };
    },
  });

  const BAR_CHART_THEMES = [
    { unit: "books read last month", noun: "people", labels: ["Ana", "Ben", "Cara", "Dev", "Ella"] },
    { unit: "hours studied this week", noun: "days", labels: ["Mon", "Tue", "Wed", "Thu", "Fri"] },
    { unit: "cars sold", noun: "months", labels: ["Jan", "Feb", "Mar", "Apr", "May"] },
    { unit: "cups of coffee sold", noun: "stores", labels: ["Store A", "Store B", "Store C", "Store D", "Store E"] },
  ];

  registerGrid({
    id: "data-bar-chart", category: CATEGORIES.DATA_ANALYSIS, subcategory: "One-variable data", timeLimit: 90,
    build() {
      const theme = choice(BAR_CHART_THEMES);
      const values = theme.labels.map(() => randInt(3, 24));
      const total = values.reduce((s, v) => s + v, 0);
      return {
        prompt: `The bar graph shows the number of ${theme.unit} for each of ${theme.labels.length} ${theme.noun}. What is the total across all of them?`,
        answer: total,
        explanation: `Add the value of every bar: ${values.join(" + ")} = ${total}.`,
        params: { theme: theme.unit, values },
        visual: { type: "bar-chart", labels: theme.labels, values, yLabel: theme.unit },
      };
    },
  });

  registerGrid({
    id: "data-two-way-table", category: CATEGORIES.DATA_ANALYSIS, subcategory: "Two-variable data", timeLimit: 95,
    build() {
      const rowLabels = choice([["Freshmen", "Sophomores"], ["Morning shift", "Evening shift"], ["Team A", "Team B"]]);
      const colLabels = choice([["Prefers Math", "Prefers Science"], ["Voted Yes", "Voted No"], ["Passed", "Did Not Pass"]]);
      const a = randInt(8, 40), b = randInt(8, 40), c = randInt(8, 40), d = randInt(8, 40);
      const rowTotal1 = a + b, rowTotal2 = c + d;
      const colTotal1 = a + c, colTotal2 = b + d;
      const grandTotal = a + b + c + d;
      return {
        prompt: `The table shows the results of a survey of ${grandTotal} people. What is the missing value in the table?`,
        answer: d,
        explanation: `Each row must add up to its total. The second row's total is ${rowTotal2}, and the known value in that row is ${c}, so the missing value is ${rowTotal2} - ${c} = ${d}. (You can check this with the column total too: ${colTotal2} - ${b} = ${d}.)`,
        params: { rowLabels, colLabels, a, b, c },
        visual: {
          type: "table",
          headers: ["", colLabels[0], colLabels[1], "Total"],
          rows: [
            [rowLabels[0], a, b, rowTotal1],
            [rowLabels[1], c, "?", rowTotal2],
            ["Total", colTotal1, colTotal2, grandTotal],
          ],
        },
      };
    },
  });

  registerGrid({
    id: "data-scatterplot", category: CATEGORIES.DATA_ANALYSIS, subcategory: "Two-variable data", timeLimit: 100,
    build() {
      const m = randInt(-6, 6) || 2;
      const b = randInt(-10, 30);
      const xs = [1, 2, 3, 4, 5, 6];
      const plotPoints = xs.map((x) => ({ x, y: m * x + b + choice([-2, -1, 0, 0, 1, 2]) }));
      const x0 = choice([8, 9, 10, 12]);
      const answer = m * x0 + b;
      return {
        prompt: `The scatterplot shows six data points and the line of best fit. Based on the line of best fit, what is the predicted value of y when x = ${x0}?`,
        answer,
        explanation: `The line of best fit is y = ${m}x ${b >= 0 ? "+ " + b : "- " + Math.abs(b)}. Substitute x = ${x0}: y = ${m}(${x0}) ${b >= 0 ? "+ " + b : "- " + Math.abs(b)} = ${m * x0} ${b >= 0 ? "+ " + b : "- " + Math.abs(b)} = ${answer}.`,
        params: { m, b, x0 },
        visual: { type: "coordinate-plane", plotPoints, line: { m, b } },
      };
    },
  });

  // ================= GEOMETRY & TRIGONOMETRY =================

  registerGrid({
    id: "geo-circumference", category: CATEGORIES.GEOMETRY, subcategory: "Circles", timeLimit: 75,
    build() {
      const r = randInt(2, 20);
      const c = 2 * r;
      return {
        prompt: `A circle has a circumference of ${c}π. What is the radius of the circle?`,
        answer: r,
        explanation: `C = 2πr, so r = C / (2π) = ${c}π / (2π) = ${r}.`,
        params: { r },
        visual: { type: "circle", radiusLabel: "r = ?" },
      };
    },
  });

  registerGrid({
    id: "geo-hypotenuse", category: CATEGORIES.GEOMETRY, subcategory: "Right triangles & trigonometry", timeLimit: 85,
    build() {
      const [a, b, c] = pythagTriple();
      return {
        prompt: `A right triangle has legs of length ${a} and ${b}. What is the length of the hypotenuse?`,
        answer: c,
        explanation: `By the Pythagorean theorem, a² + b² = c²: ${a}² + ${b}² = ${a * a} + ${b * b} = ${a * a + b * b}. So c = √${a * a + b * b} = ${c}.`,
        params: { a, b, c },
        visual: { type: "right-triangle", bottomLabel: a, leftLabel: b, hypLabel: "?", scaleNote: true },
      };
    },
  });

  registerGrid({
    id: "geo-leg", category: CATEGORIES.GEOMETRY, subcategory: "Right triangles & trigonometry", timeLimit: 90,
    build() {
      const [leg1, leg2, hyp] = pythagTriple();
      return {
        prompt: `A right triangle has a hypotenuse of length ${hyp} and one leg of length ${leg1}. What is the length of the other leg?`,
        answer: leg2,
        explanation: `By the Pythagorean theorem, leg² = hyp² - leg1² = ${hyp}² - ${leg1}² = ${hyp * hyp} - ${leg1 * leg1} = ${hyp * hyp - leg1 * leg1}. So the other leg = √${hyp * hyp - leg1 * leg1} = ${leg2}.`,
        params: { leg1, leg2, hyp },
        visual: { type: "right-triangle", bottomLabel: leg1, leftLabel: "?", hypLabel: hyp, scaleNote: true },
      };
    },
  });

  registerGrid({
    id: "geo-triangle-angle", category: CATEGORIES.GEOMETRY, subcategory: "Lines & angles", timeLimit: 70,
    build() {
      let a, b;
      do {
        a = randInt(20, 120);
        b = randInt(20, 120);
      } while (a + b >= 175);
      const answer = 180 - a - b;
      return {
        prompt: `In a triangle, two of the angles measure ${a} degrees and ${b} degrees. What is the measure, in degrees, of the third angle?`,
        answer,
        explanation: `The angles of a triangle sum to 180 degrees: 180 - ${a} - ${b} = ${answer}.`,
        params: { a, b },
        visual: { type: "triangle-angles", angleA: `${a}°`, angleB: `${b}°`, angleC: "?" },
      };
    },
  });

  registerGrid({
    id: "geo-right-triangle-angle", category: CATEGORIES.GEOMETRY, subcategory: "Right triangles & trigonometry", timeLimit: 65,
    build() {
      const a = randInt(10, 80);
      const answer = 90 - a;
      return {
        prompt: `In a right triangle, one of the acute angles measures ${a} degrees. What is the measure, in degrees, of the other acute angle?`,
        answer,
        explanation: `The two acute angles of a right triangle sum to 90 degrees: 90 - ${a} = ${answer}.`,
        params: { a },
        visual: { type: "right-triangle", vertexAngleLabels: { C: `${a}°`, B: "?°" } },
      };
    },
  });

  registerMC({
    id: "geo-box-height", category: CATEGORIES.GEOMETRY, subcategory: "Area & volume", timeLimit: 90,
    build() {
      const l = randInt(2, 15), w = randInt(2, 15), h = randInt(2, 15);
      const volume = l * w * h;
      const correct = String(h);
      const distractors = [String(Math.round(volume / l)), String(Math.round(volume / w)), String(l * w)]
        .filter((v) => v !== correct);
      while (distractors.length < 3) distractors.push(String(h + distractors.length + 1));
      return {
        prompt: `The volume of a rectangular box is ${volume} cubic inches. If the length is ${l} inches and the width is ${w} inches, what is the height, in inches?`,
        correct, distractors: distractors.slice(0, 3),
        explanation: `Volume = length × width × height, so height = Volume / (length × width) = ${volume} / (${l} × ${w}) = ${volume} / ${l * w} = ${h}.`,
        params: { l, w, h },
        visual: { type: "box", lengthLabel: `l = ${l}`, widthLabel: `w = ${w}`, heightLabel: "h = ?" },
      };
    },
  });

  registerGrid({
    id: "geo-square-perimeter", category: CATEGORIES.GEOMETRY, subcategory: "Area & volume", timeLimit: 75,
    build() {
      const side = randInt(2, 25);
      const area = side * side;
      const answer = 4 * side;
      return {
        prompt: `A square has an area of ${area} square units. What is the perimeter of the square?`,
        answer,
        explanation: `Side length = √${area} = ${side}. Perimeter = 4 × ${side} = ${answer}.`,
        params: { side },
        visual: { type: "square", areaLabel: `Area = ${area}` },
      };
    },
  });

  registerMC({
    id: "geo-circle-area", category: CATEGORIES.GEOMETRY, subcategory: "Circles", timeLimit: 80,
    build() {
      const r = randInt(2, 20);
      const area = r * r;
      const correct = `${area}π`;
      const distractors = [`${2 * r}π`, `${area * 2}π`, `${area}`];
      return {
        prompt: `A circle has a radius of ${r}. What is the area of the circle, in terms of π?`,
        correct, distractors,
        explanation: `Area = πr² = π(${r})² = ${area}π.`,
        params: { r },
        visual: { type: "circle", radiusLabel: `r = ${r}` },
      };
    },
  });

  registerMC({
    id: "geo-trig-ratio", category: CATEGORIES.GEOMETRY, subcategory: "Right triangles & trigonometry", timeLimit: 100,
    build() {
      const [legA, legB, hyp] = pythagTriple();
      const ratioName = choice(["sine", "cosine", "tangent"]);
      let correct;
      if (ratioName === "sine") correct = fracStr(legA, hyp);
      else if (ratioName === "cosine") correct = fracStr(legB, hyp);
      else correct = fracStr(legA, legB);
      const distractors = [fracStr(legB, hyp), fracStr(legA, hyp), fracStr(legB, legA), fracStr(hyp, legA)]
        .filter((d) => d !== correct);
      return {
        prompt: `In a right triangle, the side opposite angle θ has length ${legA}, the side adjacent to angle θ has length ${legB}, and the hypotenuse has length ${hyp}. What is the ${ratioName} of angle θ?`,
        correct, distractors: distractors.slice(0, 3),
        explanation: `Using SOH-CAH-TOA: sine = opposite/hypotenuse, cosine = adjacent/hypotenuse, tangent = opposite/adjacent. The ${ratioName} of θ = ${correct}.`,
        params: { legA, legB, hyp, ratioName },
        visual: { type: "right-triangle", bottomLabel: legB, leftLabel: legA, hypLabel: hyp, thetaVertex: "B", scaleNote: true },
      };
    },
  });

  registerGrid({
    id: "geo-coordinate-distance", category: CATEGORIES.GEOMETRY, subcategory: "Lines & angles", timeLimit: 90,
    build() {
      const [legA, legB, dist] = pythagTriple();
      const [dx, dy] = choice([[legA, legB], [legB, legA]]);
      const x1 = randInt(-10, 10), y1 = randInt(-10, 10);
      const x2 = x1 + choice([1, -1]) * dx;
      const y2 = y1 + choice([1, -1]) * dy;
      return {
        prompt: `What is the distance between the points (${x1}, ${y1}) and (${x2}, ${y2})?`,
        answer: dist,
        explanation: `Distance = √[(x2-x1)² + (y2-y1)²] = √[(${x2 - x1})² + (${y2 - y1})²] = √[${(x2 - x1) ** 2} + ${(y2 - y1) ** 2}] = √${(x2 - x1) ** 2 + (y2 - y1) ** 2} = ${dist}.`,
        params: { x1, y1, dx, dy },
        visual: {
          type: "coordinate-plane",
          plotPoints: [
            { x: x1, y: y1, label: `(${x1}, ${y1})` },
            { x: x2, y: y2, label: `(${x2}, ${y2})` },
          ],
          segment: { x1, y1, x2, y2 },
        },
      };
    },
  });

  // ---------- Public API ----------
  function pickCategoryWeighted() {
    const r = Math.random();
    let acc = 0;
    for (const cat of CATEGORY_LIST) {
      acc += CATEGORY_WEIGHTS[cat];
      if (r <= acc) return cat;
    }
    return CATEGORY_LIST[CATEGORY_LIST.length - 1];
  }

  function generateQuestion(categoryFilter) {
    const cat = !categoryFilter || categoryFilter === "MIX" ? pickCategoryWeighted() : categoryFilter;
    const pool = TEMPLATES.filter((t) => t.category === cat);
    const template = choice(pool);
    return template.generate();
  }

  const SAT_MATH_BANK = {
    CATEGORIES,
    CATEGORY_LIST,
    CATEGORY_WEIGHTS,
    TEMPLATES,
    generateQuestion,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = SAT_MATH_BANK;
  root.SAT_MATH_BANK = SAT_MATH_BANK;
})(typeof window !== "undefined" ? window : globalThis);
