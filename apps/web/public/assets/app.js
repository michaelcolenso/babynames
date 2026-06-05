// nobodynamed — client-side app.
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

const statusLabel = (status) => ({
  rising: "Rising",
  stable: "Stable",
  declining: "Stable Decline",
  endangered: "Endangered",
  extinct: "Extinct",
})[status] || "Stable";

const statusColor = (status) => ({
  rising: "#22745d",
  stable: "#465d75",
  declining: "#a96720",
  endangered: "#a96720",
  extinct: "#3c3a35",
})[status] || "#465d75";

function generationForYear(year) {
  if (year >= 2013) return "Gen Alpha";
  if (year >= 1997) return "Gen Z";
  if (year >= 1981) return "Millennial";
  if (year >= 1965) return "Gen X";
  if (year >= 1946) return "Boomer";
  if (year >= 1928) return "Silent Generation";
  return "Greatest Generation";
}

function setupSexSegments(group, sexSelect) {
  if (!group || !sexSelect) return;
  const buttons = [...group.querySelectorAll("[data-sex]")];
  const sync = (value) => {
    sexSelect.value = value;
    buttons.forEach((btn) => btn.classList.toggle("active", btn.dataset.sex === value));
  };
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => sync(btn.dataset.sex || ""));
  });
  sync(sexSelect.value || "");
}

function rotatePlaceholder(input, examples, intervalMs = 2200) {
  if (!input || !examples?.length) return;
  let i = 0;
  input.placeholder = examples[i];
  window.setInterval(() => {
    if (document.activeElement === input || input.value) return;
    i = (i + 1) % examples.length;
    input.placeholder = examples[i];
  }, intervalMs);
}

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
  const peakSentence = `${record.name} peaked in ${a.peakYear}, when <strong>${fmt(a.peakCount)}</strong> ${sexLabel} were given the name.`;
  const latestSentence = a.latest
    ? `In ${record.yM}, only <strong>${fmt(a.latest)}</strong> ${sexLabel} were given the name.`
    : `No ${sexLabel} were recorded with this name in ${record.yM} — at least not five of them (the SSA's reporting floor).`;
  const declineSentence = a.status === "rising" || a.declineFromPeakPct <= 5
    ? "" : `<p>Down <strong>${a.declineFromPeakPct}%</strong> from its peak.</p>`;
  const totalSentence = `<p>In all, the Social Security Administration has recorded about <strong>${fmt(a.total)}</strong> Americans named ${record.name} since ${a.firstYear}.</p>`;

  const showCollision = (a.status === "declining" || a.status === "endangered" || a.status === "extinct") && a.peakCount >= 500;
  const collisionBox = showCollision ? `<div class="collision-box">
    <div class="collision-row"><span class="collision-year">${a.peakYear}</span><strong>${fmt(a.peakCount)}</strong> ${sexLabel} named ${record.name}</div>
    <div class="collision-row collision-now"><span class="collision-year">${record.yM}</span><strong>${a.latest === 0 ? "0 (extinct)" : fmt(a.latest)}</strong> ${sexLabel} named ${record.name}</div>
  </div>` : "";

  return `<article class="report" data-name="${record.name}" data-sex="${record.sex}">
  <h1>${record.name}</h1>
  <div class="sex">${record.sex === "M" ? "Masculine" : "Feminine"} · first seen ${a.firstYear}</div>
  <div class="status-pill status-${a.status}">${statusCopy[0]}</div>
  ${buildSparkline(record)}
  ${collisionBox}
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
    <button data-share="twin">Find my name's twin →</button>
  </div>
  <div id="twin-result"></div>
</article>`;
}

