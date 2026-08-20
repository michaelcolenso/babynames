// Landing-page sparkline + table renderer.
// Data fetched from /api/landing/:kind (backed by D1).
// Sparklines decoded from the 60-byte BLOB stored in the database.

function miniSpark(spark) {
  const w = 120, h = 28;
  if (!spark || !spark.length) return "";
  const max = Math.max(1, ...spark);
  let path = "";
  for (let i = 0; i < spark.length; i++) {
    const x = (i / Math.max(1, spark.length - 1)) * w;
    const y = h - (spark[i] / max) * (h - 2) - 1;
    path += (i === 0 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1);
  }
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="spark"><path class="line" d="${path}"/></svg>`;
}

async function renderLandingTable(kind, target) {
  const endpoint = kind === "comeback" ? "/api/landing/comeback" : `/api/landing/${kind}`;
  const r = await fetch(endpoint);
  const { yM, rows } = await r.json();
  const fmt = NameVitals.fmt;

  const headers = {
    extinct: `<tr><th>Name</th><th class="num">Peak year</th><th class="num">Peak</th><th class="num">Last year on record</th><th>Trajectory</th><th></th></tr>`,
    endangered: `<tr><th>Name</th><th class="num">Peak year</th><th class="num">Peak</th><th class="num">${yM}</th><th class="num">Decline</th><th>Trajectory</th><th></th></tr>`,
    rising: `<tr><th>Name</th><th class="num">${yM}</th><th class="num">Prev decade</th><th class="num">This decade</th><th class="num">Growth</th><th>Trajectory</th><th></th></tr>`,
    comeback: `<tr><th>Name</th><th class="num">Peaked</th><th class="num">Peak</th><th class="num">${yM}</th><th class="num">Growth</th><th>Trajectory</th><th></th></tr>`,
  }[kind];

  const row = (r) => {
    const linkTo = `/name/${encodeURIComponent(r.name)}/`;
    const spark = `<td class="sparkcell">${miniSpark(r.spark)}</td>`;
    const cta = `<td><a href="${linkTo}">Details →</a></td>`;
    if (kind === "extinct") {
      return `<tr>
        <td><a href="${linkTo}">${r.name}</a> <span class="meta">${r.sex}</span></td>
        <td class="num">${r.peakYear}</td>
        <td class="num">${fmt(r.peakCount)}</td>
        <td class="num">${r.lastYearSeen}</td>
        ${spark}${cta}
      </tr>`;
    }
    if (kind === "endangered") {
      return `<tr>
        <td><a href="${linkTo}">${r.name}</a> <span class="meta">${r.sex}</span></td>
        <td class="num">${r.peakYear}</td>
        <td class="num">${fmt(r.peakCount)}</td>
        <td class="num">${fmt(r.latestCount)}</td>
        <td class="num">−${r.declinePct}%</td>
        ${spark}${cta}
      </tr>`;
    }
    if (kind === "comeback") {
      return `<tr>
        <td><a href="${linkTo}">${r.name}</a> <span class="meta">${r.sex}</span></td>
        <td class="num">${r.peakYear}</td>
        <td class="num">${fmt(r.peakCount)}</td>
        <td class="num">${fmt(r.latestCount)}</td>
        <td class="num">${r.growthX ? r.growthX + "×" : "—"}</td>
        ${spark}${cta}
      </tr>`;
    }
    return `<tr>
      <td><a href="${linkTo}">${r.name}</a> <span class="meta">${r.sex}</span></td>
      <td class="num">${fmt(r.latestCount)}</td>
      <td class="num">${fmt(r.prevDecadeTotal)}</td>
      <td class="num">${fmt(r.currDecadeTotal)}</td>
      <td class="num">${r.growthX ? r.growthX + "×" : "—"}</td>
      ${spark}${cta}
    </tr>`;
  };

  // Matches contentIdentityMeta({contentId: contentId("article", kind), ...})
  // in packages/shared/src/render-landing.ts — this client re-render must
  // carry the same identity the server-rendered table shipped with, or the
  // page silently drops out of analytics the moment this fetch resolves.
  target.innerHTML = `<table class="table" data-content-id="article:${kind}" data-content-type="article" data-content-slug="${kind}"><thead>${headers}</thead><tbody>${rows.map(row).join("")}</tbody></table>`;
}

// /emerging & /fading — card grid + composite chart. Data fetched once
// (momentum-sorted, up to 500 rows) from /api/names/:routeName; search/sex/
// sort controls then filter and re-sort that same in-memory set, so only
// the initial load hits the network. Mirrors
// @nv/shared/render-momentum.ts so the SSR grid (first paint, crawlable)
// and this client re-render (adds interactivity) are visually identical.
const MOMENTUM_FLOOR = 5;
const MOMENTUM_CRITICAL_THRESHOLD = 10;

function momentumSpark(row, gradId) {
  const w = 196, h = 44, pad = 4;
  const values = [row.y1, row.y2, row.y3, row.y4, row.y5];
  const max = Math.max(MOMENTUM_FLOOR, ...values, 8);
  const innerW = w - pad * 2, innerH = h - pad * 2;
  const points = values.map((v, i) => [
    pad + (i / (values.length - 1)) * innerW,
    pad + innerH - (v / max) * innerH,
  ]);
  const floorY = pad + innerH - (MOMENTUM_FLOOR / max) * innerH;
  const path = points.map(([x, y], i) => (i === 0 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1)).join("");
  const [lastX, lastY] = points[points.length - 1];
  const color = row.sex === "M" ? "var(--amber)" : "var(--emerald)";
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="spark momentum-spark">
    <defs><linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="1"/>
    </linearGradient></defs>
    <line x1="${pad}" y1="${floorY.toFixed(1)}" x2="${w - pad}" y2="${floorY.toFixed(1)}" class="spark-floor"/>
    <path class="line" d="${path}" stroke="url(#${gradId})"/>
    <circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="2.6" fill="${color}"/>
  </svg>`;
}

