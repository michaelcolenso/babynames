// Hero tapestry — decade rows of defining names.
// Fetches real top names per decade from /api/decades-summary and renders
// each as a small-multiple card with a normalized sparkline.

const SVG_NS = "http://www.w3.org/2000/svg";

const BOY_COLOR = "#465d75";
const GIRL_COLOR = "#a85d5d";

function renderSparkFromBuckets(container, spark, sex) {
  if (!spark || !spark.length) return;
  const color = sex === "M" ? BOY_COLOR : GIRL_COLOR;
  const w = 160;
  const h = 48;
  const pad = { top: 2, right: 3, bottom: 2, left: 3 };
  const iw = w - pad.left - pad.right;
  const ih = h - pad.top - pad.bottom;

  const maxV = Math.max(1, ...spark);
  const pts = spark.map((v, i) => ({
    x: pad.left + (i / Math.max(1, spark.length - 1)) * iw,
    y: pad.top + ih - (v / maxV) * ih,
  }));

  let pathD = `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) {
    pathD += ` L${pts[i].x.toFixed(2)},${pts[i].y.toFixed(2)}`;
  }

  const fillD = pathD +
    ` L${pts[pts.length - 1].x.toFixed(2)},${(h - pad.bottom).toFixed(2)}` +
    ` L${pts[0].x.toFixed(2)},${(h - pad.bottom).toFixed(2)}Z`;

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.style.width = "100%";
  svg.style.height = "100%";
  svg.style.display = "block";

  const fillPath = document.createElementNS(SVG_NS, "path");
  fillPath.setAttribute("d", fillD);
  fillPath.setAttribute("fill", color);
  fillPath.setAttribute("fill-opacity", "0.18");
  svg.appendChild(fillPath);

  const linePath = document.createElementNS(SVG_NS, "path");
  linePath.setAttribute("d", pathD);
  linePath.setAttribute("fill", "none");
  linePath.setAttribute("stroke", color);
  linePath.setAttribute("stroke-width", "1.5");
  linePath.setAttribute("stroke-linecap", "round");
  linePath.setAttribute("stroke-linejoin", "round");
  svg.appendChild(linePath);

  const peakIdx = spark.reduce((a, b, i) => (b > spark[a] ? i : a), 0);
  const dot = document.createElementNS(SVG_NS, "circle");
  dot.setAttribute("cx", pts[peakIdx].x.toFixed(2));
  dot.setAttribute("cy", pts[peakIdx].y.toFixed(2));
  dot.setAttribute("r", "2.5");
  dot.setAttribute("fill", color);
  svg.appendChild(dot);

  container.appendChild(svg);
}

function fmtCompact(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

function renderTapestryCard(entry) {
  const color = entry.sex === "M" ? BOY_COLOR : GIRL_COLOR;

  const card = document.createElement("a");
  card.className = "tapestry-cell";
  card.href = `/name/${encodeURIComponent(entry.name)}/`;

  const label = document.createElement("div");
  label.className = "tapestry-label";
  label.textContent = entry.name;
  label.style.color = color;
  card.appendChild(label);

  const meta = document.createElement("div");
  meta.className = "tapestry-meta";
  meta.textContent = `${fmtCompact(entry.decade_total)} in decade`;
  card.appendChild(meta);

  const sparkWrap = document.createElement("div");
  sparkWrap.className = "tapestry-spark-wrap";
  renderSparkFromBuckets(sparkWrap, entry.spark, entry.sex);
  card.appendChild(sparkWrap);

  return card;
}

export async function renderTapestry(targetEl) {
  if (!targetEl) return;
  targetEl.innerHTML = "";
  targetEl.classList.add("tapestry-by-decade");

  let decades = [];
  try {
    const r = await fetch("/api/decades-summary");
    if (r.ok) {
      const data = await r.json();
      decades = data.decades || [];
    }
  } catch (e) {
    // Fall through to empty state.
  }

  if (!decades.length) {
    targetEl.innerHTML = `<p class="search-hint">Decade data unavailable.</p>`;
    return;
  }

  for (const decade of decades) {
    const row = document.createElement("div");
    row.className = "tapestry-row";

    const header = document.createElement("div");
    header.className = "tapestry-row-header";

    const decadeLink = document.createElement("a");
    decadeLink.className = "tapestry-decade";
    decadeLink.href = `/names/${decade.label}/`;
    decadeLink.textContent = decade.label;
    header.appendChild(decadeLink);

    row.appendChild(header);

    const cards = document.createElement("div");
    cards.className = "tapestry-row-cards";
    for (const entry of decade.names.slice(0, 5)) {
      cards.appendChild(renderTapestryCard(entry));
    }
    row.appendChild(cards);

    targetEl.appendChild(row);
  }
}
