// HTML renderer for /shadow/:name/:year — the Counterfactual You page.
//
// Shows a side-by-side "parallel lives" comparison between a name in its
// birth year and its "shadow" — the name that occupied the same popularity
// rank exactly 50 years earlier.

import { buildSparkline } from "./sparkline";
import type { NameWithSeries, ShadowMatch } from "./d1-queries";

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmt(n: number): string {
  return Number(n).toLocaleString("en-US");
}

function generationForYear(year: number): string {
  if (year >= 2013) return "Gen Alpha";
  if (year >= 1997) return "Gen Z";
  if (year >= 1981) return "Millennial";
  if (year >= 1965) return "Gen X";
  if (year >= 1946) return "Boomer";
  if (year >= 1928) return "Silent Generation";
  return "Greatest Generation";
}

function narrative(
  input: NameWithSeries,
  shadow: NameWithSeries,
  match: ShadowMatch,
): string {
  const iName = input.row.name;
  const sName = shadow.row.name;
  const iPeak = input.row.peak_year;
  const sPeak = shadow.row.peak_year;
  const iGen = generationForYear(iPeak);
  const sGen = generationForYear(sPeak);
  const gap = match.birthYear - match.shadowYear;

  if (input.row.status === "extinct" && shadow.row.status === "extinct") {
    return `Both ${iName} and ${sName} have returned to the archive. They peaked a century apart — ${iName} in the ${iGen} world, ${sName} in the ${sGen} era — yet each was, for its moment, exactly as common as the other. Ghosts at the same frequency.`;
  }
  if (input.row.status === "rising" && shadow.row.status === "extinct") {
    return `${iName} is climbing again in the present tense, but ${sName} — its ${gap} shadow — never made it back. The same statistical force that now carries ${iName} forward once carried ${sName} and then abandoned it. Names are not immortal. They are merely borrowed.`;
  }
  if (input.row.status === "extinct" && shadow.row.status === "rising") {
    return `${iName} has disappeared, yet its ${gap} shadow, ${sName}, is rising again. The cultural slot that ${iName} once occupied has been refilled by a name from a different century. The cycle continues.`;
  }
  if (input.row.status === "rising" && shadow.row.status === "rising") {
    return `Two names, two centuries, one trajectory. Both ${iName} and ${sName} are gaining force in their respective eras. They are echoes of the same cultural appetite — proof that naming fashion is less random than it feels.`;
  }
  if (Math.abs(iPeak - sPeak) <= 20) {
    return `${iName} and ${sName} peaked in the same cultural weather — the ${iGen} naming world. They are not replacements; they are siblings separated by ${gap} years, occupying the same statistical address at different addresses in time.`;
  }
  return `In ${match.inputCount.toLocaleString()} ${input.row.sex === "M" ? "boys" : "girls"}, ${iName} found its level. ${gap} years earlier, ${sName} occupied that same address. One peaked in the ${sGen} era; the other in the ${iGen} world. They never met. But the data remembers them both.`;
}

export interface ShadowPageData {
  input: NameWithSeries;
  shadow: NameWithSeries;
  match: ShadowMatch;
  canonical: string;
  origin: string;
}

export function renderShadowPage(data: ShadowPageData): string {
  const { input, shadow, match, canonical, origin } = data;
  const i = input.row;
  const s = shadow.row;
  const title = `${i.name} ↔ ${s.name} — The Counterfactual You | NobodyNamed`;
  const desc = `In ${match.inputCount.toLocaleString()} ${i.sex === "M" ? "boys" : "girls"}, ${i.name} found its level. ${match.shadowYear} years earlier, ${s.name} occupied that same address. Explore their parallel lives.`;
  const ogImage = `${origin}/api/og/default`;
  const iSexLabel = i.sex === "M" ? "boys" : "girls";
  const sSexLabel = s.sex === "M" ? "boys" : "girls";

  const iSeries: Record<number, number> = {};
  for (const p of input.series) iSeries[p.year] = p.count;
  const sSeries: Record<number, number> = {};
  for (const p of shadow.series) sSeries[p.year] = p.count;

  const ym = Math.min(input.series[0]?.year ?? 1880, shadow.series[0]?.year ?? 1880);
  const yM = Math.max(
    input.series[input.series.length - 1]?.year ?? 2024,
    shadow.series[shadow.series.length - 1]?.year ?? 2024,
  );

  const structuredData = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    url: canonical,
    description: desc,
    isPartOf: { "@type": "WebSite", name: "NobodyNamed", url: origin + "/" },
  }).replace(/</g, "\\u003c");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(title)}</title>
