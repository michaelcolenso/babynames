// Name Tapestry — a grid of miniature sparklines showing iconic name trajectories.
// Each cell is a self-contained SVG sparkline. Hover reveals name + peak + status.

const SVG_NS = "http://www.w3.org/2000/svg";

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

const NAMES = [
  { name: "Michael", sex: "M", status: "declining", color: "#a96720", peakYear: 1957,
    data: { 1880:500, 1900:1500, 1920:6000, 1940:18000, 1950:55000, 1957:88000, 1970:75000, 1990:45000, 2010:15000, 2020:10000 } },
  { name: "Elizabeth", sex: "F", status: "stable", color: "#465d75", peakYear: 1980,
    data: { 1880:8000, 1900:7000, 1920:9000, 1940:12000, 1950:15000, 1960:12000, 1980:18000, 1990:15000, 2000:14000, 2010:13000, 2020:12000 } },
  { name: "William", sex: "M", status: "stable", color: "#465d75", peakYear: 1950,
    data: { 1880:15000, 1900:12000, 1920:10000, 1940:12000, 1950:18000, 1960:15000, 1980:18000, 1990:16000, 2000:17000, 2010:18000, 2020:17000 } },
  { name: "James", sex: "M", status: "stable", color: "#465d75", peakYear: 1960,
    data: { 1880:10000, 1900:12000, 1920:18000, 1940:25000, 1950:45000, 1960:50000, 1970:45000, 1980:35000, 1990:28000, 2000:22000, 2010:18000, 2020:15000 } },
  { name: "Jennifer", sex: "F", status: "declining", color: "#a96720", peakYear: 1970,
    data: { 1930:50, 1940:200, 1950:1500, 1960:15000, 1970:85000, 1980:58000, 1990:25000, 2000:8000, 2010:4000, 2020:1500 } },
  { name: "Ashley", sex: "F", status: "endangered", color: "#a96720", peakYear: 1987,
    data: { 1960:500, 1970:3000, 1980:35000, 1990:45000, 1995:35000, 2000:20000, 2010:8000, 2020:3000 } },
  { name: "Linda", sex: "F", status: "endangered", color: "#a96720", peakYear: 1947,
    data: { 1920:500, 1930:2000, 1940:15000, 1947:55000, 1950:50000, 1960:35000, 1970:15000, 1980:5000, 1990:2000, 2000:800, 2020:300 } },
  { name: "Jessica", sex: "F", status: "declining", color: "#a96720", peakYear: 1987,
    data: { 1950:100, 1960:500, 1970:5000, 1980:35000, 1990:45000, 1995:30000, 2000:18000, 2010:8000, 2020:3000 } },
  { name: "Theodore", sex: "M", status: "resurgent", color: "#74558c", peakYear: 2020,
    data: { 1880:8000, 1900:6500, 1920:4000, 1940:2500, 1960:1500, 1980:1000, 1990:1500, 2000:3000, 2010:8000, 2015:12000, 2020:15000 } },
  { name: "Hazel", sex: "F", status: "resurgent", color: "#74558c", peakYear: 1910,
    data: { 1880:3000, 1900:4000, 1920:3000, 1940:1500, 1960:500, 1980:200, 1990:300, 2000:800, 2010:3000, 2020:6000 } },
  { name: "Eleanor", sex: "F", status: "rising", color: "#22745d", peakYear: 1920,
    data: { 1880:5000, 1900:6000, 1920:8000, 1940:6000, 1960:3000, 1980:1500, 1990:1500, 2000:2000, 2010:4000, 2020:8000 } },
  { name: "Violet", sex: "F", status: "rising", color: "#22745d", peakYear: 1915,
    data: { 1880:4000, 1900:3500, 1920:2500, 1940:1500, 1960:800, 1980:500, 1990:600, 2000:1500, 2010:4000, 2020:7000 } },
  { name: "Oliver", sex: "M", status: "rising", color: "#22745d", peakYear: 2020,
    data: { 1880:3000, 1900:2500, 1920:2000, 1940:1500, 1960:1000, 1980:800, 1990:1500, 2000:5000, 2010:12000, 2020:18000 } },
  { name: "Bertha", sex: "F", status: "extinct", color: "#3c3a35", peakYear: 1880,
    data: { 1880:15000, 1890:12000, 1900:8000, 1920:4000, 1940:1500, 1960:300, 1980:0, 2000:0, 2020:0 } },
  { name: "Mildred", sex: "F", status: "extinct", color: "#3c3a35", peakYear: 1920,
    data: { 1880:8000, 1900:10000, 1920:12000, 1930:8000, 1940:4000, 1960:500, 1980:0, 2000:0, 2020:0 } },
  { name: "Emma", sex: "F", status: "stable", color: "#465d75", peakYear: 2003,
    data: { 1880:10000, 1900:8000, 1920:6000, 1940:4000, 1960:2000, 1980:1500, 1990:2000, 2000:15000, 2010:18000, 2020:16000 } },
];

