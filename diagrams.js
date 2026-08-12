// Renders the declarative `visual` spec a generator.js template attaches to a
// question into actual markup (inline SVG for figures/graphs, an HTML <table>
// for tabular data). Kept separate from generator.js so the question logic
// stays DOM-free and Node-testable; this file only runs in the browser.
//
// Shapes are drawn with fixed, visually-pleasant proportions rather than
// scaled exactly to the random numbers (standard SAT convention — figures
// are captioned "Note: Figure not drawn to scale." when this matters).

(function (root) {
  "use strict";

  const STROKE = "var(--text)";
  const ACCENT = "var(--accent)";
  const DIM = "var(--text-dim)";

  function svgWrap(inner, viewBox) {
    return `<svg viewBox="${viewBox}" class="diagram-svg" preserveAspectRatio="xMidYMid meet">${inner}</svg>`;
  }

  // ---------- Geometry shapes ----------

  function renderRightTriangle({ bottomLabel, leftLabel, hypLabel, thetaVertex, scaleNote, vertexAngleLabels }) {
    const A = [40, 180], B = [260, 180], C = [40, 40];
    const rightAngleMark = `<rect x="40" y="164" width="16" height="16" fill="none" stroke="${STROKE}" stroke-width="1.5"/>`;
    let thetaMark = "";
    if (thetaVertex === "B") {
      thetaMark = `<path d="M 230 180 A 32 32 0 0 0 212 154" fill="none" stroke="${ACCENT}" stroke-width="1.5"/><text x="220" y="168" font-size="14" fill="${ACCENT}">&#952;</text>`;
    } else if (thetaVertex === "C") {
      thetaMark = `<path d="M 40 72 A 32 32 0 0 1 65 58" fill="none" stroke="${ACCENT}" stroke-width="1.5"/><text x="56" y="78" font-size="14" fill="${ACCENT}">&#952;</text>`;
    }
    const va = vertexAngleLabels || {};
    const vertexLabels = `
      ${va.B ? `<text x="220" y="172" font-size="14" fill="${ACCENT}" text-anchor="middle">${va.B}</text>` : ""}
      ${va.C ? `<text x="66" y="66" font-size="14" fill="${ACCENT}" text-anchor="middle">${va.C}</text>` : ""}
    `;
    const inner = `
      <polygon points="${A.join(",")} ${B.join(",")} ${C.join(",")}" fill="none" stroke="${STROKE}" stroke-width="2"/>
      ${rightAngleMark}
      ${thetaMark}
      ${vertexLabels}
      ${bottomLabel ? `<text x="150" y="205" font-size="16" fill="${STROKE}" text-anchor="middle">${bottomLabel}</text>` : ""}
      ${leftLabel ? `<text x="14" y="115" font-size="16" fill="${STROKE}" text-anchor="middle">${leftLabel}</text>` : ""}
      ${hypLabel ? `<text x="172" y="98" font-size="16" fill="${STROKE}" text-anchor="middle">${hypLabel}</text>` : ""}
      ${scaleNote ? `<text x="150" y="215" font-size="10" fill="${DIM}" text-anchor="middle">Note: Figure not drawn to scale.</text>` : ""}
    `;
    return svgWrap(inner, "0 0 300 225");
  }

  function renderTriangleAngles({ angleA, angleB, angleC }) {
    const A = [30, 190], B = [270, 190], C = [150, 30];
    const inner = `
      <polygon points="${A.join(",")} ${B.join(",")} ${C.join(",")}" fill="none" stroke="${STROKE}" stroke-width="2"/>
      <text x="58" y="178" font-size="15" fill="${ACCENT}" text-anchor="middle">${angleA}</text>
      <text x="242" y="178" font-size="15" fill="${ACCENT}" text-anchor="middle">${angleB}</text>
      <text x="150" y="56" font-size="15" fill="${ACCENT}" text-anchor="middle">${angleC}</text>
      <text x="150" y="210" font-size="10" fill="${DIM}" text-anchor="middle">Note: Figure not drawn to scale.</text>
    `;
    return svgWrap(inner, "0 0 300 220");
  }

  function renderCircle({ radiusLabel }) {
    const cx = 150, cy = 110, r = 70;
    const inner = `
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${STROKE}" stroke-width="2"/>
      <line x1="${cx}" y1="${cy}" x2="${cx + r}" y2="${cy}" stroke="${ACCENT}" stroke-width="2"/>
      <circle cx="${cx}" cy="${cy}" r="2.5" fill="${STROKE}"/>
      <text x="${cx + r / 2}" y="${cy - 10}" font-size="15" fill="${ACCENT}" text-anchor="middle">${radiusLabel}</text>
    `;
    return svgWrap(inner, "0 0 300 220");
  }

  function renderSquare({ areaLabel }) {
    const x = 90, y = 40, s = 140;
    const inner = `
      <rect x="${x}" y="${y}" width="${s}" height="${s}" fill="none" stroke="${STROKE}" stroke-width="2"/>
      ${areaLabel ? `<text x="${x + s / 2}" y="${y + s / 2 + 5}" font-size="15" fill="${ACCENT}" text-anchor="middle">${areaLabel}</text>` : ""}
    `;
    return svgWrap(inner, "0 0 320 220");
  }

  function renderBox({ lengthLabel, widthLabel, heightLabel }) {
    // Simple isometric-style rectangular prism.
    const front = { x: 60, y: 80, w: 140, h: 100 };
    const dx = 45, dy = -30;
    const topBack = [front.x + dx, front.y + dy];
    const inner = `
      <rect x="${front.x}" y="${front.y}" width="${front.w}" height="${front.h}" fill="none" stroke="${STROKE}" stroke-width="2"/>
      <polygon points="${front.x},${front.y} ${topBack[0]},${topBack[1]} ${topBack[0] + front.w},${topBack[1]} ${front.x + front.w},${front.y}" fill="none" stroke="${STROKE}" stroke-width="2"/>
      <polygon points="${front.x + front.w},${front.y} ${topBack[0] + front.w},${topBack[1]} ${topBack[0] + front.w},${topBack[1] + front.h} ${front.x + front.w},${front.y + front.h}" fill="none" stroke="${STROKE}" stroke-width="2"/>
      <text x="${front.x + front.w / 2}" y="${front.y + front.h + 22}" font-size="14" fill="${ACCENT}" text-anchor="middle">${lengthLabel}</text>
      <text x="${front.x - 14}" y="${front.y + front.h / 2}" font-size="14" fill="${ACCENT}" text-anchor="middle">${heightLabel}</text>
      <text x="${topBack[0] + front.w + 20}" y="${topBack[1] + front.h / 2 + 15}" font-size="14" fill="${ACCENT}" text-anchor="middle">${widthLabel}</text>
    `;
    return svgWrap(inner, "0 0 300 220");
  }

  // ---------- Coordinate plane / graphs ----------

  function coordMapper(points, opts) {
    const pad = 26, W = 300, H = 260;
    const xs = points.map((p) => p.x).concat(opts.extraX || [0]);
    const ys = points.map((p) => p.y).concat(opts.extraY || [0]);
    const minX = Math.min(...xs) - 2, maxX = Math.max(...xs) + 2;
    const minY = Math.min(...ys) - 2, maxY = Math.max(...ys) + 2;
    const sx = (x) => pad + ((x - minX) / (maxX - minX)) * (W - 2 * pad);
    const sy = (y) => H - pad - ((y - minY) / (maxY - minY)) * (H - 2 * pad);
    return { sx, sy, minX, maxX, minY, maxY, W, H, pad };
  }

  function renderCoordinatePlane({ plotPoints = [], line = null, segment = null, curve = null }) {
    const extraX = [], extraY = [];
    if (line) { extraX.push(-10, 10); extraY.push(line.m * -10 + line.b, line.m * 10 + line.b); }
    let curveSamples = null;
    if (curve) {
      const steps = 40;
      curveSamples = [];
      for (let i = 0; i <= steps; i++) {
        const x = curve.x1 + ((curve.x2 - curve.x1) * i) / steps;
        curveSamples.push({ x, y: curve.fn(x) });
      }
      extraX.push(curve.x1, curve.x2);
      curveSamples.forEach((p) => extraY.push(p.y));
    }
    const m = coordMapper(plotPoints, { extraX, extraY });

    let axes = `
      <line x1="${m.sx(m.minX)}" y1="${m.sy(0)}" x2="${m.sx(m.maxX)}" y2="${m.sy(0)}" stroke="${DIM}" stroke-width="1"/>
      <line x1="${m.sx(0)}" y1="${m.sy(m.minY)}" x2="${m.sx(0)}" y2="${m.sy(m.maxY)}" stroke="${DIM}" stroke-width="1"/>
    `;

    let lineEl = "";
    if (line) {
      const y1 = line.m * m.minX + line.b, y2 = line.m * m.maxX + line.b;
      lineEl = `<line x1="${m.sx(m.minX)}" y1="${m.sy(y1)}" x2="${m.sx(m.maxX)}" y2="${m.sy(y2)}" stroke="${ACCENT}" stroke-width="2"/>`;
    }

    let segEl = "";
    if (segment) {
      segEl = `<line x1="${m.sx(segment.x1)}" y1="${m.sy(segment.y1)}" x2="${m.sx(segment.x2)}" y2="${m.sy(segment.y2)}" stroke="${ACCENT}" stroke-width="2" stroke-dasharray="5,4"/>`;
    }

    let curveEl = "";
    if (curveSamples) {
      const pts = curveSamples.map((p) => `${m.sx(p.x)},${m.sy(p.y)}`);
      curveEl = `<polyline points="${pts.join(" ")}" fill="none" stroke="${ACCENT}" stroke-width="2"/>`;
    }

    const points = plotPoints
      .map(
        (p) => `
      <circle cx="${m.sx(p.x)}" cy="${m.sy(p.y)}" r="4" fill="${STROKE}"/>
      ${p.label ? `<text x="${m.sx(p.x) + 8}" y="${m.sy(p.y) - 8}" font-size="12" fill="${STROKE}">${p.label}</text>` : ""}
    `
      )
      .join("");

    const inner = `${axes}${lineEl}${segEl}${curveEl}${points}`;
    return svgWrap(inner, `0 0 ${m.W} ${m.H}`);
  }

  function renderParabola({ r1, r2, opensUp }) {
    const sign = opensUp ? 1 : -1;
    const fn = (x) => sign * (x - r1) * (x - r2);
    const lo = Math.min(r1, r2) - 2, hi = Math.max(r1, r2) + 2;
    return renderCoordinatePlane({
      plotPoints: [
        { x: r1, y: 0, label: undefined },
        { x: r2, y: 0, label: undefined },
      ],
      curve: { x1: lo, x2: hi, fn },
    });
  }

  // ---------- Bar chart ----------

  function renderBarChart({ labels, values, yLabel }) {
    const W = 320, H = 240, pad = 40, gap = 18;
    const max = Math.max(...values) * 1.2;
    const barW = (W - pad * 1.5 - gap * (values.length - 1)) / values.length;
    const bars = values
      .map((v, i) => {
        const h = (v / max) * (H - pad - 30);
        const x = pad + i * (barW + gap);
        const y = H - pad - h;
        return `
        <rect x="${x}" y="${y}" width="${barW}" height="${h}" fill="${ACCENT}" opacity="0.85"/>
        <text x="${x + barW / 2}" y="${y - 6}" font-size="12" fill="${STROKE}" text-anchor="middle">${v}</text>
        <text x="${x + barW / 2}" y="${H - pad + 16}" font-size="11" fill="${DIM}" text-anchor="middle">${labels[i]}</text>
      `;
      })
      .join("");
    const axis = `<line x1="${pad}" y1="${H - pad}" x2="${W - 10}" y2="${H - pad}" stroke="${DIM}" stroke-width="1"/>`;
    const axisLabel = yLabel ? `<text x="12" y="${pad}" font-size="11" fill="${DIM}">${yLabel}</text>` : "";
    return svgWrap(`${axis}${bars}${axisLabel}`, `0 0 ${W} ${H}`);
  }

  // ---------- Table ----------

  function renderTable({ headers, rows }) {
    const head = `<tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr>`;
    const body = rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("");
    return `<table class="diagram-table"><thead>${head}</thead><tbody>${body}</tbody></table>`;
  }

  // ---------- Dispatcher ----------

  function renderVisual(visual) {
    if (!visual) return "";
    switch (visual.type) {
      case "right-triangle": return `<div class="diagram">${renderRightTriangle(visual)}</div>`;
      case "triangle-angles": return `<div class="diagram">${renderTriangleAngles(visual)}</div>`;
      case "circle": return `<div class="diagram">${renderCircle(visual)}</div>`;
      case "square": return `<div class="diagram">${renderSquare(visual)}</div>`;
      case "box": return `<div class="diagram">${renderBox(visual)}</div>`;
      case "coordinate-plane": return `<div class="diagram">${renderCoordinatePlane(visual)}</div>`;
      case "parabola": return `<div class="diagram">${renderParabola(visual)}</div>`;
      case "bar-chart": return `<div class="diagram">${renderBarChart(visual)}</div>`;
      case "table": return `<div class="diagram-table-wrap">${renderTable(visual)}</div>`;
      default: return "";
    }
  }

  const DIAGRAMS = { renderVisual };
  if (typeof module !== "undefined" && module.exports) module.exports = DIAGRAMS;
  root.DIAGRAMS = DIAGRAMS;
})(typeof window !== "undefined" ? window : globalThis);