<meta name="description" content="${escape(desc)}">
<link rel="canonical" href="${escape(canonical)}">
<meta property="og:title" content="${escape(title)}">
<meta property="og:description" content="${escape(desc)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${escape(canonical)}">
<meta property="og:image" content="${escape(ogImage)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${escape(ogImage)}">
<meta name="theme-color" content="#f7f5f2" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#151412" media="(prefers-color-scheme: dark)">
<link rel="stylesheet" href="/assets/style.css">
<script type="application/ld+json">${structuredData}</script>
<style>
.shadow-grid{display:grid;grid-template-columns:1fr 1fr;gap:2rem;margin:2rem 0}
.shadow-card{padding:1.5rem;border:1px solid var(--border);border-radius:0.5rem;background:var(--surface)}
.shadow-card h2{margin:0 0 0.5rem;font-size:1.75rem}
.shadow-card .year-label{font-size:0.875rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:1rem}
.shadow-card .metric-row{display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid var(--border)}
.shadow-card .metric-row:last-child{border-bottom:none}
.shadow-card .metric-label{color:var(--muted);font-size:0.875rem}
.shadow-card .metric-value{font-weight:600}
.shadow-narrative{font-size:1.125rem;line-height:1.7;margin:2rem 0;padding:1.5rem;border-left:3px solid var(--accent);background:var(--surface)}
.shadow-share{display:flex;gap:0.75rem;margin-top:2rem}
.shadow-share button{padding:0.5rem 1rem;border:1px solid var(--border);background:var(--surface);cursor:pointer;border-radius:0.25rem}
.shadow-share button.primary{background:var(--accent);color:#fff;border-color:var(--accent)}
@media(max-width:640px){.shadow-grid{grid-template-columns:1fr}}
</style>
</head>
<body>
<div class="page">
  <header class="site">
    <a class="brand" href="/" aria-label="NobodyNamed home"><img class="brand-logo" src="/assets/brand/wordmark.svg" alt="nobodynamed"></a>
    <nav>
      <a href="/extinct">Extinct</a>
      <a href="/endangered">Endangered</a>
      <a href="/comeback">Comebacks</a>
      <a href="/year">Birth year</a>
      <a href="/rising">Rising</a>
      <a href="/viz">Visualizations</a>
      <a href="/blog/">Namecalling</a>
      <a href="/about">About</a>
    </nav>
    <details class="mobile-nav">
      <summary aria-label="Open navigation"><span></span><span></span><span></span></summary>
      <nav>
        <a href="/extinct">Extinct</a>
        <a href="/endangered">Endangered</a>
        <a href="/comeback">Comebacks</a>
        <a href="/year">Birth year</a>
        <a href="/rising">Rising</a>
        <a href="/viz">Visualizations</a>
        <a href="/blog/">Namecalling</a>
        <a href="/about">About</a>
      </nav>
    </details>
  </header>

  <main>
    <p class="eyebrow">Counterfactual</p>
    <h1>The Parallel Lives of <em>${escape(i.name)}</em> and <em>${escape(s.name)}</em></h1>
    <p class="lede">In ${fmt(match.inputCount)} ${iSexLabel}, ${escape(i.name)} found its level. ${match.birthYear - match.shadowYear} years earlier, ${escape(s.name)} occupied that same statistical address.</p>

    <div class="shadow-grid">
      <div class="shadow-card">
        <div class="year-label">${input.series[0]?.year ?? "?"}–${input.series[input.series.length - 1]?.year ?? "?"}</div>
        <h2>${escape(i.name)}</h2>
        <div style="margin:1rem 0">${buildSparkline(iSeries, ym, yM)}</div>
        <div class="metric-row">
          <span class="metric-label">Peak year</span>
          <span class="metric-value">${i.peak_year}</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Peak births</span>
          <span class="metric-value">${fmt(i.peak_count)}</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Latest count</span>
          <span class="metric-value">${fmt(i.latest_count)}</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Status</span>
          <span class="metric-value">${i.status.charAt(0).toUpperCase() + i.status.slice(1)}</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Peak generation</span>
          <span class="metric-value">${generationForYear(i.peak_year)}</span>
        </div>
      </div>

      <div class="shadow-card">
        <div class="year-label">${shadow.series[0]?.year ?? "?"}–${shadow.series[shadow.series.length - 1]?.year ?? "?"}</div>
        <h2>${escape(s.name)}</h2>
        <div style="margin:1rem 0">${buildSparkline(sSeries, ym, yM)}</div>
        <div class="metric-row">
          <span class="metric-label">Peak year</span>
          <span class="metric-value">${s.peak_year}</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Peak births</span>
          <span class="metric-value">${fmt(s.peak_count)}</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Latest count</span>
          <span class="metric-value">${fmt(s.latest_count)}</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Status</span>
          <span class="metric-value">${s.status.charAt(0).toUpperCase() + s.status.slice(1)}</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Peak generation</span>
          <span class="metric-value">${generationForYear(s.peak_year)}</span>
        </div>
      </div>
    </div>

    <div class="shadow-narrative">
      ${narrative(input, shadow, match)}
    </div>

    <div class="shadow-share">
      <button class="primary" data-share="copy">Copy link</button>
      <button data-share="twitter">Share on X</button>
      <a href="/name/${encodeURIComponent(i.name)}/"><button>Open ${escape(i.name)} dossier →</button></a>
      <a href="/name/${encodeURIComponent(s.name)}/"><button>Open ${escape(s.name)} dossier →</button></a>
    </div>
  </main>

  <footer class="site">
    <div>
      <div>nobodynamed is a small data project about American first names.</div>
      <div class="footer-note">Data sourced from Social Security Administration birth records (1880–present).</div>
    </div>
    <div><a href="/about">About</a> &middot; <a href="https://www.ssa.gov/oact/babynames/">SSA source</a></div>
  </footer>
</div>
<script>
  document.querySelectorAll('[data-share="copy"]').forEach(function(btn){
    btn.addEventListener('click',function(){
      navigator.clipboard.writeText(location.href).then(function(){btn.textContent='Copied!';setTimeout(function(){btn.textContent='Copy link'},2000)});
    });
  });
  document.querySelectorAll('[data-share="twitter"]').forEach(function(btn){
    btn.addEventListener('click',function(){
      window.open('https://twitter.com/intent/tweet?text='+encodeURIComponent(document.title)+'&url='+encodeURIComponent(location.href),'','width=550,height=420');
    });
  });
</script>
</body>
</html>`;
}
