// The River of Names — hand-rolled streamgraph for the homepage hero.
//
// Renders a cohort-normalized stack of every name that ever cracked top-30
// in some (year, sex), using:
//   - stackOrderInsideOut (largest sums in the middle)
//   - weighted-wiggle baseline (Byron & Wattenberg 2008)
//   - cardinal-spline area curves (gentler than curveBasis for sparse series)
//   - decade-of-peak color buckets keyed off the existing status palette
//   - greedy collision-avoiding labels at each stream's widest year
//   - bloom-from-centerline reveal animation (respects prefers-reduced-motion)
//
// No external dependencies. ES module loaded directly by the browser.

const SVG_NS = "http://www.w3.org/2000/svg";

const DECADE_COLORS = [
  { until: 1909, css: "var(--charcoal)" },
  { until: 1929, css: "var(--violet)" },
  { until: 1949, css: "var(--amber)" },
  { until: 1969, css: "var(--red)" },
  { until: 1999, css: "var(--blue)" },
  { until: 9999, css: "var(--emerald)" },
];

function decadeColor(peakYear) {
  for (const b of DECADE_COLORS) if (peakYear <= b.until) return b.css;
  return "var(--ink)";
}

// Compute the wiggle-minimizing stack, returning one entry per stream in
// render order (index 0 is the bottom-most layer). Each entry carries the
// pre-projected (year, y0, y1) points in *data space* — share-of-cohort units,
// vertically centered around y=0.
function buildStacks(names, totalsByYear, ym, yM) {
  const years = [];
  for (let y = ym; y <= yM; y++) years.push(y);
  const m = years.length;

  // Raw value matrix: share-of-cohort per (stream, year).
  const values = names.map(({ sex, series }) =>
    years.map((y) => {
      const tot = totalsByYear[y] && totalsByYear[y][sex];
      if (!tot) return 0;
      return (series[y] || 0) / tot;
    }),
  );

  // Inside-out order: sort by sum desc, alternate placement so largest sits
  // in the middle and edges taper to thin streams.
  const sums = values.map((v) => v.reduce((a, b) => a + b, 0));
  const sortedBySum = names
    .map((_, i) => i)
    .sort((a, b) => sums[b] - sums[a]);
  const tops = [];
  const bottoms = [];
  let topSum = 0;
  let bottomSum = 0;
  for (const idx of sortedBySum) {
    if (topSum < bottomSum) {
      topSum += sums[idx];
      tops.push(idx);
    } else {
      bottomSum += sums[idx];
      bottoms.unshift(idx);
    }
  }
  const order = bottoms.concat(tops);
  const n = order.length;

  // Assign first column with baseline centered on zero.
  const stacks = order.map((idx) => ({
    idx,
    name: names[idx].name,
    sex: names[idx].sex,
    peakYear: names[idx].peakYear,
    peakCount: names[idx].peakCount,
    points: new Array(m),
  }));

  let totalCol0 = 0;
  for (let i = 0; i < n; i++) totalCol0 += values[order[i]][0];
  let baseline = -totalCol0 / 2;
  let y = baseline;
  for (let i = 0; i < n; i++) {
    const v = values[order[i]][0];
    stacks[i].points[0] = { x: years[0], y0: y, y1: y + v };
    y += v;
  }

  // Subsequent columns: shift baseline by weighted-wiggle delta so the
  // silhouette stays smooth across years.
  for (let j = 1; j < m; j++) {
    let totalNow = 0;
    for (let i = 0; i < n; i++) totalNow += values[order[i]][j];

    let weighted = 0;
    for (let i = 0; i < n; i++) {
      const dF = values[order[i]][j] - values[order[i]][j - 1];
      weighted += (n - i - 0.5) * dF;
    }
    if (totalNow > 0) baseline -= weighted / totalNow;

    y = baseline;
    for (let i = 0; i < n; i++) {
      const v = values[order[i]][j];
      stacks[i].points[j] = { x: years[j], y0: y, y1: y + v };
      y += v;
    }
  }

  return { stacks, years };
}