function momentumCardHTML(direction, r, gradId) {
  const fmt = NameVitals.fmt;
  const linkTo = `/name/${encodeURIComponent(r.name)}/`;
  const sexClass = r.sex === "M" ? "momentum-sex-m" : "momentum-sex-f";
  const sexLabel = r.sex === "M" ? "Boy" : "Girl";
  const critical = r.y5 < MOMENTUM_CRITICAL_THRESHOLD ? " momentum-critical" : "";
  const meta = direction === "rising"
    ? `<span>${r.firstYear} → ${fmt(r.y5)}</span><span class="momentum-secondary">momentum ${fmt(r.momentum)}</span>`
    : `<span>peak ${r.peakYear}</span><span class="momentum-secondary">${fmt(r.peakCount)} → ${fmt(r.y5)}</span>`;
  const etaLabel = direction === "fading" && r.etaYear
    ? `<div class="momentum-card-eta">↓ ${r.etaYear <= r.peakYear ? "already at the floor" : `est. below floor by ${r.etaYear}`}</div>`
    : "";
  return `<article class="momentum-card${critical}" data-sex="${r.sex}">
    <div class="momentum-card-top">
      <a href="${linkTo}" class="momentum-card-name">${r.name}</a>
      <span class="momentum-sex-badge ${sexClass}">${sexLabel}</span>
    </div>
    <div class="momentum-card-spark">${momentumSpark(r, gradId)}</div>
    <div class="momentum-card-meta">${meta}</div>
    ${etaLabel}
  </article>`;
}

