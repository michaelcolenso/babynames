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

  target.innerHTML = `<table class="table"><thead>${headers}</thead><tbody>${rows.map(row).join("")}</tbody></table>`;
}

// Mini 5-point signal sparkline (y1..y5) with a dashed floor line at
// count=5 — mirror of momentumSpark() in @nv/shared/render-momentum.ts.
const MOMENTUM_FLOOR = 5;
function momentumSpark(row) {
  const w = 120, h = 28;
  const values = [row.y1, row.y2, row.y3, row.y4, row.y5];
  const max = Math.max(MOMENTUM_FLOOR, ...values);
  const yFor = (v) => h - (v / max) * (h - 2) - 1;
  let path = "";
  for (let i = 0; i < values.length; i++) {
    const x = (i / (values.length - 1)) * w;
    path += (i === 0 ? "M" : "L") + x.toFixed(1) + "," + yFor(values[i]).toFixed(1);
  }
  const floorY = yFor(MOMENTUM_FLOOR).toFixed(1);
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="spark momentum-spark">` +
    `<line x1="0" y1="${floorY}" x2="${w}" y2="${floorY}" class="spark-floor"/>` +
    `<path class="line" d="${path}"/>` +
    `</svg>`;
}

// Render the /emerging or /fading momentum table into target.
// direction: "rising" (backs /emerging) | "fading" (backs /fading)
async function renderMomentumTable(direction, target, opts) {
  const routeName = direction === "rising" ? "emerging" : "fading";
  const params = new URLSearchParams();
  if (opts && opts.sex) params.set("sex", opts.sex);
  if (opts && opts.sort) params.set("sort", opts.sort);
  if (opts && opts.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  const r = await fetch(`/api/names/${routeName}${qs ? `?${qs}` : ""}`);
  const { rows } = await r.json();
  const fmt = NameVitals.fmt;

  const headers = direction === "rising"
    ? `<tr><th>Name</th><th class="num">First seen</th><th class="num">Latest</th><th class="num">Momentum</th><th>Signal</th><th></th></tr>`
    : `<tr><th>Name</th><th class="num">Peak year</th><th class="num">Peak</th><th class="num">Est. floor year</th><th>Signal</th><th></th></tr>`;

  const row = (r) => {
    const linkTo = `/name/${encodeURIComponent(r.name)}/`;
    const sexClass = r.sex === "M" ? "momentum-sex-m" : "momentum-sex-f";
    const nameCell = `<td><a href="${linkTo}">${r.name}</a> <span class="meta ${sexClass}">${r.sex}</span></td>`;
    const spark = `<td class="sparkcell">${momentumSpark(r)}</td>`;
    const cta = `<td><a href="${linkTo}">Details →</a></td>`;
    if (direction === "rising") {
      return `<tr>${nameCell}<td class="num">${r.firstYear}</td><td class="num">${fmt(r.y5)}</td><td class="num">${fmt(r.momentum)}</td>${spark}${cta}</tr>`;
    }
    return `<tr>${nameCell}<td class="num">${r.peakYear}</td><td class="num">${fmt(r.peakCount)}</td><td class="num">${r.etaYear ?? "—"}</td>${spark}${cta}</tr>`;
  };

  target.innerHTML = `<table class="table"><thead>${headers}</thead><tbody>${rows.map(row).join("")}</tbody></table>`;
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
window.renderMomentumTable = renderMomentumTable;
window.renderYearTable = renderYearTable;