// Cardinal-spline (uniform Catmull-Rom variant) path through the given points.
// tension ≈ 0.5 trades smoothness for under/overshoot resistance.
function cardinalSegments(points, tension) {
  const f = (1 - tension) / 6;
  let d = "";
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || points[i + 1];
    const c1x = p1.x + f * (p2.x - p0.x);
    const c1y = p1.y + f * (p2.y - p0.y);
    const c2x = p2.x - f * (p3.x - p1.x);
    const c2y = p2.y - f * (p3.y - p1.y);
    d +=
      " C" +
      c1x.toFixed(2) + "," + c1y.toFixed(2) + " " +
      c2x.toFixed(2) + "," + c2y.toFixed(2) + " " +
      p2.x.toFixed(2) + "," + p2.y.toFixed(2);
  }
  return d;
}

// Closed area path: smooth top edge L→R, line down at right end, smooth
// bottom edge R→L, close.
function streamPath(points, xScale, yScale, tension = 0.5) {
  if (!points.length) return "";
  const tops = points.map((p) => ({ x: xScale(p.x), y: yScale(p.y1) }));
  const bottoms = points
    .map((p) => ({ x: xScale(p.x), y: yScale(p.y0) }))
    .reverse();
  let d =
    "M" + tops[0].x.toFixed(2) + "," + tops[0].y.toFixed(2) +
    cardinalSegments(tops, tension) +
    " L" + bottoms[0].x.toFixed(2) + "," + bottoms[0].y.toFixed(2) +
    cardinalSegments(bottoms, tension) +
    " Z";
  return d;
}

// Flat-centerline path for the initial bloom frame: same point count and
// curve commands as the final path, but every y collapsed to the centerline.
function flatPath(points, xScale, centerY, tension = 0.5) {
  if (!points.length) return "";
  const tops = points.map((p) => ({ x: xScale(p.x), y: centerY }));
  const bottoms = points
    .map((p) => ({ x: xScale(p.x), y: centerY }))
    .reverse();
  return (
    "M" + tops[0].x.toFixed(2) + "," + centerY.toFixed(2) +
    cardinalSegments(tops, tension) +
    " L" + bottoms[0].x.toFixed(2) + "," + centerY.toFixed(2) +
    cardinalSegments(bottoms, tension) +
    " Z"
  );
}

// Greedy label placement. Sort streams by max thickness descending, place
// each label at that stream's widest year on the stream midline, and drop
// it if the AABB collides with a previously-placed label.
function placeLabels(stacks, xScale, yScale, fontPx, charWidth = 0.55) {
  const placed = [];
  const ranked = stacks
    .map((s, i) => {
      let maxThickness = 0;
      let maxJ = 0;
      for (let j = 0; j < s.points.length; j++) {
        const t = s.points[j].y1 - s.points[j].y0;
        if (t > maxThickness) {
          maxThickness = t;
          maxJ = j;
        }
      }
      return { stack: s, maxThickness, maxJ, i };
    })
    .sort((a, b) => b.maxThickness - a.maxThickness);

  const out = [];
  for (const { stack, maxJ } of ranked) {
    const pt = stack.points[maxJ];
    const cx = xScale(pt.x);
    const cy = (yScale(pt.y0) + yScale(pt.y1)) / 2;
    const halfH = yScale(pt.y0) - yScale(pt.y1); // stream height in px
    if (halfH < fontPx + 4) continue; // stream too thin to host a horizontal label

    const w = stack.name.length * fontPx * charWidth;
    const box = { x0: cx - w / 2, x1: cx + w / 2, y0: cy - fontPx / 2, y1: cy + fontPx / 2 };
    let collides = false;
    for (const b of placed) {
      if (box.x1 < b.x0 || box.x0 > b.x1 || box.y1 < b.y0 || box.y0 > b.y1) continue;
      collides = true;
      break;
    }
    if (collides) continue;
    placed.push(box);
    out.push({ stack, cx, cy });
  }
  return out;
}

