// HTML renderer for /name/:name. Used by:
//   - apps/web SSR Function (full page, edge-cached)
//   - client app.js (re-renders into #view-name on the index page, after
//     hydrating from the embedded <script type="application/json">)

import { classify, type ClassifyResult } from "./classify";
import { contentId, contentIdentityMeta } from "./content-identity";
import type { YearTopRow, YearTotal } from "./d1-queries";
import { generateNameNarrative, type NameNarrative } from "./generate-narrative";
import { playgroundDensity } from "./enrichment-compute";
import { pageShell } from "./render-shell";
import { buildSparkline } from "./sparkline";
import { ALL_STATES, stateName, TILE_COLS, TILE_ROWS, US_TILE_GRID } from "./us-states-map";
import { getCollection } from "./collections";
import type {
  CollectionMembership,
  DiasporaResponse,
  DiasporaSpreadPoint,
  NameCatalyst,
  NameDiscoveryCard,
  NameDiscoveryClusterKind,
  NameDiscoveryModule,
  NameEnrichmentBundle,
  NameEnrichmentProfile,
  NameHistoricalProfile,
  NameRecord,
  NameFacts,
  NameRegionalAnomaly,
  RelatedName,
  VariantSibling,
  Status,
  WaveTopology,
} from "./schema";

const fmt = (n: number | null | undefined): string =>
  n === null || n === undefined ? "—" : Number(n).toLocaleString("en-US");

// A name flagged "endangered" by classify.ts (down 90%+ from peak) but still
// generating this many births per year is more honestly described as "Past
// peak" — see displayStatus() below for the full rationale.
const STILL_COMMON_THRESHOLD = 5000;

function generationForYear(year: number): string {
  if (year >= 2013) return "Gen Alpha";
  if (year >= 1997) return "Gen Z";
  if (year >= 1981) return "Millennial";
  if (year >= 1965) return "Gen X";
  if (year >= 1946) return "Boomer";
  if (year >= 1928) return "Silent Generation";
  return "Greatest Generation";
}

function describeStatus(
  record: NameRecord,
  a: ClassifyResult,
): {
  status: string;
  trajectory: string;
  vitality: string;
  summary: string;
  rarity: string;
  stability: string;
} {
  const decline = a.declinePct ?? 0;
  const name = escape(record.name);
  const peakEra = generationForYear(a.peakYear);
  const current = a.latestCount;
  const vitality =
    a.status === "extinct"
      ? "Dormant"
      : current >= 5000
        ? "Strong"
        : current >= 1000
          ? "Healthy"
          : current >= 100
            ? "Fragile"
            : current > 0
              ? "Rare"
              : "Below reporting floor";
  const rarity =
    current === 0
      ? "Statistical floor"
      : current < 50
        ? "99th percentile rare"
        : current < 250
          ? "Very uncommon"
          : current < 1000
            ? "Uncommon"
            : current < 5000
              ? "Mainstream"
              : "Mass culture";
  const stability =
    decline < 35
      ? "High cross-era durability"
      : decline < 70
        ? "Moderate cultural durability"
        : decline < 90
          ? "Era-bound, still legible"
          : "Highly era-bound";

  if (a.status === "extinct") {
    return {
      status: "Extinct",
      trajectory: "Near statistical disappearance",
      vitality,
      rarity,
      stability,
      summary: `${name} has moved from ordinary use into the archive. Its peak belongs most strongly to the ${peakEra} naming world, and its absence today gives the name the strange clarity of a cultural fossil.`,
    };
  }
  if (a.status === "endangered") {
    const stillCommon = current >= STILL_COMMON_THRESHOLD;
    return {
      status: stillCommon ? "Past peak" : "Endangered",
      trajectory: `Down ${decline}% from peak`,
      vitality,
      rarity,
      stability,
      summary: stillCommon
        ? `${name} once had enough force to define a generation, and it is well off that peak now — yet it remains a mass-culture name. Past peak, but very much still in the room.`
        : `${name} once had enough force to mark a generation, but its current usage is a small remnant of that peak. The name still exists, yet now reads as a timestamp: personal, recognizable, and culturally receding.`,
    };
  }
  if (a.status === "rising") {
    return {
      status: a.peakYear < record.yM - 25 && decline > 45 ? "Resurgent" : "Rising",
      trajectory: "Gaining cultural share",
      vitality,
      rarity,
      stability,
      summary: `${name} is accumulating new signal in the present tense. Whether it is a revival or a fresh adoption curve, the name is moving from background noise toward cultural visibility again.`,
    };
  }
  if (a.status === "declining") {
    return {
      status: "Stable Decline",
      trajectory: `Gradual decline from ${a.peakYear}`,
      vitality,
      rarity,
      stability,
      summary: `${name} is past its period of maximum cultural dominance, but it has not disappeared. Unlike names that burn out quickly, it still carries enough usage to remain cross-generational rather than purely nostalgic.`,
    };
  }
  return {
    status: "Stable",
    trajectory: "Cross-generational persistence",
    vitality,
    rarity,
    stability,
    summary: `${name} has avoided the sharper boom-and-bust cycles of fashion naming. Its strength is not novelty but endurance: steady recognition across eras, families, and classrooms.`,
  };
}

interface RenderReportOptions {
  relatedNames?: RelatedName[];
  // Precomputed rare-name story metrics (name_facts). Drives the story strip
  // above the fold. Absent → the strip is omitted and the page renders as
  // before, so the renderer can ship ahead of the data.
  facts?: NameFacts | null;
  // Other spellings in the same family. Only fetched when facts.variant_count > 1.
  variants?: VariantSibling[];
  // Editorial collections this name belongs to, ordered by its rank in each.
  collections?: CollectionMembership[];
  discovery?: NameDiscoveryModule;
  peerNames?: YearTopRow[];
  yearTotals?: YearTotal[];
  enrichmentSnippet?: string;
  // Precomputed dossier layers (actuarial, wave, catalysts, regional,
  // historical). Rendered as an additive sidebar panel; independent of
  // enrichmentSnippet, which still drives the narrative opening paragraph.
  enrichment?: NameEnrichmentBundle;
  // Precomputed geographic diffusion. When present, renders the diaspora map
  // in the main column below the trajectory chart. Absent → omitted entirely.
  diaspora?: DiasporaResponse;
  // Present-day over-representation for the "Where it lives now" map shown on
  // legacy (pre-1910) names. Must contain only the dataset's latest era.
  strongholds?: NameRegionalAnomaly[];
  // Amazon Associates tracking ID. When unset or empty, the affiliate
  // link is omitted entirely rather than emitted with an empty `tag=`
  // (which earns no commission and looks unfinished).
  affiliateTag?: string;
  // Pre-computed ClassifyResult to avoid a second classify() call when the
  // caller (renderFullPage) has already computed it.
  classifyResult?: ClassifyResult;
  // Pre-computed narrative to avoid a second generateNameNarrative() call.
  narrative?: NameNarrative;
}

export function renderReport(record: NameRecord): string {
  return renderReportWithOptions(record);
}