function renderShareCard(record) {
  const a = analyze(record);
  if (!a) return;
  const W = 1080, H = 1920;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  const bg = getComputedStyle(document.body).getPropertyValue("--share-bg").trim() || "#171511";
  const fg = "#f7efe1", accent = "#d9a56f";
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(247,239,225,0.06)";
  for (let x = 90; x < W; x += 120) {
    ctx.fillRect(x, 0, 1, H);
  }
  ctx.fillStyle = accent;
  ctx.font = "700 28px 'SF Mono', ui-monospace, Menlo, monospace";
  ctx.fillText("NOBODYNAMED / NAME VITALS", 76, 120);
  ctx.fillStyle = fg;
  ctx.font = "500 162px 'Iowan Old Style', Palatino, Georgia, serif";
  const nameMax = W - 150;
  let nameFont = 162;
  while (ctx.measureText(record.name.toUpperCase()).width > nameMax && nameFont > 78) {
    nameFont -= 8;
    ctx.font = `500 ${nameFont}px 'Iowan Old Style', Palatino, Georgia, serif`;
  }
  ctx.fillText(record.name.toUpperCase(), 76, 285);
  ctx.fillStyle = "rgba(247,239,225,0.7)";
  ctx.font = "400 34px 'Iowan Old Style', Palatino, Georgia, serif";
  ctx.fillText(`${record.sex === "M" ? "Masculine" : "Feminine"} name, first recorded ${a.firstYear}`, 76, 342);
  const label = statusLabel(a.status).toUpperCase();
  const color = statusColor(a.status);
  ctx.font = "700 26px 'SF Mono', ui-monospace, Menlo, monospace";
  const pw = ctx.measureText(label).width + 42;
  ctx.fillStyle = color;
  ctx.beginPath();
  const pillX = 76, pillY = 390, pillH = 52;
  if (ctx.roundRect) ctx.roundRect(pillX, pillY, pw, pillH, 26);
  else ctx.rect(pillX, pillY, pw, pillH);
  ctx.fill();
  ctx.fillStyle = "#fff8ed";
  ctx.fillText(label, pillX + 21, pillY + 35);
  const { series, ym, yM } = record;
  const vals = [];
  for (let y = ym; y <= yM; y++) vals.push(series[y] || 0);
  const maxV = Math.max(1, ...vals);
  const sx = 76, sy = 640, sw = W - 152, sh = 520;
  ctx.strokeStyle = "rgba(247,239,225,0.16)";
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
  ctx.fillStyle = "rgba(217,165,111,0.16)"; ctx.fill();
  let pi = 0;
  for (let i = 0; i < vals.length; i++) if (vals[i] > vals[pi]) pi = i;
  const px = sx + (pi / (vals.length - 1)) * sw;
  const py = sy + sh - (vals[pi] / maxV) * sh;
  ctx.fillStyle = "#f1d18a";
  ctx.beginPath(); ctx.arc(px, py, 11, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = fg;
  ctx.font = "500 50px 'Iowan Old Style', Palatino, Georgia, serif";
  ctx.fillText(`Peak: ${a.peakYear}`, 76, 1275);
  ctx.fillText(`Down ${a.declineFromPeakPct}% from peak`, 76, 1345);
  ctx.fillText(`${record.yM}: ${fmt(a.latest)} recorded births`, 76, 1415);
  ctx.fillStyle = "rgba(247,239,225,0.68)";
  ctx.font = "400 35px 'Iowan Old Style', Palatino, Georgia, serif";
  ctx.fillText(`${generationForYear(a.peakYear)} association / ${fmt(a.total)} total SSA records`, 76, 1500);
  ctx.textAlign = "left";
  ctx.fillStyle = accent;
  ctx.font = "700 28px 'SF Mono', ui-monospace, Menlo, monospace";
  ctx.fillText("nobodynamed.com", 76, H - 90);
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
    btn.addEventListener("click", async () => {
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
        if (canvas) downloadCanvas(canvas, `${record.name.toLowerCase()}-nobodynamed.png`);
      } else if (kind === "twin") {
        await handleTwinButton(btn, record, container);
      }
    });
  });
}

async function handleTwinButton(btn, record, container) {
  const resultEl = container.querySelector("#twin-result") || document.getElementById("twin-result");
  if (!resultEl) return;

  if (resultEl.dataset.loaded === "1") {
    resultEl.style.display = resultEl.style.display === "none" ? "" : "none";
    return;
  }

  btn.textContent = "Finding…";
  btn.disabled = true;
  try {
    const r = await fetch(`/api/twin/${encodeURIComponent(record.name)}?sex=${record.sex}`);
    if (!r.ok) throw new Error("not found");
    const { twins } = await r.json();
    if (!twins || !twins.length) {
      resultEl.innerHTML = "<p class='lede'>No close twins found.</p>";
    } else {
      const items = twins.map(t =>
        `<li><a href="/name/${encodeURIComponent(t.name)}/">${t.name}</a> <span class="similarity">${Math.round(t.similarity * 100)}% match</span></li>`
      ).join("");
      resultEl.innerHTML = `<div class="twin-card">
        <h3>Names with the most similar trajectory to ${record.name}</h3>
        <ul class="twin-list">${items}</ul>
      </div>`;
    }
    resultEl.dataset.loaded = "1";
  } catch(e) {
    resultEl.innerHTML = "<p class='lede'>Couldn't load twins. Try again.</p>";
  } finally {
    btn.textContent = "Find my name's twin →";
    btn.disabled = false;
  }
}

