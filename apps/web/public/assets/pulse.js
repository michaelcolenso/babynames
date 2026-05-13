// The Pulse — stacked area chart of total US births by sex.
//
// Renders a smooth, jank-free hero background: female area on the bottom,
// male area stacked on top.  Hover reveals a vertical scanline and a
// lightweight tooltip.  No dimming, no focus states, no classList thrashing.
//
// No external dependencies. ES module loaded directly by the browser.

const SVG_NS = "http://www.w3.org/2000/svg";

function fmtK(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return Math.round(n / 1000) + "K";
  return String(n);
}

// Cardinal-spline (uniform Catmull-Rom variant) path through the given points.
function cardinalSegments(points, tension = 0.5) {
  const f = (1 - tension) / 6;
  let d = "";
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const c1x = p1.x + f * (p2.x - p0.x);
    const c1y = p1.y + f * (p2.y - p0.y);
    const c2x = p2.x - f * (p3.x - p1.x);
    const c2y = p2.y - f * (p3.y - p1.y);
    d += ` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
  }
  return d;
}

// Closed area path: smooth top edge L→R, line down at right end, straight
// bottom edge R→L, close.  bottomY is a constant y-value for the flat base.
function areaPath(topPoints, bottomY, tension = 0.5) {
  if (!topPoints.length) return "";
  const tops = topPoints;
  const first = tops[0];
  const last = tops[tops.length - 1];
  let d = `M${first.x.toFixed(2)},${first.y.toFixed(2)}`;
  d += cardinalSegments(tops, tension);
  d += ` L${last.x.toFixed(2)},${bottomY.toFixed(2)}`;
  // Straight line back along the bottom
  for (let i = tops.length - 2; i >= 0; i--) {
    d += ` L${tops[i].x.toFixed(2)},${bottomY.toFixed(2)}`;
  }
  d += " Z";
  return d;
}

// Stacked area: bottom edge follows the lower curve, top edge follows upper curve.
function stackedAreaPath(topPoints, bottomPoints, tension = 0.5) {
  if (!topPoints.length || !bottomPoints.length) return "";
  const t = topPoints;
  const b = bottomPoints.slice().reverse();
  let d = `M${t[0].x.toFixed(2)},${t[0].y.toFixed(2)}`;
  d += cardinalSegments(t, tension);
  d += ` L${b[0].x.toFixed(2)},${b[0].y.toFixed(2)}`;
  d += cardinalSegments(b, tension);
  d += " Z";
  return d;
}

export function renderPulse(svgEl, payload) {
  const { totalsByYear, ym, yM } = payload;
  if (!totalsByYear || !ym || !yM) return;

  while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);

  const rect = svgEl.getBoundingClientRect();
  const W = Math.max(320, rect.width || 1180);
  const H = Math.max(240, rect.height || 640);

  const padX = 14;
  const padBottom = 32;
  const padTop = 24;
  const innerW = W - padX * 2;
  const innerH = H - padTop - padBottom;

  const years = [];
  for (let y = ym; y <= yM; y++) years.push(y);

  const data = years.map((y) => {
    const t = totalsByYear[String(y)] || { M: 0, F: 0 };
    return { year: y, M: t.M || 0, F: t.F || 0, total: (t.M || 0) + (t.F || 0) };
  });

  const maxTotal = Math.max(...data.map((d) => d.total)) * 1.05;

  const xScale = (year) => padX + ((year - ym) / Math.max(1, yM - ym)) * innerW;
  const yScale = (v) => padTop + innerH - (v / maxTotal) * innerH;

  svgEl.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svgEl.setAttribute("preserveAspectRatio", "none");

  // --- Gradients ---
  const defs = document.createElementNS(SVG_NS, "defs");
  svgEl.appendChild(defs);

  const gradF = document.createElementNS(SVG_NS, "linearGradient");
  gradF.setAttribute("id", "pulse-f");
  gradF.setAttribute("x1", "0");
  gradF.setAttribute("y1", "0");
  gradF.setAttribute("x2", "0");
  gradF.setAttribute("y2", "1");
  gradF.innerHTML =
    `<stop offset="0%" stop-color="#c4786e" stop-opacity="0.30"/>` +
    `<stop offset="100%" stop-color="#c4786e" stop-opacity="0.04"/>`;
  defs.appendChild(gradF);

  const gradM = document.createElementNS(SVG_NS, "linearGradient");
  gradM.setAttribute("id", "pulse-m");
  gradM.setAttribute("x1", "0");
  gradM.setAttribute("y1", "0");
  gradM.setAttribute("x2", "0");
  gradM.setAttribute("y2", "1");
  gradM.innerHTML =
    `<stop offset="0%" stop-color="#6a8aaa" stop-opacity="0.25"/>` +
    `<stop offset="100%" stop-color="#6a8aaa" stop-opacity="0.03"/>`;
  defs.appendChild(gradM);

  // --- Grid lines ---
  const gridG = document.createElementNS(SVG_NS, "g");
  gridG.setAttribute("class", "pulse-grid");
  const gridSteps = 4;
  for (let i = 1; i <= gridSteps; i++) {
    const v = (maxTotal / gridSteps) * i;
    const gy = yScale(v);
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", padX);
    line.setAttribute("x2", W - padX);
    line.setAttribute("y1", gy);
    line.setAttribute("y2", gy);
    gridG.appendChild(line);
  }
  svgEl.appendChild(gridG);

  // --- Points for curves ---
  const fTops = data.map((d) => ({ x: xScale(d.year), y: yScale(d.F) }));
  const mTops = data.map((d) => ({ x: xScale(d.year), y: yScale(d.total) }));
  const baseY = yScale(0);

  // --- Female area (bottom) ---
  const fPath = document.createElementNS(SVG_NS, "path");
  fPath.setAttribute("class", "pulse-area pulse-area--f");
  fPath.setAttribute("fill", "url(#pulse-f)");
  fPath.setAttribute("d", areaPath(fTops, baseY));
  svgEl.appendChild(fPath);

  // --- Male area (stacked on top of female) ---
  const mPath = document.createElementNS(SVG_NS, "path");
  mPath.setAttribute("class", "pulse-area pulse-area--m");
  mPath.setAttribute("fill", "url(#pulse-m)");
  mPath.setAttribute("d", stackedAreaPath(mTops, fTops));
  svgEl.appendChild(mPath);

  // --- Stroke lines on top ---
  const fLine = document.createElementNS(SVG_NS, "path");
  fLine.setAttribute("class", "pulse-line pulse-line--f");
  fLine.setAttribute("fill", "none");
  fLine.setAttribute("d", `M${fTops[0].x.toFixed(2)},${fTops[0].y.toFixed(2)}${cardinalSegments(fTops)}`);
  svgEl.appendChild(fLine);

  const mLine = document.createElementNS(SVG_NS, "path");
  mLine.setAttribute("class", "pulse-line pulse-line--m");
  mLine.setAttribute("fill", "none");
  mLine.setAttribute("d", `M${mTops[0].x.toFixed(2)},${mTops[0].y.toFixed(2)}${cardinalSegments(mTops)}`);
  svgEl.appendChild(mLine);

  // --- Decade ticks ---
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

  // --- Historical annotations ---
  const events = [
    { year: 1918, label: "WWI ends" },
    { year: 1929, label: "Crash" },
    { year: 1945, label: "WWII ends" },
    { year: 1957, label: "Baby boom peak" },
    { year: 1973, label: "Roe v. Wade" },
    { year: 2008, label: "Great Recession" },
  ];

  const annoG = document.createElementNS(SVG_NS, "g");
  annoG.setAttribute("class", "pulse-anno");
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.year < ym || e.year > yM) continue;
    const ax = xScale(e.year);
    const d = data.find(t => t.year === e.year);
    const dataY = d ? yScale(d.total) : yScale(0);

    // 1957 peak sits at the very top — place its label below
    const placeAbove = e.year !== 1957;
    const labelY = placeAbove ? dataY - 14 : dataY + 20;
    const lineY1 = placeAbove ? dataY - 3 : dataY + 3;
    const lineY2 = placeAbove ? labelY + 4 : labelY - 4;

    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", ax);
    line.setAttribute("y1", lineY1);
    line.setAttribute("x2", ax);
    line.setAttribute("y2", lineY2);
    line.setAttribute("class", "anno-leader");
    annoG.appendChild(line);

    const dot = document.createElementNS(SVG_NS, "circle");
    dot.setAttribute("cx", ax);
    dot.setAttribute("cy", dataY);
    dot.setAttribute("r", 2.5);
    dot.setAttribute("class", "anno-dot");
    annoG.appendChild(dot);

    const text = document.createElementNS(SVG_NS, "text");
    text.setAttribute("x", ax);
    text.setAttribute("y", labelY);
    text.setAttribute("text-anchor", "middle");
    text.textContent = e.label;
    annoG.appendChild(text);
  }
  svgEl.appendChild(annoG);

  // --- Hover interaction (vertical line + tooltip) ---
  let tooltipEl = null;
  const ensureTooltip = () => {
    if (tooltipEl) return tooltipEl;
    tooltipEl = document.createElement("div");
    tooltipEl.className = "river-tooltip pulse-tooltip";
    tooltipEl.style.display = "none";
    svgEl.parentElement && svgEl.parentElement.appendChild(tooltipEl);
    return tooltipEl;
  };

  const hoverLine = document.createElementNS(SVG_NS, "line");
  hoverLine.setAttribute("class", "pulse-hoverline");
  hoverLine.setAttribute("y1", padTop);
  hoverLine.setAttribute("y2", H - padBottom);
  hoverLine.style.display = "none";
  svgEl.appendChild(hoverLine);

  const onMove = (e) => {
    const svgRect = svgEl.getBoundingClientRect();
    const mx = e.clientX - svgRect.left;
    if (mx < padX || mx > W - padX) {
      hoverLine.style.display = "none";
      if (tooltipEl) tooltipEl.style.display = "none";
      return;
    }

    const yearFrac = (mx - padX) / innerW;
    const yr = Math.round(ym + yearFrac * (yM - ym));
    const d = data.find((t) => t.year === yr);
    if (!d) return;

    const x = xScale(yr);
    hoverLine.style.display = "";
    hoverLine.setAttribute("x1", x);
    hoverLine.setAttribute("x2", x);

    const tip = ensureTooltip();
    tip.innerHTML =
      `<div class="pulse-tip-year">${yr}</div>` +
      `<div class="pulse-tip-row"><span class="pulse-tip-dot" style="background:#6a8aaa"></span>${fmtK(d.M)} boys</div>` +
      `<div class="pulse-tip-row"><span class="pulse-tip-dot" style="background:#c4786e"></span>${fmtK(d.F)} girls</div>` +
      `<div class="pulse-tip-total">${fmtK(d.total)} total</div>`;
    tip.style.display = "block";

    const hostRect = svgEl.parentElement.getBoundingClientRect();
    let tx = e.clientX - hostRect.left + 16;
    let ty = e.clientY - hostRect.top - 8;
    const tipRect = tip.getBoundingClientRect();
    if (tx + tipRect.width > hostRect.width) tx = e.clientX - hostRect.left - tipRect.width - 16;
    tip.style.left = tx + "px";
    tip.style.top = ty + "px";
  };

  const onLeave = () => {
    hoverLine.style.display = "none";
    if (tooltipEl) tooltipEl.style.display = "none";
  };

  svgEl.addEventListener("mousemove", onMove);
  svgEl.addEventListener("mouseleave", onLeave);
}