function renderReportWithOptions(record: NameRecord, opts: RenderReportOptions = {}): string {
  const a = opts.classifyResult ?? classify({ series: record.series, yM: record.yM });
  if (!a) {
    return `<div class="report"><h1>${escape(record.name)}</h1><p class="lede">No data for this name.</p></div>`;
  }
  const sexLabel = record.sex === "M" ? "boys" : "girls";
  const dossier = describeStatus(record, a);
  const openingParagraph = opts.enrichmentSnippet?.trim() || dossier.summary;
  const topAnomalyRaw = opts.enrichment?.regionalAnomalies?.[0];
  const resolvedAnomaly = topAnomalyRaw
    ? { state: stateName(topAnomalyRaw.state), lq: topAnomalyRaw.location_quotient }
    : undefined;
  const narrative = opts.narrative ?? generateNameNarrative(record, a, resolvedAnomaly);

  const peakSentence = `${escape(record.name)} peaked in ${a.peakYear}, when <strong>${fmt(a.peakCount)}</strong> ${sexLabel} were given the name.`;
  const latestSentence = a.latestCount
    ? `In ${record.yM}, only <strong>${fmt(a.latestCount)}</strong> ${sexLabel} were given the name.`
    : `No ${sexLabel} were recorded with this name in ${record.yM} — at least not five of them (the SSA's reporting floor).`;

  const storyStrip = renderStoryStrip(
    record,
    a,
    opts.facts,
    opts.variants ?? [],
    opts.collections ?? [],
    sexLabel,
  );
  const narrativeExtras = renderNarrativeInsights(record, a, opts, sexLabel);
  const nameAnswers = renderNameAnswers(record.name, narrative);
  const declineSentence =
    a.status === "rising" || (a.declinePct ?? 0) <= 5
      ? ""
      : `<p>Down <strong>${a.declinePct ?? 0}%</strong> from its peak.</p>`;
  const totalSentence = `<p>In all, the Social Security Administration has recorded about <strong>${fmt(a.totalCount)}</strong> Americans named ${escape(record.name)} since ${a.firstYear}.</p>`;
  const exploreLinks = renderExploreLinks(record, a, opts.facts, opts.collections ?? []);
  const geographySection = renderGeography(record, a, opts);
  const relatedNames = renderRelatedNames(opts.relatedNames ?? []);
  const discoveryModule = renderDiscoveryModule(opts.discovery);

  const showCollision =
    (a.status === "declining" || a.status === "endangered" || a.status === "extinct") && a.peakCount >= 500;
  const collisionBox = showCollision
    ? `<div class="collision-box">
    <div class="collision-row"><span class="collision-year">${a.peakYear}</span><strong>${fmt(a.peakCount)}</strong> ${sexLabel} named ${escape(record.name)}</div>
    <div class="collision-row collision-now"><span class="collision-year">${record.yM}</span><strong>${a.latestCount === 0 ? "0 (extinct)" : fmt(a.latestCount)}</strong> ${sexLabel} named ${escape(record.name)}</div>
  </div>`
    : "";

  const identityMeta = contentIdentityMeta({
    contentId: contentId("name-page", record.name),
    contentType: "name-page",
    slug: record.name,
    primaryNames: [record.name],
  });

  return `<article class="report" data-name="${escape(record.name)}" data-sex="${record.sex}" ${identityMeta}>
  <div>
    <header class="dossier-head">
      <div class="sex">${record.sex === "M" ? "Masculine" : "Feminine"} dossier · first seen ${a.firstYear}</div>
      <h1>${escape(record.name)}</h1>
      <div class="status-stack">
        <div class="status-line">
          <span class="status-pill status-${a.status}">${dossier.status}</span>
          <span class="trajectory-label">${dossier.trajectory}</span>
        </div>
      </div>
      <div class="dossier-grid">
        <div class="dossier-metric"><div class="label">Peak era</div><div class="value">${a.peakYear}</div></div>
        <div class="dossier-metric"><div class="label">Peak births</div><div class="value">${fmt(a.peakCount)}</div></div>
        ${storyStrip ? "" : `<div class="dossier-metric"><div class="label">Current vitality</div><div class="value">${dossier.vitality}</div></div>
        <div class="dossier-metric"><div class="label">Peak generation</div><div class="value">${generationForYear(a.peakYear)}</div></div>`}
      </div>
    </header>

    ${storyStrip}

    ${nameAnswers}

    <section class="chart-panel" aria-label="${escape(record.name)} annual popularity chart">
      <div class="chart-caption"><span>${a.firstYear}</span><span>Peak ${a.peakYear}</span><span>${record.yM}</span></div>
      ${buildSparkline(record.series, record.ym, record.yM, {
        status: a.status,
        markers: (opts.enrichment?.catalysts ?? []).map((c) => ({
          year: c.trigger_year,
          label: c.catalyst_title,
          kind: c.catalyst_type,
        })),
      })}
    </section>

    <div class="stats">
      <div class="stat"><div class="label">Peak year</div><div class="value">${a.peakYear}</div></div>
      <div class="stat"><div class="label">Decline from peak</div><div class="value">${a.declinePct ?? 0}%</div></div>
      <div class="stat"><div class="label">${record.yM}</div><div class="value">${fmt(a.latestCount)}</div></div>
      <div class="stat"><div class="label">All-time</div><div class="value">${fmt(a.totalCount)}</div></div>
    </div>
    ${geographySection}
    ${exploreLinks}
  </div>

  <aside class="report-sidebar">
    <div class="narrative">
      <p>${escape(openingParagraph)}</p>
      <p>${peakSentence}</p>
      <p>${latestSentence}</p>
      ${declineSentence}
      ${totalSentence}
    </div>
    <div class="insight-panel">
      <div class="insight-row"><span>Rarity score</span><strong>${dossier.rarity}</strong></div>
      <div class="insight-row"><span>Peak generation</span><strong>${generationForYear(a.peakYear)}</strong></div>
      <div class="insight-row"><span>Stability</span><strong>${dossier.stability}</strong></div>
      <div class="insight-row"><span>Trajectory</span><strong>${dossier.trajectory}</strong></div>
    </div>
    ${collisionBox}
    ${renderEnrichmentPanel(record, opts.enrichment)}
    ${relatedNames}
    ${discoveryModule}
    <div class="share-row">
      <button class="primary" data-share="card">Download share card</button>
      <button data-share="twitter">Share</button>
      <button data-share="copy">Copy link</button>
      <button data-share="compare">Compare</button>
      <button data-share="twin">Find similar names</button>
    </div>
    <div class="compare-controls" id="compare-controls" style="display:none;">
      <div class="compare-controls-header">
        <strong>Compare ${escape(record.name)} with…</strong>
        <button class="compare-close" data-share="compare-close" aria-label="Close comparison panel">×</button>
      </div>
      <div class="compare-input-row">
        <input type="text" class="compare-input" placeholder="Type a name" maxlength="40" autocomplete="off">
        <button class="compare-add" type="button">Add</button>
      </div>
      <div class="compare-suggestions" role="listbox" style="display:none;"></div>
      <div class="compare-pills"></div>
      <div class="compare-actions">
        <button class="compare-go primary" type="button" disabled>Compare names</button>
        <span class="compare-limit">Add up to 2 more names</span>
      </div>
    </div>
    <div id="twin-result"></div>
    ${opts.affiliateTag
      ? `<div class="affiliate">
      Curious about the history of ${escape(record.name)}? Browse
      <a rel="nofollow sponsored" target="_blank" href="https://www.amazon.com/s?k=${encodeURIComponent("history of the name " + record.name)}&amp;tag=${encodeURIComponent(opts.affiliateTag)}">books about the name ${escape(record.name)} on Amazon</a>.
    </div>`
      : ""}
  </aside>
</article>`;
}

