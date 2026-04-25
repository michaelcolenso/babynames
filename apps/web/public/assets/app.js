// Name Vitals — client-side app.
//
// Key change vs the legacy version: data is fetched from /api/* endpoints
// backed by Cloudflare D1, not from static per-letter JSON shards.
// The per-name vitals view now lives at /name/<Name>/ (SSR) and this script
// only handles the search/autocomplete UX on the home page, plus hydrating
// the share-card buttons on the SSR-rendered name pages.

const fmt = (n) => {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString("en-US");
};

const titleCase = (s) =>
  s.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase());

let _metaCache = null;
async function fetchMeta() {
  if (_metaCache) return _metaCache;
  const r = await fetch("/api/meta");
  if (!r.ok) throw new Error("meta fetch failed");
  _metaCache = await r.json();
  return _metaCache;
}

// Autocomplete via /api/search — replaces the legacy letter-shard scan.
async function searchNames(query, limit = 10) {
  const r = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=${limit}`);
  if (!r.ok) return [];
  const { results } = await r.json();
  return results ?? [];
}

function analyze(record) {
  const { series, ym, yM } = record;
  const years = Object.keys(series).map(Number).sort((a, b) => a - b);
  if (!years.length) return null;
  const firstYear = years[0];
  const lastYear = years[years.length - 1];
  const total = years.reduce((a, y) => a + series[y], 0);
  let peakYear = years[0];
  let peakCount = series[peakYear];
  for (const y of years) {
    if (series[y] > peakCount) { peakCount = series[y]; peakYear = y; }
  }
  const latest = series[yM] || 0;
  const recent = (n) => {
    let s = 0;
    for (let y = yM - n + 1; y <= yM; y++) s += series[y] || 0;
    return s;
  };
  const last5Avg = recent(5) / 5;
  const prev5Avg = (() => {
    let s = 0;
    for (let y = yM - 9; y <= yM - 5; y++) s += series[y] || 0;
    return s / 5;
  })();
  let status;
  if (latest === 0 && lastYear <= yM - 10) status = "extinct";
  else if (peakCount >= 200 && latest > 0 && latest <= peakCount * 0.1) status = "endangered";
  else if (last5Avg > 0 && prev5Avg > 0 && last5Avg / prev5Avg >= 1.2) status = "rising";
  else if (last5Avg > 0 && prev5Avg > 0 && last5Avg / prev5Avg <= 0.8) status = "declining";
  else if (latest === 0) status = "declining";
  else status = "stable";
  const declineFromPeakPct = peakCount ? Math.round(100 * (1 - latest / peakCount)) : 0;
  return { firstYear, lastYear, peakYear, peakCount, latest, total, status, declineFromPeakPct, last5Avg, prev5Avg };
}

function buildSparkline(record, opts = {}) {
  const { series, ym, yM } = record;
  const width = opts.width || 680;
  const height = opts.height || 170;
  const pad = { top: 14, right: 8, bottom: 22, left: 8 };
  const years = [], vals = [];
  for (let y = ym; y <= yM; y++) { years.push(y); vals.push(series[y] || 0); }
  const maxV = Math.max(1, ...vals);
  const xStep = (width - pad.left - pad.right) / (years.length - 1);
  const yScale = (v) => height - pad.bottom - (v / maxV) * (height - pad.top - pad.bottom);
  let linePath = "";
  for (let i = 0; i < years.length; i++) {
    const x = pad.left + i * xStep;
    const y = yScale(vals[i]);
    linePath += (i === 0 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1);
  }
  const fillPath = linePath +
    `L${(pad.left + (years.length - 1) * xStep).toFixed(1)},${(height - pad.bottom).toFixed(1)}` +
    `L${pad.left.toFixed(1)},${(height - pad.bottom).toFixed(1)}Z`;
  let peakIdx = 0;
  for (let i = 0; i < vals.length; i++) if (vals[i] > vals[peakIdx]) peakIdx = i;
  const peakX = pad.left + peakIdx * xStep;
  const peakY = yScale(vals[peakIdx]);
  let ticks = "";
  for (let y = Math.ceil(ym / 20) * 20; y <= yM; y += 20) {
    const x = pad.left + (y - ym) * xStep;
    ticks += `<text x="${x.toFixed(1)}" y="${height - 6}" class="axis-text" text-anchor="middle">${y}</text>`;
  }
  return `<svg class="sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
  <line class="axis" x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}"/>
  <path class="fill" d="${fillPath}"/>
  <path class="line" d="${linePath}"/>
  <circle class="peak" cx="${peakX.toFixed(1)}" cy="${peakY.toFixed(1)}" r="4"/>
  ${ticks}