// Composite "signature" chart — top 18 by momentum, full 5-year trace per
// name. Decorative/exploratory, so (unlike the card grid) this is client-
// rendered only, consistent with how the rest of the site's /viz/* charts
// work; the crawlable content lives entirely in the SSR card grid.
function drawMomentumScope(rows, svg) {
  const W = 1120, H = 220, padL = 34, padR = 16, padT = 16, padB = 26;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const top = [...rows].sort((a, b) => Math.abs(b.momentum) - Math.abs(a.momentum)).slice(0, 18);
  if (top.length === 0) { svg.innerHTML = ""; return; }
  const maxVal = Math.max(...top.flatMap((d) => [d.y1, d.y2, d.y3, d.y4, d.y5]), 10);
  const yFor = (v) => padT + innerH - (v / maxVal) * innerH;
  const xFor = (i) => padL + (i / 4) * innerW;

  let s = "";
  const ticks = [...new Set([0, 5, 10, Math.ceil(maxVal / 25) * 25])];
  ticks.forEach((t) => {
    const y = yFor(t);
    s += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="rgba(var(--ink-rgb),0.06)" stroke-width="1"/>`;
    s += `<text x="${padL - 8}" y="${y + 3}" text-anchor="end" font-family="var(--mono)" font-size="10" fill="var(--muted)">${t}</text>`;
  });
  const floorY = yFor(MOMENTUM_FLOOR);
  s += `<line x1="${padL}" y1="${floorY}" x2="${W - padR}" y2="${floorY}" stroke="var(--amber)" stroke-opacity="0.35" stroke-width="1.4" stroke-dasharray="4,4"/>`;

  const firstYear = top[0].windowStart;
  for (let i = 0; i < 5; i++) {
    s += `<text x="${xFor(i)}" y="${H - 6}" text-anchor="middle" font-family="var(--mono)" font-size="10" fill="var(--muted)">${firstYear + i}</text>`;
  }

  top.forEach((d) => {
    const color = d.sex === "M" ? "var(--amber)" : "var(--emerald)";
    const years = [d.y1, d.y2, d.y3, d.y4, d.y5];
    const pts = years.map((v, i) => `${xFor(i).toFixed(1)},${yFor(v).toFixed(1)}`).join(" L");
    s += `<path d="M${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.75"/>`;
    s += `<circle cx="${xFor(4)}" cy="${yFor(d.y5).toFixed(1)}" r="2.4" fill="${color}"/>`;
  });

  svg.innerHTML = s;
}

// Render the /emerging or /fading page into target, wiring up any of the
// optional controls (#momentumSearch, #momentumSex, #momentumSort,
// #momentumCount, #momentumScope, #momentumStatTotal, #momentumStatCritical)
// found on the page. direction: "rising" (backs /emerging) | "fading".
async function renderMomentumGrid(direction, target) {
  const routeName = direction === "rising" ? "emerging" : "fading";
  const r = await fetch(`/api/names/${routeName}?limit=500&sort=momentum`);
  const { rows } = await r.json();

  const scopeSvg = document.getElementById("momentumScope");
  const searchInput = document.getElementById("momentumSearch");
  const sexSeg = document.getElementById("momentumSex");
  const sortSelect = document.getElementById("momentumSort");
  const countReadout = document.getElementById("momentumCount");
  const statTotal = document.getElementById("momentumStatTotal");
  const statCritical = document.getElementById("momentumStatCritical");

  if (statTotal) statTotal.textContent = rows.length;
  if (statCritical) statCritical.textContent = rows.filter((d) => d.y5 < MOMENTUM_CRITICAL_THRESHOLD).length;
  if (scopeSvg) drawMomentumScope(rows, scopeSvg);

  const state = { sex: "ALL", query: "", sort: "momentum" };

  function render() {
    let filtered = rows.filter((d) => {
      if (state.sex !== "ALL" && d.sex !== state.sex) return false;
      if (state.query && !d.name.toLowerCase().includes(state.query)) return false;
      return true;
    });
    switch (state.sort) {
      case "total": filtered.sort((a, b) => b.totalCount - a.totalCount); break;
      case "eta": filtered.sort((a, b) => (a.etaYear ?? 9999) - (b.etaYear ?? 9999) || a.y5 - b.y5); break;
      case "az": filtered.sort((a, b) => a.name.localeCompare(b.name)); break;
      default: filtered.sort((a, b) => Math.abs(b.momentum) - Math.abs(a.momentum));
    }
    if (countReadout) countReadout.innerHTML = `<b>${filtered.length}</b> of ${rows.length} signals`;
    // Matches contentIdentityMeta({contentId: contentId("article", routeName), ...})
    // in packages/shared/src/render-momentum.ts — this client re-render
    // replaces #t's whole subtree, including the server-rendered identity
    // wrapper, so it has to carry the same tag or the page drops out of
    // analytics the moment this fetch resolves.
    const identityAttrs = `data-content-id="article:${routeName}" data-content-type="article" data-content-slug="${routeName}"`;
    if (filtered.length === 0) {
      target.innerHTML = `<div class="momentum-grid" ${identityAttrs}><div class="momentum-empty">no signals match — try clearing filters</div></div>`;
      return;
    }
    target.innerHTML = `<div class="momentum-grid" ${identityAttrs}>${filtered.map((d, i) => momentumCardHTML(direction, d, `mgrad-${routeName}-${i}`)).join("")}</div>`;
  }

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      state.query = e.target.value.trim().toLowerCase();
      render();
    });
  }
  if (sexSeg) {
    sexSeg.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      sexSeg.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.sex = btn.dataset.sex;
      render();
    });
  }
  if (sortSelect) {
    sortSelect.addEventListener("change", (e) => {
      state.sort = e.target.value;
      render();
    });
  }

  render();
}

// Render the year-of-birth top-names table into target.
function renderYearTable(year, rows, target) {
  const fmt = NameVitals.fmt;
  const girls = rows.filter(r => r.sex === "F").slice(0, 25);
  const boys  = rows.filter(r => r.sex === "M").slice(0, 25);
  const classroom = [...girls.slice(0, 2), ...boys.slice(0, 2)].map(r => r.name);
  const era = year >= 1997 ? "Gen Z" :
    year >= 1981 ? "millennial" :
    year >= 1965 ? "Gen X" :
    year >= 1946 ? "boomer" :
    year >= 1928 ? "Silent Generation" : "early modern";

  const nameList = (list) => list.map(r =>
    `<li>
      <span class="rank">#${r.rank}</span>
      <a href="/name/${encodeURIComponent(r.name)}/">${r.name}</a>
      <span class="count">${fmt(r.count)}</span>
    </li>`
  ).join("");

  target.innerHTML = `
    <h2 style="margin-top:1.5rem">If you were born in ${year}</h2>
    <p class="year-story">Your ${era} classroom probably included ${classroom.map(n => `<a href="/name/${encodeURIComponent(n)}/">${n}</a>`).join(", ")}. Some became durable classics; others now read like timestamps.</p>
    <div class="year-result-grid">
      <div class="year-col">
        <h3>Girls</h3>
        <ul class="year-name-list">${nameList(girls)}</ul>
      </div>
      <div class="year-col">
        <h3>Boys</h3>
        <ul class="year-name-list">${nameList(boys)}</ul>
      </div>
    </div>`;
}

window.renderLandingTable = renderLandingTable;
window.renderMomentumGrid = renderMomentumGrid;
window.renderYearTable = renderYearTable;