export function renderFullPage(
  record: NameRecord,
  classifyResult: ClassifyResult,
  opts: {
    canonical: string;
    siteName?: string;
    relatedNames?: RelatedName[];
    facts?: NameFacts | null;
    variants?: VariantSibling[];
    collections?: CollectionMembership[];
    discovery?: NameDiscoveryModule;
    peerNames?: YearTopRow[];
    yearTotals?: YearTotal[];
    enrichmentSnippet?: string;
    enrichment?: NameEnrichmentBundle;
    diaspora?: DiasporaResponse;
    strongholds?: NameRegionalAnomaly[];
    affiliateTag?: string;
  } = { canonical: "" },
): string {
  const topAnomalyRaw = opts.enrichment?.regionalAnomalies?.[0];
  const resolvedAnomaly = topAnomalyRaw
    ? { state: stateName(topAnomalyRaw.state), lq: topAnomalyRaw.location_quotient }
    : undefined;
  const narrative = augmentNarrativeWithFacts(
    generateNameNarrative(record, classifyResult, resolvedAnomaly),
    record,
    classifyResult,
    opts.facts,
  );
  const desc = narrative.metaDescription;
  const title = narrative.metaTitle;
  const statusLabel = displayStatus(classifyResult, record.yM);
  const origin = opts.canonical ? new URL(opts.canonical).origin : "";
  const ogImageUrl = `${origin}/api/og/${encodeURIComponent(record.name)}`;
  const dataJson = JSON.stringify({
    name: record.name,
    sex: record.sex,
    ym: record.ym,
    yM: record.yM,
    series: record.series,
    other: record.other,
    diaspora: opts.diaspora,
  });

  // FAQPage schema mirrors the visible "Quick answers" Q&A (renderNameAnswers),
  // so the unique-data answers — living population, median age, rarity — are
  // machine-readable for search and AI overviews, not just rendered as prose.
  const baseStructuredData = buildStructuredData(record, classifyResult, {
    canonical: opts.canonical,
    title,
    description: desc,
    origin,
    facts: opts.facts,
  });
  const faqStructuredData = buildFaqStructuredData(record.name, narrative);
  const structuredData = faqStructuredData
    ? [...baseStructuredData, faqStructuredData]
    : baseStructuredData;

  return pageShell({
    title,
    description: desc,
    canonical: opts.canonical,
    ogImage: ogImageUrl,
    ogImageAlt: `${record.name} — ${statusLabel}, peak ${classifyResult.peakYear}`,
    ogType: "article",
    currentPath: undefined,
    body: `<div id="view-name">${renderReportWithOptions(record, {
      relatedNames: opts.relatedNames,
      facts: opts.facts,
      variants: opts.variants,
      collections: opts.collections,
      discovery: opts.discovery,
      peerNames: opts.peerNames,
      yearTotals: opts.yearTotals,
      enrichmentSnippet: opts.enrichmentSnippet,
      enrichment: opts.enrichment,
      diaspora: opts.diaspora,
      strongholds: opts.strongholds,
      affiliateTag: opts.affiliateTag,
      classifyResult,
      narrative,
    })}</div>`,
    structuredData,
    scripts: ["/assets/app.js"],
    jsonDataBlocks: [{ id: "nv-data", data: JSON.parse(dataJson) }],
    inlineScripts: [
      `(function () {
    var el = document.getElementById("nv-data");
    if (!el || !window.NameVitals) return;
    var record = JSON.parse(el.textContent);
    var container = document.getElementById("view-name");
    NameVitals.attachShareHandlers(container, record);
    if (NameVitals.attachSparklineTooltip) NameVitals.attachSparklineTooltip(container, record);
    if (NameVitals.initCompareControls) NameVitals.initCompareControls(container, record);
    NameVitals.hydrateEnrichment(container, record);
    if (NameVitals.hydrateDiaspora) NameVitals.hydrateDiaspora(container, record);
  })();`,
    ],
    footerVariant: "full",
  });
}

// A name whose living cohort skews this old reads partly as historical
// inheritance rather than current fashion — triggers the legacy treatment.
const LEGACY_MEDIAN_AGE = 72;

// SSA state-level data begins in 1910. Names already national by then have no
// observable geographic origin, so the /name page shows their present-day
// "strongholds" (over-representation today) instead of a diaspora origin story.
// Mirrors STATE_DATA_START_YEAR in the ingest worker's diaspora-compute.
const STATE_DATA_FIRST_YEAR = 1910;


const WAVE_COPY: Record<WaveTopology, string> = {
  "Flash Flood": "A concentrated generational spike rather than a slow classic.",
  Glacier: "A long-duration classic distributed across many generations.",
  "Steady Decline": "A name with a broad middle and a downward recent trajectory.",
  "Steady Wave": "A name with sustained momentum rather than a single spike.",
  Plateau: "A name with moderate spread and no sharp recent move.",
};



// Diffusion tier for a state, by years elapsed since the origin year.
// Mirrored in app.js hydrateDiaspora() for the animated time-lapse.
function diasporaTier(
  adoptedYear: number | undefined,
  originYear: number | null,
): "origin" | "early" | "mid" | "late" | "never" {
  if (adoptedYear === undefined || originYear === null) return "never";
  if (adoptedYear === originYear) return "origin";
  const diff = adoptedYear - originYear;
  if (diff <= 5) return "early";
  if (diff <= 15) return "mid";
  return "late";
}

function originStateNames(d: DiasporaResponse): string[] {
  if (!d.origin) return [];
  const originYear = d.origin.year;
  const states = d.spread
    .filter((p) => p.year === originYear)
    .map((p) => p.state)
    .sort((a, b) => stateName(a).localeCompare(stateName(b)));
  return states.length ? states.map(stateName) : [stateName(d.origin.state)];
}

function formatStateList(states: string[]): string {
  const escaped = states.map(escape);
  if (escaped.length <= 1) return escaped[0] ?? "";
  if (escaped.length === 2) return `${escaped[0]} and ${escaped[1]}`;
  return `${escaped.slice(0, -1).join(", ")}, and ${escaped[escaped.length - 1]}`;
}

function diasporaNarrative(d: DiasporaResponse, name: string): string {
  const safe = escape(name);
  if (!d.origin) {
    return `${safe} never concentrated in any one state — it stayed evenly spread.`;
  }
  const origin = formatStateList(originStateNames(d));
  if (d.totalStates <= 1) {
    return `${safe} only ever broke out in ${origin}. A true local.`;
  }
  if (d.diffusionYears < 10) {
    return `${safe} spread fast — broke out in ${origin} (${d.origin.year}) and ran high in ${d.totalStates} states within a decade.`;
  }
  if (d.diffusionYears > 50) {
    return `${safe} took ${d.diffusionYears} years to reach ${d.totalStates} states. A slow burn from ${origin} outward.`;
  }
  return `${safe} broke out in ${origin} (${d.origin.year}) and became over-represented in ${d.totalStates} states over ${d.diffusionYears} years.`;
}