</svg>`;
}

function renderReport(record) {
  const a = analyze(record);
  if (!a) return `<div class="report"><h1>${record.name}</h1><p class="lede">No data for this name.</p></div>`;
  const sexLabel = record.sex === "M" ? "boys" : "girls";
  const statusCopy = {
    rising: ["Rising", `More babies were named ${record.name} in the last five years than in the five before that — the name is gaining ground.`],
    stable: ["Stable", `Popularity of ${record.name} has held roughly steady over the last decade.`],
    declining: ["Declining", `${record.name} is losing ground: the last five years came in below the five before.`],
    endangered: ["Endangered", `${record.name} has fallen ${a.declineFromPeakPct}% from its peak and only ${fmt(a.latest)} babies received it in ${record.yM}.`],
    extinct: ["Extinct", `No babies have been named ${record.name} in ${record.yM - a.lastYear} years. It last appeared in ${a.lastYear}, when ${fmt(record.series[a.lastYear])} ${sexLabel} were given the name.`],
  }[a.status];
  const peakSentence = `Your name peaked in ${a.peakYear}, when <strong>${fmt(a.peakCount)}</strong> ${sexLabel} were named ${record.name}.`;
  const latestSentence = a.latest
    ? `In ${record.yM}, only <strong>${fmt(a.latest)}</strong> ${sexLabel} were given the name.`
    : `No ${sexLabel} were recorded with this name in ${record.yM} — at least not five of them (the SSA's reporting floor).`;
  const declineSentence = a.status === "rising" || a.declineFromPeakPct <= 5
    ? "" : `<p>Down <strong>${a.declineFromPeakPct}%</strong> from its peak.</p>`;
  const totalSentence = `<p>All told, about <strong>${fmt(a.total)}</strong> Americans have been named ${record.name} and recorded by the Social Security Administration since ${a.firstYear}.</p>`;
  return `<article class="report" data-name="${record.name}" data-sex="${record.sex}">
  <h1>${record.name}</h1>
  <div class="sex">${record.sex === "M" ? "Masculine" : "Feminine"} · first seen ${a.firstYear}</div>
  <div class="status-pill status-${a.status}">${statusCopy[0]}</div>
  ${buildSparkline(record)}
  <div class="narrative">
    <p>${statusCopy[1]}</p>
    <p>${peakSentence}</p>
    <p>${latestSentence}</p>
    ${declineSentence}
    ${totalSentence}
  </div>
  <div class="stats">
    <div class="stat"><div class="label">Peak year</div><div class="value">${a.peakYear}</div></div>
    <div class="stat"><div class="label">Peak count</div><div class="value">${fmt(a.peakCount)}</div></div>
    <div class="stat"><div class="label">${record.yM}</div><div class="value">${fmt(a.latest)}</div></div>
    <div class="stat"><div class="label">All-time</div><div class="value">${fmt(a.total)}</div></div>
  </div>
  <div class="share-row">
    <button class="primary" data-share="card">Download share card</button>
    <button data-share="twitter">Share on Twitter</button>
    <button data-share="copy">Copy link</button>
  </div>
  <div class="affiliate">
    Curious about the history of ${record.name}? Browse
    <a rel="nofollow sponsored" target="_blank" href="https://www.amazon.com/s?k=${encodeURIComponent("history of the name " + record.name)}&tag=">books about the name ${record.name} on Amazon</a>.
  </div>
</article>`;
}

function renderShareCard(record) {
  const a = analyze(record);
  if (!a) return;
  const W = 1200, H = 630;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  const bg = getComputedStyle(document.body).getPropertyValue("--share-bg").trim() || "#0a1a3a";
  const fg = "#f5f3ea", accent = "#7fb4ff";
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = accent;
  ctx.font = "500 26px 'SF Mono', ui-monospace, Menlo, monospace";
  ctx.fillText("NAME VITALS", 80, 90);
  ctx.fillStyle = fg;
  ctx.font = "700 130px 'Iowan Old Style', Palatino, Georgia, serif";
  ctx.fillText(record.name, 80, 220);
  ctx.fillStyle = accent;
  ctx.font = "400 28px 'Iowan Old Style', Palatino, Georgia, serif";
  ctx.fillText(`${record.sex === "M" ? "Masculine" : "Feminine"} · ${a.firstYear}–${record.yM}`, 80, 258);
  const statusLabel = { rising: "RISING", stable: "STABLE", declining: "DECLINING", endangered: "ENDANGERED", extinct: "EXTINCT" }[a.status];
  const statusColor = { rising: "#34d399", stable: "#9ca3af", declining: "#fbbf24", endangered: "#f87171", extinct: "#d1d5db" }[a.status];
  ctx.font = "600 22px 'SF Mono', ui-monospace, Menlo, monospace";
  const pw = ctx.measureText(statusLabel).width + 28;
  ctx.fillStyle = statusColor;
  ctx.beginPath();
  const pillX = 80, pillY = 290, pillH = 42;
  if (ctx.roundRect) ctx.roundRect(pillX, pillY, pw, pillH, 21);
  else ctx.rect(pillX, pillY, pw, pillH);
  ctx.fill();
  ctx.fillStyle = "#0a1a3a";
  ctx.fillText(statusLabel, pillX + 14, pillY + 28);
  const { series, ym, yM } = record;
  const vals = [];
  for (let y = ym; y <= yM; y++) vals.push(series[y] || 0);
  const maxV = Math.max(1, ...vals);
  const sx = 80, sy = 360, sw = W - 160, sh = 150;
  ctx.strokeStyle = "rgba(245,243,234,0.15)";
  ctx.beginPath(); ctx.moveTo(sx, sy + sh); ctx.lineTo(sx + sw, sy + sh); ctx.stroke();
  ctx.strokeStyle = accent; ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < vals.length; i++) {
    const x = sx + (i / (vals.length - 1)) * sw;
    const y = sy + sh - (vals[i] / maxV) * sh;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.lineTo(sx + sw, sy + sh); ctx.lineTo(sx, sy + sh);
  ctx.fillStyle = "rgba(127,180,255,0.2)"; ctx.fill();
  let pi = 0;
  for (let i = 0; i < vals.length; i++) if (vals[i] > vals[pi]) pi = i;
  const px = sx + (pi / (vals.length - 1)) * sw;
  const py = sy + sh - (vals[pi] / maxV) * sh;
  ctx.fillStyle = "#fbbf24";
  ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = fg;
  ctx.font = "500 28px 'Iowan Old Style', Palatino, Georgia, serif";
  ctx.fillText(`Peaked ${a.peakYear} · ${fmt(a.peakCount)}`, 80, sy + sh + 48);
  ctx.textAlign = "right";
  ctx.fillText(`${record.yM}: ${fmt(a.latest)}`, W - 80, sy + sh + 48);
  ctx.textAlign = "left";
  ctx.fillStyle = accent;
  ctx.font = "500 22px 'SF Mono', ui-monospace, Menlo, monospace";
  ctx.fillText("namevitals", 80, H - 50);
  return canvas;
}

