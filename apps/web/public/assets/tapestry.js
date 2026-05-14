// Hero tapestry — Rise & Fall small-multiples treatment.
// Each card: name label, peak metadata, sparkline with area fill, peak dot.
// Sorted by peak year. Colored by sex.

const SVG_NS = "http://www.w3.org/2000/svg";

const BOY_COLOR = "#465d75";
const GIRL_COLOR = "#a85d5d";

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

// Names sorted by peak year, with realistic peak percentages.
// Data is sparse: {year: count} — counts are relative/illustrative.
const NAMES = [
  // 1880s
  { name: "John", sex: "M", peakYear: 1880, peakPct: 8.2,
    data: {1880:9500,1890:8500,1900:7800,1910:7200,1920:6800,1930:6200,1940:5800,1950:5200,1960:4000,1970:2800,1980:1800,1990:1200,2000:900,2020:600} },
  { name: "William", sex: "M", peakYear: 1880, peakPct: 8.1,
    data: {1880:9400,1890:8200,1900:7000,1920:5500,1940:4800,1950:5200,1960:4500,1970:3800,1980:4200,1990:4800,2000:5200,2010:5800,2020:5600} },
  { name: "Mary", sex: "F", peakYear: 1880, peakPct: 7.1,
    data: {1880:8800,1890:8200,1900:7800,1910:7200,1920:6800,1930:6200,1940:5800,1950:5200,1960:3800,1970:2200,1980:1200,1990:800,2000:600,2020:500} },
  { name: "Charles", sex: "M", peakYear: 1880, peakPct: 4.5,
    data: {1880:5200,1890:4800,1900:4200,1910:3800,1920:3500,1930:3200,1940:3000,1950:2800,1960:2200,1970:1800,1980:1500,1990:1200,2000:1000,2020:900} },
  { name: "Anna", sex: "F", peakYear: 1880, peakPct: 2.9,
    data: {1880:3800,1890:3200,1900:2800,1910:2200,1920:1800,1930:1500,1940:1200,1950:1000,1960:800,1970:700,1980:900,1990:1200,2000:1800,2010:2500,2020:2200} },

  // 1890s–1900s
  { name: "Helen", sex: "F", peakYear: 1898, peakPct: 3.6,
    data: {1880:800,1890:2200,1898:4800,1900:4500,1910:3800,1920:2800,1930:1800,1940:1000,1950:600,1960:300,1970:200,1980:100,2000:50,2020:30} },
  { name: "Ruth", sex: "F", peakYear: 1900, peakPct: 2.0,
    data: {1880:400,1890:1200,1900:2800,1910:3200,1920:2800,1930:1800,1940:1000,1950:500,1960:200,1970:100,1980:50,2000:20,2020:10} },

  // 1910s–1920s
  { name: "Dorothy", sex: "F", peakYear: 1924, peakPct: 3.3,
    data: {1900:800,1910:2200,1920:4500,1924:5200,1930:4800,1940:3200,1950:1800,1960:600,1970:200,1980:100,1990:50,2000:30,2020:20} },
  { name: "Betty", sex: "F", peakYear: 1931, peakPct: 3.3,
    data: {1910:200,1920:800,1930:3800,1931:4200,1940:3200,1950:1800,1960:600,1970:200,1980:50,1990:20,2000:10,2020:5} },
  { name: "Margaret", sex: "F", peakYear: 1921, peakPct: 2.5,
    data: {1900:2200,1910:3200,1920:3800,1930:3200,1940:2800,1950:2200,1960:1500,1970:800,1980:500,1990:400,2000:350,2010:400,2020:380} },

  // 1930s–1940s
  { name: "Robert", sex: "M", peakYear: 1931, peakPct: 5.7,
    data: {1910:2200,1920:3800,1930:5200,1931:5800,1940:4800,1950:4200,1960:3500,1970:2800,1980:2200,1990:1800,2000:1200,2010:800,2020:600} },
  { name: "Barbara", sex: "F", peakYear: 1938, peakPct: 3.4,
    data: {1920:400,1930:2800,1938:4200,1940:3800,1950:2200,1960:800,1970:300,1980:100,1990:50,2000:30,2020:15} },
  { name: "James", sex: "M", peakYear: 1947, peakPct: 5.5,
    data: {1920:3200,1930:4200,1940:4800,1947:5500,1950:5200,1960:4500,1970:3800,1980:3200,1990:2800,2000:2200,2010:1800,2020:1500} },
  { name: "Linda", sex: "F", peakYear: 1947, peakPct: 5.5,
    data: {1920:100,1930:600,1940:2800,1947:5500,1950:4800,1960:2200,1970:800,1980:300,1990:150,2000:80,2010:50,2020:30} },

  // 1950s
  { name: "Michael", sex: "M", peakYear: 1957, peakPct: 4.3,
    data: {1940:1800,1950:3800,1957:5200,1960:4800,1970:4200,1980:3800,1990:3200,2000:2800,2010:2200,2020:1800} },
  { name: "David", sex: "M", peakYear: 1955, peakPct: 4.1,
    data: {1930:800,1940:2200,1950:4200,1955:4800,1960:4500,1970:3800,1980:2800,1990:2200,2000:1800,2010:1500,2020:1200} },
  { name: "Patricia", sex: "F", peakYear: 1951, peakPct: 3.0,
    data: {1930:600,1940:2200,1950:3800,1951:4200,1960:2800,1970:1200,1980:400,1990:150,2000:60,2010:30,2020:15} },
  { name: "Susan", sex: "F", peakYear: 1960, peakPct: 2.7,
    data: {1940:200,1950:1200,1960:3800,1965:3200,1970:1800,1980:600,1990:200,2000:80,2010:30,2020:15} },

  // 1960s
  { name: "Lisa", sex: "F", peakYear: 1965, peakPct: 3.3,
    data: {1950:200,1960:2200,1965:4200,1970:3200,1980:1200,1990:400,2000:150,2010:60,2020:30} },
  { name: "Mark", sex: "M", peakYear: 1960, peakPct: 2.7,
    data: {1940:400,1950:1200,1960:3200,1970:2800,1980:1800,1990:1000,2000:600,2010:400,2020:300} },

  // 1970s
  { name: "Jennifer", sex: "F", peakYear: 1970, peakPct: 4.0,
    data: {1950:100,1960:800,1970:4800,1980:3800,1990:2200,2000:1200,2010:600,2020:300} },
  { name: "Jason", sex: "M", peakYear: 1977, peakPct: 2.5,
    data: {1950:100,1960:600,1970:2800,1977:3200,1980:2800,1990:1800,2000:1200,2010:800,2020:600} },
  { name: "Amy", sex: "F", peakYear: 1976, peakPct: 2.1,
    data: {1950:200,1960:800,1970:2200,1976:2800,1980:2400,1990:1200,2000:600,2010:300,2020:200} },

  // 1980s
  { name: "Jessica", sex: "F", peakYear: 1987, peakPct: 3.0,
    data: {1960:200,1970:800,1980:2800,1987:3800,1990:3200,2000:1800,2010:800,2020:400} },
  { name: "Christopher", sex: "M", peakYear: 1984, peakPct: 2.8,
    data: {1950:200,1960:800,1970:2200,1980:3200,1984:3800,1990:3200,2000:2200,2010:1500,2020:1200} },
  { name: "Ashley", sex: "F", peakYear: 1987, peakPct: 2.5,
    data: {1960:100,1970:400,1980:2200,1987:3200,1990:2800,2000:1200,2010:400,2020:150} },
  { name: "Amanda", sex: "F", peakYear: 1980, peakPct: 1.4,
    data: {1960:400,1970:1200,1980:1800,1985:1600,1990:1200,2000:600,2010:200,2020:100} },

  // 1990s–2000s
  { name: "Jacob", sex: "M", peakYear: 1999, peakPct: 1.8,
    data: {1980:400,1990:1200,1999:2200,2000:2000,2010:1800,2020:1200} },
  { name: "Emily", sex: "F", peakYear: 1999, peakPct: 1.2,
    data: {1980:600,1990:1200,1999:1800,2000:1700,2010:1200,2020:800} },
  { name: "Madison", sex: "F", peakYear: 2001, peakPct: 1.2,
    data: {1990:200,1995:600,2001:1800,2005:1600,2010:1200,2020:600} },

  // 2010s–2020s
  { name: "Noah", sex: "M", peakYear: 2013, peakPct: 1.0,
    data: {2000:400,2005:800,2010:1600,2013:2000,2015:1800,2020:1600} },
  { name: "Emma", sex: "F", peakYear: 2003, peakPct: 1.1,
    data: {1990:400,1995:600,2000:1000,2003:1600,2010:1400,2015:1200,2020:1000} },
  { name: "Sophia", sex: "F", peakYear: 2012, peakPct: 1.2,
    data: {2000:400,2005:800,2010:1400,2012:1800,2015:1600,2020:1200} },
  { name: "Olivia", sex: "F", peakYear: 2014, peakPct: 1.0,
    data: {2000:400,2005:800,2010:1200,2014:1800,2015:1700,2020:1600} },
  { name: "Liam", sex: "M", peakYear: 2018, peakPct: 1.0,
    data: {2000:200,2005:400,2010:800,2015:1600,2018:2000,2020:1800} },
];