// Numeric solution for cubic-bezier(0.4, 0, 0.2, 1) easing. Small Newton loop
// to invert t→x, then evaluate y(t). Material standard curve.
function easeInOut(x) {
  const cx1 = 0.4;
  const cx2 = 0.2;
  const cy1 = 0;
  const cy2 = 1;
  const ax = 3 * cx1 - 3 * cx2 + 1;
  const bx = -6 * cx1 + 3 * cx2;
  const cxc = 3 * cx1;
  let t = x;
  for (let i = 0; i < 6; i++) {
    const fx = ((ax * t + bx) * t + cxc) * t - x;
    const dfx = (3 * ax * t + 2 * bx) * t + cxc;
    if (Math.abs(dfx) < 1e-6) break;
    t -= fx / dfx;
  }
  t = Math.max(0, Math.min(1, t));
  const ay = 3 * cy1 - 3 * cy2 + 1;
  const by = -6 * cy1 + 3 * cy2;
  const cyc = 3 * cy1;
  return ((ay * t + by) * t + cyc) * t;
}

export function renderRiver(svgEl, payload) {
  const { names, totalsByYear, ym, yM } = payload;
  if (!names || !names.length) return;

  while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);

  const rect = svgEl.getBoundingClientRect();
  const W = Math.max(320, rect.width || 1180);
  const H = Math.max(240, rect.height || 640);

  const padX = 14;
  const padBottom = 32;
  const padTop = 24;
  const innerW = W - padX * 2;
  const innerH = H - padTop - padBottom;

  const { stacks, years } = buildStacks(names, totalsByYear, ym, yM);

  // Determine y extent (in share-of-cohort units) so we can fit the stack.
  let minY = 0;
  let maxY = 0;
  for (const s of stacks) {
    for (const p of s.points) {
      if (p.y0 < minY) minY = p.y0;
      if (p.y1 > maxY) maxY = p.y1;
    }
  }
  const extent = Math.max(Math.abs(minY), Math.abs(maxY)) * 2 || 1;

  const xScale = (year) => padX + ((year - ym) / Math.max(1, yM - ym)) * innerW;
  const centerY = padTop + innerH / 2;
  const yScale = (yVal) => centerY - (yVal / extent) * innerH;

  svgEl.setAttribute("viewBox", "0 0 " + W + " " + H);
  svgEl.setAttribute("preserveAspectRatio", "none");

  // Bloom group — animated. Holds streams + labels so both rise from the
  // centerline together.
  const bloom = document.createElementNS(SVG_NS, "g");
  bloom.setAttribute("class", "river-bloom");
  bloom.setAttribute(
    "transform",
    "matrix(1 0 0 0.001 0 " + (centerY * (1 - 0.001)).toFixed(3) + ")",
  );
  svgEl.appendChild(bloom);

  const streamPaths = [];
  for (const stack of stacks) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("class", "river-stream");
    path.setAttribute("fill", decadeColor(stack.peakYear));
    path.setAttribute("fill-opacity", "0.8");
    path.setAttribute("d", streamPath(stack.points, xScale, yScale));
    path.dataset.name = stack.name;
    path.dataset.sex = stack.sex;
    path.dataset.peakYear = String(stack.peakYear);
    path.dataset.peakCount = String(stack.peakCount);
    bloom.appendChild(path);
    streamPaths.push(path);
  }

  // Labels at each stream's widest year.
  const fontPx = Math.max(11, Math.min(14, Math.round(W * 0.009)));
  const labels = placeLabels(stacks, xScale, yScale, fontPx);
  for (const { stack, cx, cy } of labels) {
    const text = document.createElementNS(SVG_NS, "text");
    text.setAttribute("class", "river-label");
    text.setAttribute("x", cx.toFixed(1));
    text.setAttribute("y", (cy + fontPx * 0.34).toFixed(1));
    text.setAttribute("font-size", String(fontPx));
    text.textContent = stack.name;
    bloom.appendChild(text);
  }

  // Decade axis ticks, drawn below the bloom group so they remain stable
  // during the reveal.
  const axisG = document.createElementNS(SVG_NS, "g");
  axisG.setAttribute("class", "river-axis");
  const firstDecade = Math.ceil(ym / 20) * 20;
  for (let yr = firstDecade; yr <= yM; yr += 20) {
    const tx = xScale(yr);
    const tick = document.createElementNS(SVG_NS, "text");
    tick.setAttribute("class", "river-tick");
    tick.setAttribute("x", tx.toFixed(1));
    tick.setAttribute("y", (H - 12).toFixed(1));
    tick.setAttribute("text-anchor", "middle");
    tick.textContent = String(yr);
    axisG.appendChild(tick);
  }
  svgEl.appendChild(axisG);

  // Hover-to-isolate, click-through.
  let tooltipEl = null;
  const ensureTooltip = () => {
    if (tooltipEl) return tooltipEl;
    tooltipEl = document.createElement("div");
    tooltipEl.className = "river-tooltip";
    tooltipEl.style.display = "none";
    svgEl.parentElement && svgEl.parentElement.appendChild(tooltipEl);
    return tooltipEl;
  };

  const setFocus = (focusedPath) => {
    for (const p of streamPaths) {
      if (!focusedPath) {
        p.classList.remove("river-stream--focus");
        p.classList.remove("river-stream--dim");
      } else if (p === focusedPath) {
        p.classList.add("river-stream--focus");
        p.classList.remove("river-stream--dim");
      } else {
        p.classList.add("river-stream--dim");
        p.classList.remove("river-stream--focus");
      }
    }
  };

  const onMove = (e) => {
    const target = e.target;
    if (!(target instanceof SVGPathElement) || target.getAttribute("class") !== "river-stream") {
      setFocus(null);
      const tt = tooltipEl;
      if (tt) tt.style.display = "none";
      return;
    }
    setFocus(target);
    const tip = ensureTooltip();
    const name = target.dataset.name;
    const sex = target.dataset.sex === "F" ? "feminine" : "masculine";
    const peakYear = target.dataset.peakYear;
    const peakCount = Number(target.dataset.peakCount).toLocaleString("en-US");
    tip.innerHTML =
      '<strong>' + name + '</strong>' +
      ' <span>' + sex + '</span><br>' +
      'peak ' + peakYear + ' · ' + peakCount;
    tip.style.display = "block";
    const hostRect = svgEl.parentElement.getBoundingClientRect();
    tip.style.left = (e.clientX - hostRect.left + 14) + "px";
    tip.style.top = (e.clientY - hostRect.top - 8) + "px";
  };

  const onLeave = () => {
    setFocus(null);
    if (tooltipEl) tooltipEl.style.display = "none";
  };

  const onClick = (e) => {
    const t = e.target;
    if (!(t instanceof SVGPathElement) || t.getAttribute("class") !== "river-stream") return;
    const name = t.dataset.name;
    if (name) location.href = "/name/" + encodeURIComponent(name) + "/";
  };

  svgEl.addEventListener("mousemove", onMove);
  svgEl.addEventListener("mouseleave", onLeave);
  svgEl.addEventListener("click", onClick);

  // Bloom reveal. Skip when the user has asked for reduced motion.
  const reduced =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduced) {
    bloom.removeAttribute("transform");
    return;
  }

  const duration = 1400;
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const e = easeInOut(t);
    const sy = Math.max(0.001, e);
    const ty = centerY * (1 - sy);
    bloom.setAttribute("transform", "matrix(1 0 0 " + sy.toFixed(4) + " 0 " + ty.toFixed(3) + ")");
    if (t < 1) requestAnimationFrame(tick);
    else bloom.removeAttribute("transform");
  };
  requestAnimationFrame(tick);
}