// Server-rendered choropleth on a geographic tile grid. Static here (final,
// fully-revealed state); app.js progressively upgrades it into a year-by-year
// time-lapse using the same data embedded in #nv-data.
function renderDiasporaMap(record: NameRecord, d?: DiasporaResponse): string {
  if (!d) return "";

  const adopted = new Map<string, DiasporaSpreadPoint>();
  for (const p of d.spread) adopted.set(p.state, p);
  const originYear = d.origin?.year ?? null;
  const origins = d.origin ? originStateNames(d) : [];
  const originLabel = formatStateList(origins);

  const CELL = 42;
  const w = TILE_COLS * CELL;
  const h = TILE_ROWS * CELL;

  const tiles = ALL_STATES.map((st) => {
    const pos = US_TILE_GRID[st];
    if (!pos) return "";
    const [rowIdx, colIdx] = pos;
    const x = colIdx * CELL;
    const y = rowIdx * CELL;
    const point = adopted.get(st);
    const tier = diasporaTier(point?.year, originYear);
    const adoptedYear = point?.year;
    const titleYear =
      tier === "never" ? "never over-represented" : `broke out ${adoptedYear}`;
    const yearAttr = adoptedYear !== undefined ? ` data-year="${adoptedYear}"` : "";
    return `<g class="dz-tile dz-${tier}" data-state="${st}"${yearAttr}>
      <title>${escape(stateName(st))}: ${titleYear}</title>
      <rect x="${x + 2}" y="${y + 2}" width="${CELL - 4}" height="${CELL - 4}" rx="4"/>
      <text x="${x + CELL / 2}" y="${y + CELL / 2 + 4}" text-anchor="middle">${st}</text>
    </g>`;
  }).join("");

  const subtitle = d.origin
    ? `Broke out: <strong>${originLabel}, ${d.origin.year}</strong> · over-represented in ${d.totalStates} ${d.totalStates === 1 ? "state" : "states"} over ${d.diffusionYears} ${d.diffusionYears === 1 ? "year" : "years"}`
    : `This name never concentrated in any one state.`;

  const legend = `<div class="diaspora-legend" aria-hidden="true">
    <span class="dz-origin">Origin</span>
    <span class="dz-early">≤5 yrs</span>
    <span class="dz-mid">≤15 yrs</span>
    <span class="dz-late">16+ yrs</span>
    <span class="dz-never">Holdout</span>
  </div>`;

  return `<section class="diaspora-map" id="diaspora-map" aria-label="${escape(record.name)} geographic spread across the United States">
    <div class="section-label">Diaspora map</div>
    <p class="diaspora-narrative">${diasporaNarrative(d, record.name)}</p>
    <p class="diaspora-subtitle">${subtitle}</p>
    <svg class="diaspora-grid" viewBox="0 0 ${w} ${h}" role="img" preserveAspectRatio="xMidYMid meet">
      ${tiles}
    </svg>
    ${legend}
  </section>`;
}

// Chooses the geographic section for a name. Names that emerged after state
// records begin (1910) get the diaspora origin-and-spread map; names already
// national by then have no observable origin, so they get a present-day
// "strongholds" map built from regional over-representation instead.
function renderGeography(record: NameRecord, a: ClassifyResult, opts: RenderReportOptions): string {
  const emergent = a.firstYear > STATE_DATA_FIRST_YEAR;
  if (emergent && opts.diaspora?.origin) return renderDiasporaMap(record, opts.diaspora);
  return renderStrongholdsMap(record, opts.strongholds ?? []);
}

// Location-quotient bands → the diaspora choropleth's existing tile classes, so
// the strongholds map inherits the same styling with no new CSS.
function strongholdTier(lq: number): "origin" | "early" | "mid" | "late" | "never" {
  if (lq >= 3) return "origin";
  if (lq >= 2) return "early";
  if (lq >= 1.5) return "mid";
  if (lq >= 1.2) return "late";
  return "never";
}

// Present-day heartland map for legacy names: shade each state by how
// over-represented the name is there in the most recent era we have data for.
// Static (no time-lapse) — reuses the diaspora grid markup/styling.
function renderStrongholdsMap(record: NameRecord, anomalies: NameRegionalAnomaly[]): string {
  if (!anomalies.length) return "";
  // "Where it lives now": prefer the most recent era's over-representation.
  const latestEra = Math.max(...anomalies.map((x) => x.era_start_year));
  const current = anomalies.filter((x) => x.era_start_year === latestEra && x.location_quotient >= 1.2);
  const pool = current.length ? current : anomalies;
  // Keep the strongest signal per state.
  const byState = new Map<string, NameRegionalAnomaly>();
  for (const x of pool) {
    const cur = byState.get(x.state);
    if (!cur || x.location_quotient > cur.location_quotient) byState.set(x.state, x);
  }
  if (!byState.size) return "";
  const ranked = [...byState.values()].sort((p, q) => q.location_quotient - p.location_quotient);
  const top = ranked[0]!;
  const era = top.era_start_year;

  const CELL = 42;
  const w = TILE_COLS * CELL;
  const h = TILE_ROWS * CELL;
  const tiles = ALL_STATES.map((st) => {
    const pos = US_TILE_GRID[st];
    if (!pos) return "";
    const [rowIdx, colIdx] = pos;
    const x = colIdx * CELL;
    const y = rowIdx * CELL;
    const a = byState.get(st);
    const tier = a ? strongholdTier(a.location_quotient) : "never";
    const title = a
      ? `${stateName(st)}: ${a.location_quotient.toFixed(1)}× the national rate`
      : `${stateName(st)}: near or below the national rate`;
    return `<g class="dz-tile dz-${tier}" data-state="${st}">
      <title>${escape(title)}</title>
      <rect x="${x + 2}" y="${y + 2}" width="${CELL - 4}" height="${CELL - 4}" rx="4"/>
      <text x="${x + CELL / 2}" y="${y + CELL / 2 + 4}" text-anchor="middle">${st}</text>
    </g>`;
  }).join("");

  const others = ranked.slice(1, 4).map((x) => stateName(x.state));
  const tail = others.length ? ` It also runs high in ${formatStateList(others)}.` : "";
  const narrative = `${escape(record.name)} is most concentrated in <strong>${escape(stateName(top.state))}</strong> — about <strong>${top.location_quotient.toFixed(1)}×</strong> the national rate in the ${era}s.${tail}`;

  const legend = `<div class="diaspora-legend" aria-hidden="true">
    <span class="dz-origin">3×+</span>
    <span class="dz-early">2×+</span>
    <span class="dz-mid">1.5×+</span>
    <span class="dz-late">1.2×+</span>
    <span class="dz-never">~ national</span>
  </div>`;

  return `<section class="diaspora-map" id="strongholds-map" aria-label="${escape(record.name)} geographic strongholds across the United States">
    <div class="section-label">Where it lives now</div>
    <p class="diaspora-narrative">${narrative}</p>
    <p class="diaspora-subtitle">States where ${escape(record.name)} is given more often than the national average — its present-day heartland.</p>
    <svg class="diaspora-grid" viewBox="0 0 ${w} ${h}" role="img" preserveAspectRatio="xMidYMid meet">
      ${tiles}
    </svg>
    ${legend}
  </section>`;
}

function renderEnrichmentPanel(record: NameRecord, enrichment?: NameEnrichmentBundle): string {
  if (!enrichment?.profile) return "";
  const profile = enrichment.profile;
  const legacyClass = profile.median_age > LEGACY_MEDIAN_AGE ? " enrichment-panel--legacy" : "";
  return `<section class="enrichment-panel${legacyClass}" aria-label="${escape(record.name)} enrichment dossier">
    ${renderActuarialVitals(profile)}
    ${renderPlaygroundDensity(profile)}
    ${renderWaveTopology(profile)}
    ${renderCatalysts(enrichment.catalysts)}
    ${renderRegionalAnomalies(enrichment.regionalAnomalies)}
    ${renderHistoricalLegacy(profile, enrichment.historicalProfiles)}
  </section>`;
}