function renderMiniSpark(container, nameEntry) {
  const w = 140;
  const h = 34;
  const pad = { top: 3, right: 2, bottom: 3, left: 2 };
  const iw = w - pad.left - pad.right;
  const ih = h - pad.top - pad.bottom;

  const entries = Object.entries(nameEntry.data).map(([y, c]) => ({ year: Number(y), count: c }));
  const minYear = Math.min(...entries.map(e => e.year));
  const maxYear = Math.max(...entries.map(e => e.year));
  const maxC = Math.max(...entries.map(e => e.count));

  const xS = (year) => pad.left + ((year - minYear) / Math.max(1, maxYear - minYear)) * iw;
  const yS = (c) => pad.top + ih - (c / Math.max(1, maxC)) * ih;

  const pts = entries.map(e => ({ x: xS(e.year), y: yS(e.count) }));

  let pathD = `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`;
  pathD += cardinalSegments(pts);

  const fillD = pathD +
    ` L${pts[pts.length - 1].x.toFixed(2)},${(h - pad.bottom).toFixed(2)}` +
    ` L${pts[0].x.toFixed(2)},${(h - pad.bottom).toFixed(2)}Z`;

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("class", "tapestry-spark");

  const defs = document.createElementNS(SVG_NS, "defs");
  const grad = document.createElementNS(SVG_NS, "linearGradient");
  grad.setAttribute("id", `grad-${nameEntry.name}`);
  grad.setAttribute("x1", "0");
  grad.setAttribute("y1", "0");
  grad.setAttribute("x2", "0");
  grad.setAttribute("y2", "1");
  grad.innerHTML =
    `<stop offset="0%" stop-color="${nameEntry.color}" stop-opacity="0.22"/>` +
    `<stop offset="100%" stop-color="${nameEntry.color}" stop-opacity="0.02"/>`;
  defs.appendChild(grad);
  svg.appendChild(defs);

  const fillPath = document.createElementNS(SVG_NS, "path");
  fillPath.setAttribute("d", fillD);
  fillPath.setAttribute("fill", `url(#grad-${nameEntry.name})`);
  svg.appendChild(fillPath);

  const linePath = document.createElementNS(SVG_NS, "path");
  linePath.setAttribute("d", pathD);
  linePath.setAttribute("fill", "none");
  linePath.setAttribute("stroke", nameEntry.color);
  linePath.setAttribute("stroke-width", "1.6");
  linePath.setAttribute("stroke-linecap", "round");
  linePath.setAttribute("stroke-linejoin", "round");
  svg.appendChild(linePath);

  // Peak dot
  const peakEntry = entries.reduce((a, b) => a.count > b.count ? a : b);
  const dot = document.createElementNS(SVG_NS, "circle");
  dot.setAttribute("cx", xS(peakEntry.year).toFixed(2));
  dot.setAttribute("cy", yS(peakEntry.count).toFixed(2));
  dot.setAttribute("r", "2");
  dot.setAttribute("fill", nameEntry.color);
  dot.setAttribute("fill-opacity", "0.7");
  svg.appendChild(dot);

  container.appendChild(svg);
}

export function renderTapestry(targetEl) {
  if (!targetEl) return;
  targetEl.innerHTML = "";

  for (const entry of NAMES) {
    const cell = document.createElement("a");
    cell.className = "tapestry-cell";
    cell.href = `/name/${encodeURIComponent(entry.name)}/`;
    cell.style.setProperty("--tapestry-color", entry.color);

    const sparkWrap = document.createElement("div");
    sparkWrap.className = "tapestry-spark-wrap";
    renderMiniSpark(sparkWrap, entry);
    cell.appendChild(sparkWrap);

    const meta = document.createElement("div");
    meta.className = "tapestry-meta";
    meta.innerHTML =
      `<span class="tapestry-name">${entry.name}</span>` +
      `<span class="tapestry-status">${entry.status}</span>`;
    cell.appendChild(meta);

    targetEl.appendChild(cell);
  }
}