function renderCardSpark(container, nameEntry) {
  const w = 160;
  const h = 48;
  const pad = { top: 2, right: 3, bottom: 2, left: 3 };
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

  const color = nameEntry.sex === "M" ? BOY_COLOR : GIRL_COLOR;

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.style.width = "100%";
  svg.style.height = "100%";
  svg.style.display = "block";

  // Area fill
  const fillPath = document.createElementNS(SVG_NS, "path");
  fillPath.setAttribute("d", fillD);
  fillPath.setAttribute("fill", color);
  fillPath.setAttribute("fill-opacity", "0.18");
  svg.appendChild(fillPath);

  // Line
  const linePath = document.createElementNS(SVG_NS, "path");
  linePath.setAttribute("d", pathD);
  linePath.setAttribute("fill", "none");
  linePath.setAttribute("stroke", color);
  linePath.setAttribute("stroke-width", "1.5");
  linePath.setAttribute("stroke-linecap", "round");
  linePath.setAttribute("stroke-linejoin", "round");
  svg.appendChild(linePath);

  // Peak dot
  const peakEntry = entries.reduce((a, b) => a.count > b.count ? a : b);
  const dot = document.createElementNS(SVG_NS, "circle");
  dot.setAttribute("cx", xS(peakEntry.year).toFixed(2));
  dot.setAttribute("cy", yS(peakEntry.count).toFixed(2));
  dot.setAttribute("r", "2.5");
  dot.setAttribute("fill", color);
  svg.appendChild(dot);

  container.appendChild(svg);
}

export function renderTapestry(targetEl) {
  if (!targetEl) return;
  targetEl.innerHTML = "";

  for (const entry of NAMES) {
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
    meta.textContent = `Peak: ${entry.peakYear} · ${entry.peakPct}%`;
    card.appendChild(meta);

    const sparkWrap = document.createElement("div");
    sparkWrap.className = "tapestry-spark-wrap";
    renderCardSpark(sparkWrap, entry);
    card.appendChild(sparkWrap);

    targetEl.appendChild(card);
  }
}