function renderActuarialVitals(profile: NameEnrichmentProfile): string {
  return `<div class="enrichment-card actuarial-card">
    <div class="label">Living profile</div>
    <div class="value">${fmt(profile.total_living_est)}</div>
    <p>Estimated living Americans with this name.</p>
    <div class="mini-grid">
      <div><span>Median age</span><strong>${profile.median_age}</strong></div>
      <div><span>Core range</span><strong>${profile.age_range_low}–${profile.age_range_high}</strong></div>
    </div>
  </div>`;
}

function renderPlaygroundDensity(profile: NameEnrichmentProfile): string {
  const p = playgroundDensity(profile.latest_pct);
  return `<div class="density-badge">
    <span>Playground Density Index</span>
    <strong>${(p * 100).toFixed(1)}%</strong>
  </div>`;
}

function renderWaveTopology(profile: NameEnrichmentProfile): string {
  return `<div class="enrichment-card wave-card">
    <div class="label">Wave type</div>
    <div class="value">${escape(profile.wave_topology)}</div>
    <p>${escape(WAVE_COPY[profile.wave_topology] ?? "")}</p>
  </div>`;
}

function renderCatalysts(catalysts: NameCatalyst[]): string {
  if (!catalysts.length) return "";
  const items = catalysts
    .map(
      (c) => `<div class="catalyst-item">
      <strong>${c.trigger_year}: ${escape(c.catalyst_title)}</strong>
      <span>${escape((c.catalyst_type ?? "").replace(/_/g, " "))}</span>
      ${c.description ? `<p>${escape(c.description)}</p>` : ""}
    </div>`,
    )
    .join("");
  return `<div class="enrichment-card catalyst-card">
    <div class="label">Cultural triggers</div>
    <div class="catalyst-list">${items}</div>
  </div>`;
}

function renderRegionalAnomalies(anomalies: NameRegionalAnomaly[]): string {
  if (!anomalies.length) return "";
  const top = anomalies[0]!;
  const rows = anomalies
    .map(
      (a) => `<div>
      <span>${escape(stateName(a.state))} · ${a.era_start_year}s</span>
      <strong>${a.location_quotient.toFixed(1)}×</strong>
    </div>`,
    )
    .join("");
  return `<div class="enrichment-card regional-card">
    <div class="label">Geographic heartland</div>
    <div class="value">${escape(stateName(top.state))}</div>
    <p><strong>${top.location_quotient.toFixed(1)}× higher affinity</strong> than the national baseline.</p>
    <div class="regional-list">${rows}</div>
  </div>`;
}

function renderHistoricalLegacy(
  profile: NameEnrichmentProfile,
  historicalProfiles: NameHistoricalProfile[],
): string {
  if (profile.median_age <= LEGACY_MEDIAN_AGE || !historicalProfiles.length) return "";
  const selected = historicalProfiles[historicalProfiles.length - 1]!;
  const occupations = selected.top_occupations.map((o) => `<li>${escape(o)}</li>`).join("");
  return `<div class="enrichment-card historical-card">
    <div class="label">Historical legacy</div>
    <p>This name's living center of gravity is old enough to read partly as historical inheritance.</p>
    <div class="legacy-meta">
      <span>${selected.era_year}</span>
      <span>${escape(selected.primary_region)}</span>
      <span>${escape(selected.urban_vs_rural)}</span>
    </div>
    <ul class="occupation-list">${occupations}</ul>
  </div>`;
}

function renderNarrativeInsights(
  record: NameRecord,
  a: ClassifyResult,
  opts: RenderReportOptions,
  sexLabel: string,
): string[] {
  const peerSentence = renderPeerSentence(record, a, opts.peerNames ?? []);
  const shareSentence = renderShareSentence(record, a, opts.yearTotals ?? [], sexLabel);
  const risingHighSentence = renderRisingHighSentence(record, a, sexLabel);

  // TODO: Pattern C requires last_top_1000_year column on names + ingest recompute.
  const out: string[] = [];
  if (a.status === "rising") {
    if (risingHighSentence) out.push(`<p>${risingHighSentence}</p>`);
    if (peerSentence) out.push(`<p>${peerSentence}</p>`);
  } else if (a.status === "extinct") {
    if (peerSentence) out.push(`<p>${peerSentence}</p>`);
  } else {
    if (peerSentence) out.push(`<p>${peerSentence}</p>`);
    if (shareSentence) out.push(`<p>${shareSentence}</p>`);
  }
  return out;
}

function renderPeerSentence(record: NameRecord, a: ClassifyResult, peerNames: YearTopRow[]): string {
  const peers = peerNames
    .filter((row) => row.sex === record.sex && row.name.toLowerCase() !== record.name.toLowerCase())
    .slice(0, 4)
    .map((row) => row.name);
  if (!peers.length) return "";

  const sexTable = record.sex === "M" ? "boys" : "girls";
  return `In ${a.peakYear}, the same ${sexTable} table was led by ${escape(formatList(peers))}.`;
}

function renderShareSentence(record: NameRecord, a: ClassifyResult, yearTotals: YearTotal[], sexLabel: string): string {
  const totalByYear = new Map(yearTotals.map((row) => [row.year, row.total]));
  const peakTotal = totalByYear.get(a.peakYear);
  if (!peakTotal) return "";

  const peakShare = formatShare(a.peakCount, peakTotal);
  const latestTotal = totalByYear.get(record.yM);
  const latestShare =
    latestTotal && a.latestCount
      ? `<strong>${formatShare(a.latestCount, latestTotal)}</strong>`
      : "below the SSA reporting floor";
  return `At peak, ${escape(record.name)} accounted for <strong>${peakShare}</strong> of recorded ${sexLabel} births. In ${record.yM}, it was ${latestShare}.`;
}

function renderRisingHighSentence(record: NameRecord, a: ClassifyResult, sexLabel: string): string {
  if (a.status !== "rising" || a.latestCount <= 0) return "";
  const cutoff = record.yM - 10;
  let priorYear: number | null = null;
  let priorCount = 0;
  for (let year = cutoff; year >= record.ym; year--) {
    const count = record.series[year] ?? 0;
    if (count > a.latestCount) {
      priorYear = year;
      priorCount = count;
      break;
    }
  }
  if (!priorYear) {
    return `${escape(record.name)} is at a modern high in the latest SSA record.`;
  }
  return `${escape(record.name)} has not been this common since ${priorYear}, when ${fmt(priorCount)} ${sexLabel} received it.`;
}

function formatShare(count: number, total: number): string {
  const pct = (count / total) * 100;
  if (pct > 0 && pct < 0.01) return "less than 0.01%";
  if (pct >= 1) return `${pct.toFixed(1).replace(/\.0$/, "")}%`;
  return `${pct.toFixed(2)}%`;
}

function formatList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function renderNameSummary(name: string, narrative: NameNarrative): string {
  if (!narrative.summaryParagraphs.length) return "";
  const safeName = escape(name);
  const paras = narrative.summaryParagraphs.map((p) => `<p>${p}</p>`).join("\n    ");
  return `<section class="name-summary" aria-labelledby="name-summary-heading">
  <h2 id="name-summary-heading">${safeName} at a glance</h2>
  ${paras}
</section>`;
}