function downloadCanvas(canvas, filename) {
  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png");
}

// Attach share-card / Twitter / copy-link handlers to an already-rendered
// report container. Called both from the SSR name page (to hydrate server
// HTML) and from any client-side render.
function attachShareHandlers(container, record) {
  container.querySelectorAll("[data-share]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const kind = btn.getAttribute("data-share");
      const url = location.href;
      if (kind === "copy") {
        navigator.clipboard.writeText(url);
        btn.textContent = "Copied!";
        setTimeout(() => (btn.textContent = "Copy link"), 1200);
      } else if (kind === "twitter") {
        const msg = encodeURIComponent(`Is the name ${record.name} going extinct? Check it out:`);
        window.open(`https://twitter.com/intent/tweet?text=${msg}&url=${encodeURIComponent(url)}`, "_blank");
      } else if (kind === "card") {
        const canvas = renderShareCard(record);
        if (canvas) downloadCanvas(canvas, `${record.name.toLowerCase()}-name-vitals.png`);
      }
    });
  });
}

async function setupSearch(input, suggestions, submit, sexSelect) {
  let currentSuggestions = [];
  let activeIdx = -1;

  const hide = () => { suggestions.classList.add("hidden"); activeIdx = -1; };
  const render = () => {
    if (!currentSuggestions.length) return hide();
    suggestions.classList.remove("hidden");
    suggestions.innerHTML = currentSuggestions
      .map((s, i) => `<div data-i="${i}" class="${i === activeIdx ? "active" : ""}"><span>${s.name}</span><span class="meta">${s.sex === "M" ? "masculine" : "feminine"}${s.peak_count ? " · peak " + fmt(s.peak_count) : ""}</span></div>`)
      .join("");
    suggestions.querySelectorAll("div").forEach((el) => {
      el.addEventListener("mousedown", (e) => {
        e.preventDefault();
        pick(currentSuggestions[Number(el.getAttribute("data-i"))]);
      });
    });
  };

  const pick = (s) => { input.value = s.name; hide(); go(s.name, s.sex); };
  const go = (name, sex) => {
    const n = titleCase((name || input.value).trim());
    if (!n) return;
    const params = new URLSearchParams();
    if (sex || (sexSelect && sexSelect.value)) params.set("sex", sex || sexSelect.value);
    const tail = params.toString() ? "?" + params.toString() : "";
    location.href = `/name/${encodeURIComponent(n)}/${tail}`;
  };

  input.addEventListener("input", async () => {
    const q = input.value.trim();
    if (q.length < 2) { hide(); return; }
    try {
      currentSuggestions = await searchNames(q, 10);
      activeIdx = -1;
      render();
    } catch (e) { hide(); }
  });

  input.addEventListener("keydown", (e) => {
    if (!suggestions.classList.contains("hidden")) {
      if (e.key === "ArrowDown") { activeIdx = Math.min(currentSuggestions.length - 1, activeIdx + 1); render(); e.preventDefault(); }
      else if (e.key === "ArrowUp") { activeIdx = Math.max(0, activeIdx - 1); render(); e.preventDefault(); }
      else if (e.key === "Enter" && activeIdx >= 0) { pick(currentSuggestions[activeIdx]); e.preventDefault(); return; }
      else if (e.key === "Escape") { hide(); }
    }
    if (e.key === "Enter" && activeIdx < 0) go();
  });

  input.addEventListener("blur", () => setTimeout(hide, 120));
  submit.addEventListener("click", () => go());
}

window.NameVitals = {
  fetchMeta,
  searchNames,
  setupSearch,
  analyze,
  buildSparkline,
  renderReport,
  attachShareHandlers,
  titleCase,
  fmt,
};