async function hydrateEnrichment(container, record) {
  if (!container || !record?.name) return;
  const host = container.querySelector(".narrative");
  if (!host) return;
  if (host.querySelector("p")) return;
  try {
    const r = await fetch(`/api/enrich/${encodeURIComponent(record.name)}?sex=${record.sex || ""}`);
    if (!r.ok) return;
    const data = await r.json();
    if (!data?.snippet) return;
    const p = document.createElement("p");
    p.className = "lede";
    p.textContent = data.snippet;
    host.appendChild(p);
  } catch (_err) {
    // best-effort progressive enhancement.
  }
}

function diasporaTier(year, originYear) {
  if (year == null) return "never";
  if (year === originYear) return "origin";
  const diff = year - originYear;
  if (diff <= 5) return "early";
  if (diff <= 15) return "mid";
  return "late";
}

// Progressive enhancement over the server-rendered diaspora choropleth: add
// play/scrub controls that animate adoption year-by-year. The static SSR map
// stands on its own if this never runs. Data comes from the embedded record
// (#nv-data), so it works even if the /api/diaspora fetch is unavailable.
function hydrateDiaspora(container, record) {
  const d = record && record.diaspora;
  const root =
    (container && container.querySelector("#diaspora-map")) ||
    document.getElementById("diaspora-map");
  if (!d || !d.origin || !root) return;
  if (root.dataset.hydrated === "1") return;

  const originYear = d.origin.year;
  const adopt = new Map((d.spread || []).map((s) => [s.state, s.year]));
  const maxYear = (d.spread || []).reduce((m, s) => Math.max(m, s.year), originYear);
  const tiles = [...root.querySelectorAll(".dz-tile")];
  if (!tiles.length) return;

  const controls = document.createElement("div");
  controls.className = "diaspora-controls";
  const playBtn = document.createElement("button");
  playBtn.type = "button";
  playBtn.className = "diaspora-play";
  playBtn.textContent = "▶ Play spread";
  const slider = document.createElement("input");
  slider.type = "range";
  slider.className = "diaspora-slider";
  slider.min = String(originYear);
  slider.max = String(maxYear);
  slider.value = String(maxYear);
  slider.setAttribute("aria-label", "State appearance year");
  const label = document.createElement("span");
  label.className = "diaspora-year";
  controls.appendChild(playBtn);
  controls.appendChild(slider);
  controls.appendChild(label);
  const svg = root.querySelector(".diaspora-grid");
  root.insertBefore(controls, svg);
  root.dataset.hydrated = "1";

  const apply = (T, revealing) => {
    for (const g of tiles) {
      const st = g.getAttribute("data-state");
      const yr = adopt.has(st) ? adopt.get(st) : null;
      let cls;
      if (yr == null) cls = "never";
      else if (revealing && yr > T) cls = "pending";
      else cls = diasporaTier(yr, originYear);
      g.setAttribute("class", "dz-tile dz-" + cls);
    }
    label.textContent = revealing ? String(T) : originYear + "–" + maxYear;
  };

  let timer = null;
  let playing = false;
  const stop = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    playing = false;
    playBtn.textContent = "▶ Play spread";
  };
  const play = () => {
    stop();
    if (maxYear <= originYear) {
      apply(maxYear, false);
      return;
    }
    let T = originYear;
    playing = true;
    playBtn.textContent = "❚❚ Pause";
    slider.value = String(T);
    apply(T, true);
    timer = window.setInterval(() => {
      T += 1;
      slider.value = String(T);
      apply(T, true);
      if (T >= maxYear) {
        stop();
        apply(maxYear, false);
      }
    }, 140);
  };

  playBtn.addEventListener("click", () => {
    if (playing) {
      stop();
      apply(maxYear, false);
    } else {
      play();
    }
  });
  slider.addEventListener("input", () => {
    stop();
    apply(Number(slider.value), true);
  });

  apply(maxYear, false);
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
  setupSexSegments,
  rotatePlaceholder,
  analyze,
  buildSparkline,
  renderReport,
  attachShareHandlers,
  hydrateEnrichment,
  hydrateDiaspora,
  titleCase,
  fmt,
};