function renderNameAnswers(name: string, narrative: NameNarrative): string {
  const safeName = escape(name);
  const { answers } = narrative;
  const items: string[] = [];

  if (answers.population) {
    items.push(`<h3>How many people are named ${safeName}?</h3>\n  <p>${answers.population}</p>`);
  }
  items.push(`<h3>How rare is ${safeName}?</h3>\n  <p>${answers.rarity}</p>`);
  if (answers.age) {
    items.push(`<h3>How old is the typical ${safeName}?</h3>\n  <p>${answers.age}</p>`);
  }
  items.push(`<h3>Is ${safeName} still popular?</h3>\n  <p>${answers.trend}</p>`);
  if (answers.geography) {
    items.push(`<h3>Where is ${safeName} most common?</h3>\n  <p>${answers.geography}</p>`);
  }
  if (answers.whereFrom) {
    items.push(`<h3>Which state uses ${safeName} the most?</h3>\n  <p>${answers.whereFrom}</p>`);
  }
  if (answers.whenLast) {
    items.push(`<h3>When was ${safeName} last recorded?</h3>\n  <p>${answers.whenLast}</p>`);
  }

  return `<section class="name-answers" aria-labelledby="name-answers-heading">
  <h2 id="name-answers-heading">Quick answers about ${safeName}</h2>
  ${items.join("\n  ")}
</section>`;
}

// ---------------------------------------------------------------------------
// Story strip — the rare-name facts, above the fold.
//
// This is the page's differentiator. Generic meaning-and-origin prose is
// available on a hundred other sites; the actual American usage record is not.
// Every cell is a number or a date from the SSA file. Cells with no data are
// omitted entirely rather than rendered as an em dash, because a grid of
// placeholders reads as a broken page.
// ---------------------------------------------------------------------------

interface StoryCell {
  label: string;
  value: string;
  detail?: string;
}

/** Ordinal-free rarity phrasing. The percentile is more legible than the rank
 *  for rare names, where the rank itself is a meaningless five-digit number. */
function rarityCell(facts: NameFacts, sexLabel: string): StoryCell | null {
  if (!facts.rarity_total_sex) return null;
  const pct = facts.rarity_pct_sex;
  const value =
    pct >= 99.9
      ? `Rarer than 99.9% of ${sexLabel}' names`
      : pct >= 50
        ? `Rarer than ${pct.toFixed(1)}% of ${sexLabel}' names`
        : `More common than ${(100 - pct).toFixed(1)}% of ${sexLabel}' names`;
  return {
    label: "Rarity",
    value,
    detail: `${labelBand(facts.rarity_band)} · rank ${fmt(facts.rarity_rank_sex)} of ${fmt(facts.rarity_total_sex)}`,
  };
}

function labelBand(band: NameFacts["rarity_band"]): string {
  return band.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
}

function storyCells(
  record: NameRecord,
  a: ClassifyResult,
  facts: NameFacts,
  sexLabel: string,
): StoryCell[] {
  const cells: StoryCell[] = [];
  const rarity = rarityCell(facts, sexLabel);
  if (rarity) cells.push(rarity);

  cells.push({
    label: "Peak year",
    value: String(a.peakYear),
    detail: `${fmt(a.peakCount)} births · ${generationForYear(a.peakYear)}`,
  });

  cells.push({
    label: "First recorded",
    value: String(facts.first_year),
    detail: `${fmt(facts.years_recorded)} year${facts.years_recorded === 1 ? "" : "s"} on record`,
  });

  cells.push({
    label: "Last recorded",
    value: a.latestCount > 0 ? `Still recorded` : String(facts.last_year),
    detail: a.latestCount > 0 ? `${fmt(a.latestCount)} in ${record.yM}` : `Nothing since`,
  });

  if (facts.top_state && facts.top_state_share) {
    cells.push({
      label: "Strongest state",
      value: stateName(facts.top_state),
      detail: `${Math.round(facts.top_state_share * 100)}% of recorded births`,
    });
  }

  cells.push({ label: "Trajectory", value: displayStatus(a, record.yM), detail: trajectoryDetail(a) });

  if (facts.gap_years_max >= 10 && facts.gap_start_year && facts.gap_end_year) {
    cells.push({
      label: "Dormancy",
      value: `${facts.gap_years_max} years`,
      detail: `Absent ${facts.gap_start_year}–${facts.gap_end_year}`,
    });
  }

  if (facts.spike_year && facts.spike_ratio && facts.spike_ratio >= 2) {
    cells.push({
      label: "Inflection",
      value: String(facts.spike_year),
      detail: `${facts.spike_ratio.toFixed(1)}× its own baseline`,
    });
  }

  if (facts.catalyst_year && facts.catalyst_title) {
    cells.push({
      label: "Catalyst",
      value: String(facts.catalyst_year),
      detail: facts.catalyst_title,
    });
  }

  return cells;
}

function trajectoryDetail(a: ClassifyResult): string {
  if (a.status === "rising" && a.growthX) return `${a.growthX}× the previous decade`;
  if ((a.declinePct ?? 0) > 0) return `Down ${a.declinePct}% from peak`;
  return `${fmt(a.totalCount)} recorded in total`;
}

/**
 * One sentence assembled entirely from the numbers. Also feeds the meta
 * description for rare names, where the rarity fact earns far more clicks than
 * a generic peak sentence.
 */
export function storySentence(record: NameRecord, a: ClassifyResult, facts: NameFacts): string {
  const name = record.name;
  const parts: string[] = [];

  if (facts.is_one_and_done) {
    parts.push(
      `${name} appears in exactly one year of the American birth record: ${facts.first_year}, when ${fmt(facts.max_annual)} were born`,
    );
  } else if (facts.is_sub_ten) {
    parts.push(
      `${name} has been recorded in ${fmt(facts.years_recorded)} of the ${fmt(record.yM - record.ym + 1)} years since ${record.ym}, never more than ${fmt(facts.max_annual)} in any single year`,
    );
  } else {
    parts.push(
      `${name} has been recorded in ${fmt(facts.years_recorded)} of the ${fmt(record.yM - record.ym + 1)} years since ${record.ym}, peaking at ${fmt(a.peakCount)} births in ${a.peakYear}`,
    );
  }

  if (facts.comeback_gap && facts.comeback_year) {
    parts.push(`it returned in ${facts.comeback_year} after ${facts.comeback_gap} years of silence`);
  } else if (a.latestCount > 0) {
    parts.push(`${fmt(a.latestCount)} were born in ${record.yM}`);
  } else {
    parts.push(`it was last recorded in ${facts.last_year}`);
  }

  if (facts.top_state && (facts.top_state_share ?? 0) >= 0.2) {
    parts.push(
      `${Math.round((facts.top_state_share ?? 0) * 100)}% of those births were in ${stateName(facts.top_state)}`,
    );
  }

  return parts.join(", and ") + ".";
}

/** Collection chips. `limit` caps the strip copy; the explore rail shows all. */
function renderCollectionLinks(
  memberships: readonly CollectionMembership[],
  limit = Infinity,
): string {
  const chips = memberships
    .map((m) => ({ m, def: getCollection(m.slug) }))
    .filter((x): x is { m: CollectionMembership; def: NonNullable<ReturnType<typeof getCollection>> } =>
      Boolean(x.def),
    )
    // The collections where this name ranks highest are the most defensible
    // claims about it, so they lead.
    .sort((x, y) => x.m.rank_in - y.m.rank_in)
    .slice(0, limit === Infinity ? undefined : limit)
    .map(
      ({ def }) => `<a href="/collections/${def.slug}/">${escape(def.title)}</a>`,
    );
  return chips.join("");
}

function renderSpellingRelatives(record: NameRecord, variants: readonly VariantSibling[]): string {
  if (!variants.length) return "";
  const links = variants
    .slice(0, 5)
    .map((v) => `<a href="/name/${encodeURIComponent(v.name)}/">${escape(v.name)}</a>`)
    .join('<span class="sep"> · </span>');
  return `<p class="story-relatives"><span class="label">Spelling relatives</span> ${links}</p>`;
}

function renderStoryStrip(
  record: NameRecord,
  a: ClassifyResult,
  facts: NameFacts | null | undefined,
  variants: readonly VariantSibling[],
  memberships: readonly CollectionMembership[],
  sexLabel: string,
): string {
  if (!facts) return "";
  const cells = storyCells(record, a, facts, sexLabel);
  if (!cells.length) return "";

  const grid = cells
    .map(
      (c) => `<div class="story-fact">
      <dt>${escape(c.label)}</dt>
      <dd>${escape(c.value)}${c.detail ? `<span class="story-detail">${escape(c.detail)}</span>` : ""}</dd>
    </div>`,
    )
    .join("");

  const chips = renderCollectionLinks(memberships, 3);
  const collections = chips
    ? `<nav class="story-collections" aria-label="Collections containing ${escape(record.name)}">${chips}</nav>`
    : "";

  return `<section class="story-strip" aria-label="${escape(record.name)} at a glance">
    <dl class="story-facts">${grid}</dl>
    <p class="story-line">${escape(storySentence(record, a, facts))}</p>
    ${renderSpellingRelatives(record, variants)}
    ${collections}
  </section>`;
}

function reportNumber(name: string, sex: string): string {
  let hash = 5381;
  const raw = `${name}:${sex}`;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) + hash) ^ raw.charCodeAt(i);
    hash |= 0;
  }
  return String(Math.abs(hash) % 100000).padStart(5, "0");
}

function editorialLink(a: ClassifyResult, facts?: NameFacts | null): [string, string] | null {
  // A precise cluster beats the generic hub: an extinct 1920s name belongs on
  // /collections/lost-names-of-the-1920s/, not on /extinct with 500 others.
  if (facts) {
    if (facts.exclusive_state) {
      const def = getCollection(`only-in-${stateName(facts.exclusive_state).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`);
      if (def) return [def.title, `/collections/${def.slug}/`];
    }
    if (a.status === "extinct") {
      const def = getCollection(`lost-names-of-the-${Math.floor(a.peakYear / 10) * 10}s`);
      if (def) return [def.title, `/collections/${def.slug}/`];
    }
  }
  if (a.status === "rising") return ["Rising names", "/rising"];
  if (a.status === "extinct") return ["Extinct names", "/extinct"];
  if (a.status === "endangered") return ["Endangered names", "/endangered"];
  if (a.peakYear >= 2000 && a.peakYear <= 2012) return ["Gen Z names", "/gen-z-names"];
  if (a.peakYear >= 1980 && a.peakYear <= 1999) return ["Millennial names", "/millennial-names"];
  if (a.status === "stable" && (a.declinePct ?? 0) < 35) return ["Classic names", "/classic-names"];
  return null;
}

function renderExploreLinks(
  record: NameRecord,
  a: ClassifyResult,
  facts: NameFacts | null | undefined,
  memberships: readonly CollectionMembership[],
): string {
  const cohort: Partial<Record<Status, [string, string]>> = {
    extinct: ["More extinct names", "/extinct"],
    endangered: ["More endangered names", "/endangered"],
    rising: ["More rising names", "/rising"],
  };
  const links: string[] = [];
  const statusLink = cohort[a.status];
  if (statusLink) {
    links.push(`<a href="${statusLink[1]}">${statusLink[0]}</a>`);
  }
  const ed = editorialLink(a, facts);
  if (ed && ed[1] !== (statusLink?.[1] ?? "")) {
    links.push(`<a href="${ed[1]}">${ed[0]}</a>`);
  }
  links.push(`<a href="/year/${a.peakYear}/">Top baby names from ${a.peakYear}</a>`);
  links.push(`<a href="/names/${decadeLabel(a.peakYear)}/">${decadeLabel(a.peakYear)} baby names</a>`);
  links.push(`<a href="/names/${encodeURIComponent(record.name.charAt(0).toLowerCase())}/">Names starting with ${escape(record.name.charAt(0).toUpperCase())}</a>`);
  links.push(`<a href="/names/ending/${encodeURIComponent(record.name.charAt(record.name.length - 1).toLowerCase())}/">Names ending in ${escape(record.name.charAt(record.name.length - 1).toUpperCase())}</a>`);
  links.push(`<a href="/name/${encodeURIComponent(record.name)}/twin/">Names like ${escape(record.name)}</a>`);
  links.push(`<a href="/shadow/${encodeURIComponent(record.name)}/${record.yM}/?sex=${record.sex}">Meet your shadow</a>`);

  // Collection backlinks go last but are the most specific claims on the page,
  // so they are never truncated here the way the strip's are.
  const collectionLinks = renderCollectionLinks(memberships);

  return `<nav class="report-links" aria-label="Explore more name data">${links.join("")}${collectionLinks}</nav>`;
}

function renderRelatedNames(relatedNames: RelatedName[]): string {
  if (!relatedNames.length) return "";
  const items = relatedNames
    .map((r) => {
      const sexLabel = r.sex === "M" ? "Masculine" : "Feminine";
      return `<a href="/name/${encodeURIComponent(r.name)}/">
  <strong>${escape(r.name)}</strong>
  <span>${sexLabel} · ${labelStatus(r.status)} · peak ${r.peak_year}</span>
</a>`;
    })
    .join("");
  return `<section class="related-names" aria-labelledby="related-names-title">
  <h2 id="related-names-title">Related names</h2>
  <div class="related-grid">${items}</div>
</section>`;
}

function renderDiscoveryModule(module: NameDiscoveryModule | undefined): string {
  if (!module?.clusters.length) return "";
  const clusters = module.clusters
    .map((cluster) => {
      const items = cluster.items.map((item) => renderDiscoveryCard(item, cluster.kind)).join("");
      return `<div class="discovery-cluster">
  <h3>${escape(cluster.title)}</h3>
  <div class="related-grid discovery-grid">${items}</div>
</div>`;
    })
    .join("");

  return `<section class="related-names discovery-module" aria-labelledby="discovery-module-title">
  <h2 id="discovery-module-title">Browse nearby names</h2>
  ${clusters}
</section>`;
}

function renderDiscoveryCard(card: NameDiscoveryCard, kind: NameDiscoveryClusterKind): string {
  const detail = discoveryDetail(card, kind);
  return `<a href="/name/${encodeURIComponent(card.name)}/">
  <strong>${escape(card.name)}</strong>
  <span>${escape(detail)}</span>
</a>`;
}

function discoveryDetail(card: NameDiscoveryCard, kind: NameDiscoveryClusterKind): string {
  const sexLabel = card.sex === "M" ? "Masculine" : "Feminine";
  const statusLabel = labelStatus(card.status);
  if (kind === "current-alternatives") {
    return `${sexLabel} · ${statusLabel} · ${fmt(card.latest_count)} births in the latest year`;
  }
  if (kind === "same-era") {
    return `${sexLabel} · ${statusLabel} · peak ${card.peak_year}`;
  }
  return `${sexLabel} · ${statusLabel} · ${fmt(card.total_count)} total births`;
}

function decadeLabel(year: number): string {
  const decadeStart = Math.floor(year / 10) * 10;
  return `${decadeStart}s`;
}

function labelStatus(status: Status): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

// Visible status label for headings, titles, pill text, and meta descriptions.
// Distinct from the internal `status` enum (used for CSS classes, schema.org,
// and landing-page filtering) because the classifier flags any name down 90%+
// from peak as "endangered" regardless of absolute volume — which is misleading
// for high-volume names like Michael (8,189 births in 2024) that are still
// mass-culture even after a 91% decline. When a name still gets 5,000+ births,
// "Past peak" reads more honestly than "Endangered".
function displayStatus(a: ClassifyResult, yM: number): string {
  if (a.status === "endangered" && a.latestCount >= STILL_COMMON_THRESHOLD) {
    return "Past peak";
  }
  if (a.status === "rising" && a.peakYear < yM - 25 && (a.declinePct ?? 0) > 45) {
    return "Resurgent";
  }
  if (a.status === "declining") return "Stable Decline";
  return labelStatus(a.status);
}

function buildMetaDescription(record: NameRecord, a: ClassifyResult): string {
  const sexLabel = record.sex === "M" ? "boys" : "girls";
  const trendDescriptor = a.status === "endangered" && a.latestCount >= STILL_COMMON_THRESHOLD ? "past-peak" : a.status;
  if (a.status === "extinct") {
    return `${record.name} peaked in ${a.peakYear} with ${fmt(a.peakCount)} ${sexLabel} and has since disappeared from SSA records. Explore its full popularity curve, historical context, and similar names from the same era.`;
  }
  if (a.status === "rising" || a.status === "stable") {
    return `${record.name} is ${trendDescriptor === "rising" ? "gaining popularity" : "maintaining steady usage"} in the latest SSA data, with ${fmt(a.latestCount)} ${sexLabel} in ${record.yM}. Explore its full popularity curve, peak year ${a.peakYear}, and names from the same era.`;
  }
  return `${record.name} peaked in ${a.peakYear} with ${fmt(a.peakCount)} ${sexLabel}. See its full SSA popularity curve, ${trendDescriptor} trend, and nearby names from the same era.`;
}

function buildStructuredData(
  record: NameRecord,
  a: ClassifyResult,
  opts: {
    canonical: string;
    title: string;
    description: string;
    origin: string;
    facts?: NameFacts | null;
  },
): object[] {
  const origin = opts.origin || opts.canonical;
  const facts = opts.facts;
  return [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: origin + "/" },
        { "@type": "ListItem", position: 2, name: "Names", item: origin + "/names/" },
        { "@type": "ListItem", position: 3, name: `${record.name} name popularity`, item: opts.canonical },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: opts.title,
      url: opts.canonical,
      description: opts.description,
      isPartOf: {
        "@type": "WebSite",
        name: "NobodyNamed",
        url: origin,
      },
      mainEntity: {
        "@type": "Dataset",
        name: `SSA baby-name counts for ${record.name}`,
        description: `Annual Social Security Administration baby-name counts for ${record.name} from ${a.firstYear} through ${record.yM}.`,
        temporalCoverage: `${a.firstYear}/${record.yM}`,
        creator: {
          "@type": "Organization",
          name: "Social Security Administration",
          url: "https://www.ssa.gov/oact/babynames/",
        },
        variableMeasured: [
          { "@type": "PropertyValue", name: "Peak year", value: a.peakYear },
          { "@type": "PropertyValue", name: "Peak count", value: a.peakCount },
          { "@type": "PropertyValue", name: "Latest count", value: a.latestCount },
          { "@type": "PropertyValue", name: "Vital status", value: a.status },
          ...(facts
            ? [
                { "@type": "PropertyValue", name: "First recorded year", value: facts.first_year },
                { "@type": "PropertyValue", name: "Last recorded year", value: facts.last_year },
                {
                  "@type": "PropertyValue",
                  name: "Rarity percentile within sex",
                  value: facts.rarity_pct_sex,
                  description: "0 is the most common name recorded; 100 is the rarest.",
                },
              ]
            : []),
          ...(facts?.top_state
            ? [{ "@type": "PropertyValue", name: "Strongest state", value: stateName(facts.top_state) }]
            : []),
        ],
        ...(facts?.top_state
          ? { spatialCoverage: { "@type": "Place", name: stateName(facts.top_state) } }
          : {}),
      },
    },
  ];
}

// Plain text for JSON-LD: some narrative answers embed anchor tags
// (e.g. the "rising"/"extinct" trend links), which don't belong in schema text.
function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, "");
}

// FAQPage built from the same narrative.answers the page renders visibly in
// renderNameAnswers(). Questions must match the on-page <h3>s exactly so the
// structured data reflects content actually present on the page.
/**
 * Folds name_facts into the generated narrative: two extra Q&As, and — for
 * genuinely rare names — a meta description that leads with the rarity fact.
 * On a long-tail query "Marvel" is competing with a comic-book publisher, so
 * the snippet has to say something only this dataset can say.
 */
function augmentNarrativeWithFacts(
  narrative: NameNarrative,
  record: NameRecord,
  a: ClassifyResult,
  facts: NameFacts | null | undefined,
): NameNarrative {
  if (!facts) return narrative;

  const answers = { ...narrative.answers };

  if (facts.top_state && facts.top_state_share) {
    const share = Math.round(facts.top_state_share * 100);
    answers.whereFrom =
      `${stateName(facts.top_state)} accounts for ${share}% of every recorded ${record.name} birth` +
      (facts.exclusive_state
        ? `, effectively the only state where the name is used.`
        : `, more than any other state.`);
  }

  answers.whenLast =
    a.latestCount > 0
      ? `${record.name} was recorded most recently in ${record.yM}, with ${fmt(a.latestCount)} births.`
      : `${record.name} was last recorded in ${facts.last_year}. It has not appeared in the Social Security data since — meaning fewer than five American babies a year have been given the name.`;

  let metaDescription = narrative.metaDescription;
  if (facts.is_one_and_done) {
    metaDescription = `${record.name} appears in exactly one year of American birth records: ${facts.first_year}. See the full Social Security history behind one of the rarest recorded names.`;
  } else if (facts.is_sub_ten) {
    metaDescription = `${record.name} has never been given to as many as ten American babies in a single year, yet appears across ${facts.years_recorded} years of Social Security records. See the full usage history.`;
  } else if (facts.rarity_pct_sex >= 98 && facts.total_count < 100_000) {
    metaDescription = `${record.name} is rarer than ${facts.rarity_pct_sex.toFixed(1)}% of recorded American names. Peak ${a.peakYear}, ${fmt(a.peakCount)} births. See the complete popularity history.`;
  }

  return { ...narrative, answers, metaDescription };
}

function buildFaqStructuredData(name: string, narrative: NameNarrative): object | null {
  const { answers } = narrative;
  const qa: { q: string; a: string }[] = [];
  if (answers.population) qa.push({ q: `How many people are named ${name}?`, a: answers.population });
  qa.push({ q: `How rare is ${name}?`, a: answers.rarity });
  if (answers.age) qa.push({ q: `How old is the typical ${name}?`, a: answers.age });
  qa.push({ q: `Is ${name} still popular?`, a: answers.trend });
  if (answers.geography) qa.push({ q: `Where is ${name} most common?`, a: answers.geography });
  // These two mirror the <h3>s added by renderNameAnswers. The strings must
  // stay byte-identical to the visible headings — a FAQPage whose questions do
  // not appear on the page is a structured-data violation.
  if (answers.whereFrom) qa.push({ q: `Which state uses ${name} the most?`, a: answers.whereFrom });
  if (answers.whenLast) qa.push({ q: `When was ${name} last recorded?`, a: answers.whenLast });
  if (!qa.length) return null;

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: qa.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: stripTags(a) },
    })),
  };
}

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
