// Shared registry-driven SSR renderer for decade hubs.
import { pageShell } from "./render-shell";
import { DECADE_THESES, type DecadeThesis } from "./content/decade-theses";
import { DECADE_HUB_DEFINITIONS, type DecadeHubDefinition } from "./content/decade-hub-definitions";
import type { ClassroomResult, ClassroomStudent, DecadeProfile, NameSummary, OwnershipResult, SpellingFamilyResult } from "./decade-hub-types";

export interface DecadePageOpts { origin: string }
export interface DecadeRenderOptions extends DecadePageOpts {
  definition: DecadeHubDefinition;
  thesis?: DecadeThesis;
  decadeNavigation?: "registry" | "adjacent-only";
}
export interface DecadeRenderContext {
  definition: DecadeHubDefinition; profile: DecadeProfile; thesis?: DecadeThesis; origin: string;
  slug: string; start: number; end: number; nominalEnd: number; classroomYear: number;
  hubPath: string; methodologyPath: string; classroomPath: string; spellingPath: string; contentId: string;
  previous?: DecadeHubDefinition; next?: DecadeHubDefinition; decadeNavigation: "registry" | "adjacent-only";
}
const CONTENT_TYPE = "decade-hub";
const HUB_PATH = "__HUB_PATH__";
const METHODOLOGY_PATH = "__METHODOLOGY_PATH__";
const CLASSROOM_PATH = "__CLASSROOM_PATH__";
const SPELLING_PATH = "__SPELLING_PATH__";
const HUB_CONTENT_ID = "__HUB_CONTENT_ID__";
const BROWSE_NAV = [
  { label: "Extinct", href: "/extinct" }, { label: "Endangered", href: "/endangered" },
  { label: "Comebacks", href: "/comeback" }, { label: "Birth year", href: "/year" },
  { label: "By decade", href: HUB_PATH }, { label: "By initial", href: "/names/a/" },
  { label: "By ending", href: "/names/ending/a/" }, { label: "Rising", href: "/rising" }, { label: "About", href: "/about" },
];
function browseNav(slug: string): { label: string; href: string }[] {
  return BROWSE_NAV.map((item) => item.href === HUB_PATH ? { ...item, href: `/names/${slug}/` } : item);
}
const PUBLISHER_ORG = { "@type": "Organization" as const, name: "NobodyNamed", url: "https://nobodynamed.com/" };
const DECADE_HUB_SCRIPT = `<script src="/assets/decade-hub.js" defer></script>`;
export const SPELLING_FAMILY_COPY_RULE = "Conventional rankings separate spelling variants. This view groups manually reviewed variants to show their combined demographic footprint.";
const HUB_VIEW_ROWS = 25;
const RECONSTRUCTION_LABEL = "A statistical reconstruction of an average classroom, not an actual class record.";
function escapeHtml(s: string): string { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function fmt(n: number): string { return Number(n).toLocaleString("en-US"); }
function pct(share: number, digits = 1): string { return `${(share * 100).toFixed(digits)}%`; }
function nameHref(slug: string): string { return `/name/${encodeURIComponent(slug)}/`; }
function statusLabel(status: string): string { return status && status !== "unknown" ? escapeHtml(status) : "—"; }
function identityWrap(contentId: string, routePath: string, body: string): string { return `<div class="dh-page" data-dh-route="${escapeHtml(routePath)}" data-content-id="${escapeHtml(contentId)}" data-content-type="${CONTENT_TYPE}" data-content-slug="__DECADE_SLUG__">
${body}
</div>`; }
function breadcrumb(origin: string, items: { name: string; path: string }[]): object { return { "@context":"https://schema.org", "@type":"BreadcrumbList", itemListElement: [{"@type":"ListItem",position:1,name:"Home",item:`${origin}/`}, ...items.map((item,index)=>({"@type":"ListItem",position:index+2,name:item.name,item:origin+item.path}))] }; }
function webPage(origin: string, title: string, description: string, canonical: string): object { return { "@context":"https://schema.org", "@type":"WebPage", name:title, url:canonical, description, isPartOf:{"@type":"WebSite",name:"NobodyNamed",url:`${origin}/`}, publisher:PUBLISHER_ORG }; }
export function createDecadeRenderContext(profile: DecadeProfile, opts: DecadeRenderOptions): DecadeRenderContext {
  const expectedSlug = `${opts.definition.startYear}s`;
  if (opts.definition.slug !== expectedSlug) {
    throw new Error(`Decade hub definition slug ${opts.definition.slug} does not match start year ${opts.definition.startYear}`);
  }
  if (profile.decade !== opts.definition.startYear || profile.startYear !== opts.definition.startYear) {
    throw new Error(`Decade hub profile decade ${profile.decade} does not match definition ${opts.definition.startYear}`);
  }
  if (profile.nominalEndYear !== opts.definition.nominalEndYear) {
    throw new Error(`Decade hub profile nominal end ${profile.nominalEndYear} does not match definition ${opts.definition.nominalEndYear}`);
  }
  if (opts.thesis && opts.thesis.sourceVersion !== profile.sourceVersion) {
    throw new Error(`Decade hub thesis source ${opts.thesis.sourceVersion} does not match profile source ${profile.sourceVersion}`);
  }
  if (opts.definition.rolloutState !== "draft" && opts.definition.thesisSourceVersion !== profile.sourceVersion) {
    throw new Error(`Decade hub definition thesis source ${opts.definition.thesisSourceVersion} does not match profile source ${profile.sourceVersion}`);
  }
  const index = DECADE_HUB_DEFINITIONS.findIndex((d) => d.slug === opts.definition.slug);
  const end = Math.min(profile.endYear, opts.definition.nominalEndYear);
  return { definition: opts.definition, profile, thesis: opts.thesis, origin: opts.origin, slug: opts.definition.slug, start: opts.definition.startYear, end, nominalEnd: opts.definition.nominalEndYear, classroomYear: opts.definition.classroomYear, hubPath:`/names/${opts.definition.slug}/`, methodologyPath:`/names/${opts.definition.slug}/methodology/`, classroomPath:`/names/${opts.definition.slug}/classroom/`, spellingPath:`/names/${opts.definition.slug}/spelling-families/`, contentId:`decade-hub:${opts.definition.slug}`, previous:index>0?DECADE_HUB_DEFINITIONS[index-1]:undefined, next:index>=0&&index<DECADE_HUB_DEFINITIONS.length-1?DECADE_HUB_DEFINITIONS[index+1]:undefined, decadeNavigation: opts.decadeNavigation ?? "registry" };
}
function materialize(html: string, c: DecadeRenderContext): string {
  const generation = c.thesis?.generationLink ? `<p>For the generation-scale view, see <a href="${escapeHtml(c.thesis.generationLink.href)}" data-dh-target-id="${escapeHtml(c.thesis.generationLink.targetId ?? "editorial:generation-names")}" data-dh-target-type="editorial">${escapeHtml(c.thesis.generationLink.label)}</a>${c.thesis.generationLink.copy ? ` — ${escapeHtml(c.thesis.generationLink.copy)}` : ""}.</p>` : "";
  return html.replaceAll("__DECADE_SLUG__",c.slug).replaceAll("__START_YEAR__",String(c.start)).replaceAll("__END_YEAR__",String(c.end)).replaceAll("__CLASSROOM_YEAR__",String(c.classroomYear)).replaceAll("__PERIOD__",`${c.start}–${c.end}`).replaceAll("__HUB_PATH__",c.hubPath).replaceAll("__METHODOLOGY_PATH__",c.methodologyPath).replaceAll("__CLASSROOM_PATH__",c.classroomPath).replaceAll("__SPELLING_PATH__",c.spellingPath).replaceAll("__HUB_CONTENT_ID__",c.contentId).replaceAll("__GENERATION_CALL_OUT__",generation);
}

export function DecadeHero(profile: DecadeProfile, thesis: DecadeThesis | undefined, c: DecadeRenderContext): string {
  const thesisHtml = thesis ? `<div class="dh-thesis">
  <h2>${escapeHtml(thesis.heading)}</h2>
  ${thesis.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n  ")}
</div>` : "";
  const lede = `<p class="lede">A name can be popular in the ${escapeHtml(c.slug)} without belonging to the ${escapeHtml(c.slug)}. This hub separates the two: the biggest names of the decade, and the names whose recorded history is concentrated inside it.</p>`;
  const scorecard = DecadeScorecard(profile);
  const heroContent = thesis?.heroOrder === "scorecard-lede-thesis"
    ? `${scorecard}\n  ${lede}\n  ${thesisHtml}`
    : `${lede}\n  ${thesisHtml}\n  ${scorecard}`;
  const previous = c.previous ? `<a href="/names/${c.previous.slug}/" data-dh-target-id="decade:${c.previous.slug}" data-dh-target-type="decade">← ${c.previous.slug}</a>` : "";
  const next = c.next ? `<a href="/names/${c.next.slug}/" data-dh-target-id="decade:${c.next.slug}" data-dh-target-type="decade">${c.next.slug} →</a>` : "";
  const coverage = !profile.isComplete || c.end < c.nominalEnd ? `\n  <p class="dh-coverage-label">${escapeHtml(c.slug)} so far · data through ${c.end}</p>` : "";
  const allDecades = c.decadeNavigation === "registry"
    ? `<nav class="decade-nav" aria-label="All decades">${DECADE_HUB_DEFINITIONS.map((definition) => `<a href="/names/${definition.slug}/" data-dh-target-id="decade:${definition.slug}" data-dh-target-type="decade">${definition.slug}</a>`).join(" ")}</nav>`
    : "";
  return `<header class="dh-hero">
  <p class="eyebrow">Decade hub</p>
  <h1>${escapeHtml(c.slug)} baby names</h1>
  ${heroContent}${coverage}
  <nav class="decade-nav" aria-label="Adjacent decades">
    ${previous}
    ${next}
  </nav>
  ${allDecades}
  ${DecadeYearLinks(profile, c)}
  <div class="dh-share" hidden>
    <button type="button" id="dh-share" class="dh-share-btn">Share this page</button>
    <button type="button" id="dh-copy-link" class="dh-share-btn">Copy link</button>
    <span id="dh-share-status" class="dh-share-status" role="status" aria-live="polite"></span>
  </div>
  <p class="dh-hero-links"><a href="${METHODOLOGY_PATH}" data-dh-target-id="${HUB_CONTENT_ID}/methodology" data-dh-target-type="${CONTENT_TYPE}">Methodology: how every number on this page is computed</a></p>
</header>`;
}

// ── DecadeScorecard ───────────────────────────────────────────────────────

function championCell(champion: NameSummary, label: string): string {
  const lower = escapeHtml(champion.name.toLowerCase());
  return `<div class="dh-stat dh-stat-champion">
  <dt>${escapeHtml(label)}</dt>
  <dd><a href="${nameHref(champion.slug)}" data-dh-name="${lower}" data-dh-target-id="name:${lower}" data-dh-target-type="name-page">${escapeHtml(champion.name)}</a> <span class="dh-stat-note">${fmt(champion.birthsInDecade)} births</span></dd>
</div>`;
}

export function DecadeScorecard(profile: DecadeProfile): string {
  return `<dl class="dh-scorecard">
  ${championCell(profile.femaleChampion, "Girls' popularity champion")}
  ${championCell(profile.maleChampion, "Boys' popularity champion")}
  <div class="dh-stat"><dt>Total recorded births</dt><dd>${fmt(profile.totalBirths)}</dd></div>
  <div class="dh-stat"><dt>Female births</dt><dd>${fmt(profile.femaleBirths)}</dd></div>
  <div class="dh-stat"><dt>Male births</dt><dd>${fmt(profile.maleBirths)}</dd></div>
  <div class="dh-stat"><dt>Distinct recorded names</dt><dd>${fmt(profile.distinctNames)}</dd></div>
  <div class="dh-stat"><dt>Top-10 birth share</dt><dd>${pct(profile.top10Share)}</dd></div>
  <div class="dh-stat"><dt>Top-100 birth share</dt><dd>${pct(profile.top100Share)}</dd></div>
  <div class="dh-stat"><dt>Diversity score</dt><dd>${profile.diversityScore.toFixed(1)}<span class="dh-stat-note">of 100 · ${fmt(Math.round(profile.effectiveNames))} effective names</span></dd></div>
  <div class="dh-stat"><dt>Concentration score</dt><dd>${profile.concentrationScore.toFixed(1)}<span class="dh-stat-note">of 100</span></dd></div>
</dl>`;
}

// ── DecadeYearLinks ───────────────────────────────────────────────────────

export function DecadeYearLinks(profile: DecadeProfile, c?: DecadeRenderContext): string {
  const links: string[] = [];
  const start = c?.start ?? profile.startYear;
  const end = c?.end ?? profile.endYear;
  for (let y = start; y <= end; y++) {
    links.push(`<a href="/year/${y}/" data-dh-target-id="year:${y}" data-dh-target-type="year">${y}</a>`);
  }
  return `<nav class="decade-nav dh-year-links" aria-label="Year-by-year pages, __START_YEAR__ to __END_YEAR__">${links.join(" ")}</nav>`;
}

function DecadeChildNavigation(): string {
  return `<nav class="decade-nav" aria-label="Decade hub pages"><a href="${HUB_PATH}">Overview</a> <a href="${METHODOLOGY_PATH}">Methodology</a> <a href="${CLASSROOM_PATH}">Classroom</a> <a href="${SPELLING_PATH}">Spelling families</a></nav>`;
}

// ── OwnershipExplainer ────────────────────────────────────────────────────

export function OwnershipExplainer(): string {
  return `<div class="dh-explainer">
  <p><strong>Popularity measures size. Ownership measures identity.</strong> Some names remain popular for generations. Others overwhelmingly belong to one decade. The ownership score ranks names by how concentrated their recorded history is inside __PERIOD__, weighted against how visible they actually were — adjusted so that rare names cannot win on a technicality.</p>
  <p class="dh-explainer-note">It is a descriptive statistic about SSA birth records, not a verdict about culture. <a href="${METHODOLOGY_PATH}" data-dh-methodology="ownership">Read the full methodology</a>.</p>
</div>`;
}

// ── OwnershipTable ────────────────────────────────────────────────────────

export function OwnershipTable(rows: OwnershipResult[], opts: { caption: string; showSex?: boolean; period?: string }): string {
  const sexCol = opts.showSex ? `<th scope="col">Sex</th>` : "";
  const period = opts.period ?? "__DECADE_SLUG__";
  const body = rows
    .map((r) => {
      const sexCell = opts.showSex ? `<td>${r.sex}</td>` : "";
      return `<tr>
  <td class="num">${r.ownershipRank}</td>
  <th scope="row"><a href="${nameHref(r.slug)}" data-dh-name="${escapeHtml(r.name.toLowerCase())}">${escapeHtml(r.name)}</a></th>
  ${sexCell}
  <td class="num" data-dh-sort-value="${r.ownershipScore}">${r.ownershipScore.toFixed(1)}</td>
  <td class="num">${fmt(r.birthsInDecade)}</td>
  <td class="num">${fmt(r.lifetimeBirths)}</td>
  <td class="num" data-dh-sort-value="${r.decadeShare}">${pct(r.decadeShare)}</td>
  <td class="num">${r.peakYear}</td>
  <td>${statusLabel(r.status)}</td>
</tr>`;
    })
    .join("\n");

  return `<table class="table dh-table">
  <caption>${escapeHtml(opts.caption)}</caption>
  <thead><tr>
    <th scope="col" class="num">Rank</th>
    <th scope="col">Name</th>
    ${sexCol}
    <th scope="col" class="num">Ownership score</th>
    <th scope="col" class="num">__DECADE_SLUG__ births</th>
    <th scope="col" class="num">Lifetime births</th>
    <th scope="col" class="num">Decade share of lifetime</th>
    <th scope="col" class="num">Peak year</th>
    <th scope="col">Status</th>
  </tr></thead>
  <tbody>
${body}
  </tbody>
</table>`;
}

// ── OwnershipRanking ──────────────────────────────────────────────────────

interface OwnershipView {
  id: string;
  label: string;
  heading: string;
  rule: string;
  rows: OwnershipResult[];
  showSex: boolean;
}

export function OwnershipRanking(profile: DecadeProfile): string {
  const r = profile.ownershipRankings;
  const views: OwnershipView[] = [
    {
      id: "girls",
      label: "Girls",
      heading: "Girls, ranked by ownership",
      rule: "The 25 highest ownership scores in the female eligible set.",
      rows: r.female.slice(0, HUB_VIEW_ROWS),
      showSex: false,
    },
    {
      id: "boys",
      label: "Boys",
      heading: "Boys, ranked by ownership",
      rule: "The 25 highest ownership scores in the male eligible set.",
      rows: r.male.slice(0, HUB_VIEW_ROWS),
      showSex: false,
    },
    {
      id: "most-owned",
      label: "Most Owned",
      heading: "Most owned by the __DECADE_SLUG__",
      rule: "Top 25 by ownership score across both sexes; each row is tagged with its sex comparison set.",
      rows: r.mostOwned,
      showSex: true,
    },
    {
      id: "most-popular",
      label: "Most Popular",
      heading: "Most popular of the decade",
      rule: "Top 25 by recorded __PERIOD__ births across both sexes — size only, no ownership adjustment.",
      rows: r.mostPopular,
      showSex: true,
    },
    {
      id: "timeless",
      label: "Popular but Timeless",
      heading: "Popular but timeless",
      rule: "__DECADE_SLUG__ births at or above the median of the pooled eligible set (both sexes) and adjusted concentration at or below its 25th percentile: big names whose recorded history spans many decades.",
      rows: r.popularButTimeless,
      showSex: true,
    },
    {
      id: "unexpected",
      label: "Unexpected Results",
      heading: "Unexpected results",
      rule: "Names whose popularity rank exceeds their ownership rank by 20 or more within their sex set — popular, but far less tied to the __DECADE_SLUG__ than their size suggests.",
      rows: r.unexpected,
      showSex: true,
    },
  ];

  const tabs = views
    .map(
      (v, i) =>
        `<a class="dh-tab" href="#dh-panel-${v.id}" data-dh-tab="${v.id}"${i === 0 ? " data-dh-default" : ""} aria-label="Show view: ${escapeHtml(v.heading)}">${escapeHtml(v.label)}</a>`,
    )
    .join("");

  const panels = views
    .map(
      (v) => `<section class="dh-panel" id="dh-panel-${v.id}" data-dh-panel="${v.id}" aria-label="${escapeHtml(v.heading)}">
  <h3>${escapeHtml(v.heading)}</h3>
  <p class="dh-view-note">${escapeHtml(v.rule)}</p>
  ${OwnershipTable(v.rows, { caption: `${v.heading} — __DECADE_SLUG__ decade ownership rankings`, showSex: v.showSex })}
</section>`,
    )
    .join("\n");

  return `<section class="dh-ownership" id="ownership" data-dh-module="ownership" data-dh-tabs>
  <h2>Decade ownership</h2>
  ${OwnershipExplainer()}
  <nav class="dh-tabs" aria-label="Ownership ranking views">${tabs}</nav>
  ${panels}
</section>`;
}

// ── Classroom ─────────────────────────────────────────────────────────────

interface RosterEntry {
  name: string;
  slug: string;
  sex: "F" | "M";
  seats: number;
}

/** The payload contract calls students an "expanded 30-entry roster", but be
 *  defensive: if entries arrive unique-per-name with seat counts instead,
 *  honor the seats field. Either way the displayed total must equal size. */
function normalizeRoster(classroom: ClassroomResult): RosterEntry[] {
  const students: ClassroomStudent[] = classroom.students ?? [];
  if (students.length === classroom.size) {
    const bySlug = new Map<string, RosterEntry>();
    for (const s of students) {
      const key = `${s.slug}:${s.sex}`;
      const existing = bySlug.get(key);
      if (existing) {
        existing.seats += 1;
      } else {
        bySlug.set(key, { name: s.name, slug: s.slug, sex: s.sex, seats: 1 });
      }
    }
    return [...bySlug.values()].sort(
      (a, b) => b.seats - a.seats || a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
    );
  }
  return students
    .map((s) => ({ name: s.name, slug: s.slug, sex: s.sex, seats: Math.max(1, s.seats) }))
    .sort((a, b) => b.seats - a.seats || a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}

function expandSeats(roster: RosterEntry[]): RosterEntry[] {
  const seats: RosterEntry[] = [];
  for (const entry of roster) {
    for (let i = 0; i < entry.seats; i++) seats.push(entry);
  }
  return seats;
}


export function ClassroomSummary(classroom: ClassroomResult): string {
  const repeatsSentence = classroom.repeatedNames > 0
    ? `the average class fills with repeats: ${escapeHtml(classroom.mostRepeated.name)} appears ${classroom.mostRepeated.seats} times, and only ${classroom.uniqueNames} of the 30 seats hold a unique name.`
    : `every seat carries a different name — no name was common enough in __CLASSROOM_YEAR__ to guarantee a duplicate in a class of 30.`;
  return `<section class="dh-classroom-summary" data-dh-module="classroom">
  <h2>The __CLASSROOM_YEAR__ classroom</h2>
  <p>Apportion 30 seats from the actual __CLASSROOM_YEAR__ national birth records and ${repeatsSentence}</p>
  <p class="dh-label">${RECONSTRUCTION_LABEL}</p>
  <p><a href="${CLASSROOM_PATH}" data-dh-target-id="${HUB_CONTENT_ID}/classroom" data-dh-target-type="${CONTENT_TYPE}">See the full 30-student roster</a></p>
</section>`;
}

export function ClassroomRoster(classroom: ClassroomResult): string {
  const roster = normalizeRoster(classroom);
  const seats = expandSeats(roster);
  const cards = seats
    .map((entry) => {
      const repeat = entry.seats > 1;
      const badge = repeat ? `<span class="dh-seat-badge" aria-label="${entry.seats} students named ${escapeHtml(entry.name)}">×${entry.seats}</span>` : "";
      const cls = repeat ? "dh-student dh-student--repeat" : "dh-student";
      return `<li class="${cls}"><a href="${nameHref(entry.slug)}" data-dh-name="${escapeHtml(entry.name.toLowerCase())}" data-dh-seats="${entry.seats}">${escapeHtml(entry.name)}</a><span class="dh-student-sex">${entry.sex}</span>${badge}</li>`;
    })
    .join("\n");

  const seatRows = roster
    .map(
      (entry) => `<tr>
  <th scope="row"><a href="${nameHref(entry.slug)}" data-dh-name="${escapeHtml(entry.name.toLowerCase())}" data-dh-seats="${entry.seats}">${escapeHtml(entry.name)}</a></th>
  <td>${entry.sex}</td>
  <td class="num">${entry.seats}</td>
</tr>`,
    )
    .join("\n");

  const hasRepeats = roster.some((entry) => entry.seats > 1);
  const noRepeatCallout = hasRepeats
    ? ""
    : `<p class="dh-family-callout">Every seat carries a different name — no name was common enough in __CLASSROOM_YEAR__ to guarantee a duplicate in a class of 30.</p>`;

  return `<div class="dh-roster" data-dh-roster>
  ${noRepeatCallout}
  <ul class="dh-roster-grid">
${cards}
  </ul>
</div>
<details class="dh-seat-table">
  <summary>Seat counts by name</summary>
  <table class="table dh-table">
    <caption>__CLASSROOM_YEAR__ classroom seat apportionment by name</caption>
    <thead><tr><th scope="col">Name</th><th scope="col">Sex</th><th scope="col" class="num">Seats</th></tr></thead>
    <tbody>
${seatRows}
    </tbody>
  </table>
</details>`;
}

export function ClassroomStats(classroom: ClassroomResult): string {
  return `<dl class="dh-scorecard dh-classroom-stats">
  <div class="dh-stat"><dt>Class size</dt><dd>${classroom.size}</dd></div>
  <div class="dh-stat"><dt>Girls / boys</dt><dd>${classroom.femaleSeats} / ${classroom.maleSeats}</dd></div>
  <div class="dh-stat"><dt>Unique names</dt><dd>${classroom.uniqueNames}</dd></div>
  <div class="dh-stat"><dt>Repeated seats</dt><dd>${classroom.repeatedNames}</dd></div>
  <div class="dh-stat"><dt>Most repeated name</dt><dd><a href="${nameHref(classroom.mostRepeated.slug)}" data-dh-name="${escapeHtml(classroom.mostRepeated.name.toLowerCase())}" data-dh-seats="${classroom.mostRepeated.seats}">${escapeHtml(classroom.mostRepeated.name)}</a> <span class="dh-stat-note">×${classroom.mostRepeated.seats}</span></dd></div>
  <div class="dh-stat"><dt>Top-name share</dt><dd>${pct(classroom.topShare)}<span class="dh-stat-note">of the 30 seats</span></dd></div>
</dl>`;
}

// ── Spelling families ─────────────────────────────────────────────────────


const SERIES_COLORS = ["var(--accent)", "var(--blue)", "var(--emerald)", "var(--amber)", "var(--violet)", "var(--charcoal)"];
const SERIES_DASHES = ["", "7 3", "2 3", "9 3 2 3", "1 3", "5 2 1 2"];

export function SpellingFamilyChart(family: SpellingFamilyResult): string {
  const width = 680;
  const height = 300;
  const pad = { top: 26, right: 14, bottom: 28, left: 46 };
  const years = family.yearly.map((p) => p.year);
  const maxV = Math.max(1, ...family.yearly.map((p) => p.total));
  const xStep = years.length > 1 ? (width - pad.left - pad.right) / (years.length - 1) : 0;
  const x = (i: number) => pad.left + i * xStep;
  const y = (v: number) => height - pad.bottom - (v / maxV) * (height - pad.top - pad.bottom);

  const lineFor = (values: number[]): string =>
    values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");

  const variantSeries = family.variants.map((variant, vi) => {
    const values = family.yearly.map((p) => Number(p[variant.name] ?? 0));
    const color = SERIES_COLORS[(vi + 1) % SERIES_COLORS.length];
    const dash = SERIES_DASHES[(vi + 1) % SERIES_DASHES.length];
    const dashAttr = dash ? ` stroke-dasharray="${dash}"` : "";
    return `<path class="dh-series dh-series-variant" d="${lineFor(values)}" style="stroke:${color}"${dashAttr}/>`;
  });

  const totalValues = family.yearly.map((p) => p.total);
  const totalLine = `<path class="dh-series dh-series-total" d="${lineFor(totalValues)}" style="stroke:${SERIES_COLORS[0]}"/>`;

  const xLabels = years
    .map((yr, i) => `<text x="${x(i).toFixed(1)}" y="${height - 8}" class="dh-axis-text" text-anchor="middle">${yr}</text>`)
    .join("");

  const yMaxLabel = `<text x="${pad.left - 6}" y="${y(maxV).toFixed(1)}" class="dh-axis-text" text-anchor="end" dy="0.32em">${fmt(maxV)}</text>`;
  const yZeroLabel = `<text x="${pad.left - 6}" y="${height - pad.bottom}" class="dh-axis-text" text-anchor="end" dy="0.32em">0</text>`;

  const gridTop = `<line class="dh-grid" x1="${pad.left}" y1="${y(maxV).toFixed(1)}" x2="${width - pad.right}" y2="${y(maxV).toFixed(1)}"/>`;
  const axis = `<line class="dh-axis" x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}"/>`;

  const ariaSummary = `Line chart of yearly births, ${years[0]} to ${years[years.length - 1]}, for the ${family.label} spelling family: combined total plus ${family.variants.length} variant series. Peak combined year ${family.peakYear}.`;

  const legendItems = [
    `<li><span class="dh-legend-swatch" style="border-color:${SERIES_COLORS[0]}"></span>Combined total</li>`,
    ...family.variants.map((variant, vi) => {
      const color = SERIES_COLORS[(vi + 1) % SERIES_COLORS.length];
      const dash = SERIES_DASHES[(vi + 1) % SERIES_DASHES.length];
      const dashAttr = dash ? ` stroke-dasharray="${dash}"` : "";
      return `<li><svg class="dh-legend-line" viewBox="0 0 24 4" aria-hidden="true"><line x1="0" y1="2" x2="24" y2="2" style="stroke:${color}"${dashAttr}/></svg>${escapeHtml(variant.name)}</li>`;
    }),
  ].join("");

  const tableRows = family.yearly
    .map((p) => {
      const variantCells = family.variants.map((v) => `<td class="num">${fmt(Number(p[v.name] ?? 0))}</td>`).join("");
      return `<tr><th scope="row">${p.year}</th>${variantCells}<td class="num">${fmt(p.total)}</td></tr>`;
    })
    .join("\n");
  const variantHeads = family.variants.map((v) => `<th scope="col" class="num">${escapeHtml(v.name)}</th>`).join("");

  return `<figure class="dh-chart" data-dh-chart="${escapeHtml(family.id)}">
  <div class="dh-chart-frame">
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeHtml(ariaSummary)}">
      ${gridTop}
      ${axis}
      ${variantSeries.join("\n      ")}
      ${totalLine}
      ${xLabels}
      ${yMaxLabel}
      ${yZeroLabel}
    </svg>
  </div>
  <figcaption>
    <ul class="dh-legend">${legendItems}</ul>
  </figcaption>
  <details class="dh-chart-data">
    <summary>Yearly data for the ${escapeHtml(family.label)} family</summary>
    <table class="table dh-table">
      <caption>Yearly SSA births by spelling variant, ${years[0]}–${years[years.length - 1]}</caption>
      <thead><tr><th scope="col">Year</th>${variantHeads}<th scope="col" class="num">Combined</th></tr></thead>
      <tbody>
${tableRows}
      </tbody>
    </table>
  </details>
</figure>`;
}

export function SpellingFamilyCard(family: SpellingFamilyResult): string {
  const variantRows = family.variants
    .map(
      (v) => `<tr>
  <th scope="row"><a href="${nameHref(v.slug)}" data-dh-name="${escapeHtml(v.name.toLowerCase())}">${escapeHtml(v.name)}</a></th>
  <td class="num">${fmt(v.birthsInDecade)}</td>
  <td class="num">${v.decadeRank === null ? "—" : `#${v.decadeRank}`}</td>
  <td class="num">${pct(v.shareOfFamily)}</td>
</tr>`,
    )
    .join("\n");

  const dominant = family.variants.find((v) => v.name === family.dominantVariant);
  const dominantRank = dominant && dominant.decadeRank !== null ? `#${dominant.decadeRank}` : "outside the ranked table";

  return `<details class="dh-family" id="dh-family-${escapeHtml(family.id)}" data-dh-family="${escapeHtml(family.id)}">
  <summary>
    <span class="dh-family-label">${escapeHtml(family.label)}</span>
    <span class="dh-family-total">${fmt(family.totalBirthsInDecade)} births, __PERIOD__</span>
  </summary>
  <div class="dh-family-body">
    <p class="dh-family-callout">Counted together, the ${escapeHtml(family.label)} spellings would rank <strong>#${family.combinedDecadeRank}</strong> in the decade's rankings for their sex. The most common spelling, ${escapeHtml(family.dominantVariant)}, ranked ${dominantRank} on its own.</p>
    ${SpellingFamilyChart(family)}
    <table class="table dh-table">
      <caption>${escapeHtml(family.label)} spelling variants, ranked separately and as a group</caption>
      <thead><tr><th scope="col">Variant</th><th scope="col" class="num">__DECADE_SLUG__ births</th><th scope="col" class="num">Decade rank</th><th scope="col" class="num">Share of family</th></tr></thead>
      <tbody>
${variantRows}
      </tbody>
    </table>
    <p class="dh-family-rationale"><strong>Why these are grouped:</strong> ${escapeHtml(family.rationale)}</p>
  </div>
</details>`;
}

export function SpellingFamilySummaryCard(family: SpellingFamilyResult): string {
  return `<li class="dh-family-summary">
  <a href="${SPELLING_PATH}#dh-family-${escapeHtml(family.id)}" data-dh-target-id="${HUB_CONTENT_ID}/spelling-families" data-dh-target-type="${CONTENT_TYPE}">${escapeHtml(family.label)}</a>
  <span class="dh-family-total">${fmt(family.totalBirthsInDecade)} births across ${family.variants.length} spellings — combined #${family.combinedDecadeRank}</span>
</li>`;
}

// ── MethodologyCallout / MetricDefinition / DataCoverageBadge ─────────────

export function MethodologyCallout(profile: DecadeProfile): string {
  return `<section class="dh-methodology-callout">
  <h2>How these numbers are made</h2>
  <p>Every figure on this page is computed offline from SSA birth records with methodology <code>${escapeHtml(profile.methodologyVersion)}</code>, then served as a precomputed profile. Nothing is recalculated in your browser.</p>
  __GENERATION_CALL_OUT__
  <p><a href="${METHODOLOGY_PATH}" data-dh-target-id="${HUB_CONTENT_ID}/methodology" data-dh-target-type="${CONTENT_TYPE}">Read the methodology</a></p>
</section>`;
}

export function MetricDefinition(term: string, definitionHtml: string, formulaHtml?: string): string {
  const formula = formulaHtml ? `<dd class="dh-formula"><code>${formulaHtml}</code></dd>` : "";
  return `<div class="dh-metric">
  <dt>${escapeHtml(term)}</dt>
  <dd>${definitionHtml}</dd>
  ${formula}
</div>`;
}

export function DataCoverageBadge(profile: DecadeProfile): string {
  const git = profile.gitCommit ? `<div class="dh-coverage-item"><dt>Build commit</dt><dd><code>${escapeHtml(profile.gitCommit)}</code></dd></div>` : "";
  return `<dl class="dh-coverage" aria-label="Data coverage and build provenance">
  <div class="dh-coverage-item"><dt>Data coverage</dt><dd>Decade ${profile.startYear}–${profile.endYear}; lifetime data through ${profile.dataThroughYear}</dd></div>
  <div class="dh-coverage-item"><dt>Completeness</dt><dd>${profile.isComplete ? "Complete decade" : "Partial decade"}</dd></div>
  <div class="dh-coverage-item"><dt>Methodology version</dt><dd><code>${escapeHtml(profile.methodologyVersion)}</code></dd></div>
  <div class="dh-coverage-item"><dt>Source version</dt><dd><code>${escapeHtml(profile.sourceVersion)}</code></dd></div>
  <div class="dh-coverage-item"><dt>Generated</dt><dd>${escapeHtml(profile.generatedAt)}</dd></div>
  ${git}
</dl>`;
}


export function renderDecadeHubGeneric(profile: DecadeProfile, opts: DecadeRenderOptions): string {
  const c = createDecadeRenderContext(profile, opts);
  const origin = opts.origin;
  const canonical = `${origin}${HUB_PATH}`;
  const female = profile.femaleChampion;
  const male = profile.maleChampion;
  const title = profile.isComplete ? `__DECADE_SLUG__ Baby Names: ${male.name} & ${female.name} Led the Decade | NobodyNamed` : `__DECADE_SLUG__ Baby Names So Far: ${male.name} & ${female.name} | NobodyNamed`;
  const desc = `The most popular __DECADE_SLUG__ girl names and boy names from SSA records — plus the names that truly belonged to the decade, an average __CLASSROOM_YEAR__ classroom, and spelling families.`;

  const thesis = opts.thesis ?? DECADE_THESES[opts.definition.slug];
  const families = profile.spellingFamilies ?? [];

  const body = identityWrap(
    HUB_CONTENT_ID,
    HUB_PATH,
    `${DecadeHero(profile, thesis, c)}
${OwnershipRanking(profile)}
${ClassroomSummary(profile.classroomDefaults)}
<section class="dh-families-summary" data-dh-module="spelling">
  <h2>Spelling families</h2>
  <p>${escapeHtml(SPELLING_FAMILY_COPY_RULE)}</p>
  ${families.length ? `<ul class="dh-family-summary-list">
${families.map((f) => `    ${SpellingFamilySummaryCard(f)}`).join("\n")}
  </ul>
  <p><a href="${SPELLING_PATH}" data-dh-target-id="${HUB_CONTENT_ID}/spelling-families" data-dh-target-type="${CONTENT_TYPE}">Explore all ${families.length} spelling families</a></p>` : `<p>No reviewed spelling families meet the published thresholds for this decade.</p>`}
</section>
${MethodologyCallout(profile)}
${DataCoverageBadge(profile)}`,
  );

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "The names that most belong to the __DECADE_SLUG__, by ownership score",
    itemListOrder: "https://schema.org/ItemListOrderDescending",
    numberOfItems: profile.ownershipRankings.mostOwned.length,
    itemListElement: profile.ownershipRankings.mostOwned.map((r, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: { "@type": "Thing", name: r.name, url: origin + nameHref(r.slug) },
    })),
  };

  return materialize(pageShell({
    title,
    description: desc,
    canonical,
    ogImage: `${origin}/api/og/decade/__DECADE_SLUG__`,
    ogType: "article",
    currentPath: HUB_PATH,
    headerOpts: { navItems: BROWSE_NAV },
    body,
    structuredData: [
      breadcrumb(origin, [{ name: "__DECADE_SLUG__", path: HUB_PATH }]),
      webPage(origin, title, desc, canonical),
      itemList,
    ],
    scripts: ["/assets/app.js"],
    headExtras: DECADE_HUB_SCRIPT,
    footerVariant: "minimal",
    footerYearRange: `1880–${profile.dataThroughYear}`,
  }), c);
}

export function renderDecadeClassroomGeneric(profile: DecadeProfile, opts: DecadeRenderOptions): string {
  const c = createDecadeRenderContext(profile, opts);
  const origin = opts.origin;
  const canonical = `${origin}${CLASSROOM_PATH}`;
  const classroom = profile.classroomDefaults;
  const title = "__CLASSROOM_YEAR__ Classroom Names: An Average 30-Student Roster | NobodyNamed";
  const desc = `A statistical reconstruction of an average __CLASSROOM_YEAR__ American classroom: 30 students apportioned from SSA birth records — ${classroom.uniqueNames} unique names across 30 seats, ${classroom.repeatedNames > 0 ? `${classroom.repeatedNames} of them repeats` : "no name repeated"}.`;
  const rosterOutcome = classroom.repeatedNames > 0
    ? `the roster answers with repeats: ${escapeHtml(classroom.mostRepeated.name)} alone holds ${classroom.mostRepeated.seats} seats`
    : `every one of the 30 seats carries a different name — no name was common enough in __CLASSROOM_YEAR__ to guarantee a duplicate in a class of 30`;

  const body = identityWrap(
    `${HUB_CONTENT_ID}/classroom`,
    CLASSROOM_PATH,
    `<p class="eyebrow">Decade hub · representative classroom</p>
<h1>The __CLASSROOM_YEAR__ classroom</h1>
<p class="lede">What did an average American classroom sound like in __CLASSROOM_YEAR__? Apportion 30 seats across the names actually recorded that year — ${classroom.femaleSeats} girls and ${classroom.maleSeats} boys, matching the real __CLASSROOM_YEAR__ birth distribution — and ${rosterOutcome}.</p>
${DecadeChildNavigation()}
<p class="dh-label">${RECONSTRUCTION_LABEL}</p>
<section class="dh-classroom" data-dh-module="classroom">
  <h2>The roster</h2>
  ${ClassroomStats(classroom)}
  ${ClassroomRoster(classroom)}
  <div class="dh-sentinel" data-dh-sentinel="classroom-bottom" aria-hidden="true"></div>
</section>
<section class="dh-classroom-method">
  <h2>How the roster is generated</h2>
  <p>The reconstruction is deterministic: the same __CLASSROOM_YEAR__ records always produce the same 30 students. Seats are apportioned, not drawn at random.</p>
  <ol>
    <li>The 30 seats are split by sex using the actual __CLASSROOM_YEAR__ national totals: <code>femaleSeats = round(30 × F_total / (F_total + M_total))</code>, with the remainder going to boys. For __CLASSROOM_YEAR__ that yields ${classroom.femaleSeats} girls and ${classroom.maleSeats} boys.</li>
    <li>Within each sex, every name recorded in __CLASSROOM_YEAR__ gets an expected seat count: <code>expected_seats = name_count / sex_total × sexSeats</code>.</li>
    <li>Each name receives the whole-number floor of its expectation; the remaining seats go to the names with the largest fractional remainders. Ties break toward the higher recorded count, then alphabetically.</li>
    <li>Names may repeat — repetition is the point of the reconstruction, and no uniqueness is enforced.</li>
  </ol>
  <p>Every name on the roster was recorded for at least one __CLASSROOM_YEAR__ birth of the matching sex. <a href="${METHODOLOGY_PATH}">Full methodology</a> · <a href="${HUB_PATH}">Back to the __DECADE_SLUG__ hub</a></p>
</section>
${DataCoverageBadge(profile)}`,
  );

  return materialize(pageShell({
    title,
    description: desc,
    canonical,
    ogImage: `${origin}/api/og/default`,
    ogType: "article",
    currentPath: CLASSROOM_PATH,
    headerOpts: { navItems: BROWSE_NAV },
    body,
    structuredData: [
      breadcrumb(origin, [
        { name: "__DECADE_SLUG__", path: HUB_PATH },
        { name: "The __CLASSROOM_YEAR__ classroom", path: CLASSROOM_PATH },
      ]),
      webPage(origin, title, desc, canonical),
    ],
    scripts: ["/assets/app.js"],
    headExtras: DECADE_HUB_SCRIPT,
    footerVariant: "minimal",
    footerYearRange: `1880–${profile.dataThroughYear}`,
  }), c);
}

export function renderDecadeSpellingFamiliesGeneric(profile: DecadeProfile, opts: DecadeRenderOptions): string {
  const c = createDecadeRenderContext(profile, opts);
  const origin = opts.origin;
  const canonical = `${origin}${SPELLING_PATH}`;
  const families = profile.spellingFamilies ?? [];
  const title = "__DECADE_SLUG__ Spelling Families: Combined Name Rankings | NobodyNamed";
  const desc = `Conventional rankings split spelling variants. This view groups ${families.length} hand-reviewed __DECADE_SLUG__ spelling families to show their combined demographic footprint, with yearly charts and rankings.`;

  const body = identityWrap(
    `${HUB_CONTENT_ID}/spelling-families`,
    SPELLING_PATH,
    `<p class="eyebrow">Decade hub · spelling families</p>
<h1>__DECADE_SLUG__ spelling families</h1>
<p class="lede">${escapeHtml(SPELLING_FAMILY_COPY_RULE)}</p>
${DecadeChildNavigation()}
<section class="dh-families" data-dh-module="spelling">
  <h2>Why rankings understate these names</h2>
  <p>A name recorded under several common spellings is counted once per spelling in conventional tables, so each variant ranks lower than the combined phenomenon. The families below are not inferred by an algorithm: every grouping was reviewed by hand, ships only when at least two variants each cleared 1,000 recorded __DECADE_SLUG__ births with a combined 20,000 or more, and is documented with its rationale. Variants are related spellings, not interchangeable names.</p>
  ${families.length ? families.map((f) => SpellingFamilyCard(f)).join("\n  ") : "<p>No manually reviewed spelling family met the published thresholds for this decade.</p>"}
  <p><a href="${METHODOLOGY_PATH}" data-dh-methodology="spelling">How families are curated</a> · <a href="${HUB_PATH}">Back to the __DECADE_SLUG__ hub</a></p>
</section>
${DataCoverageBadge(profile)}`,
  );

  return materialize(pageShell({
    title,
    description: desc,
    canonical,
    ogImage: `${origin}/api/og/default`,
    ogType: "article",
    currentPath: SPELLING_PATH,
    headerOpts: { navItems: BROWSE_NAV },
    body,
    structuredData: [
      breadcrumb(origin, [
        { name: "__DECADE_SLUG__", path: HUB_PATH },
        { name: "Spelling families", path: SPELLING_PATH },
      ]),
      webPage(origin, title, desc, canonical),
    ],
    scripts: ["/assets/app.js"],
    headExtras: DECADE_HUB_SCRIPT,
    footerVariant: "minimal",
    footerYearRange: `1880–${profile.dataThroughYear}`,
  }), c);
}

// ── Methodology page ──────────────────────────────────────────────────────

export function renderDecadeMethodologyGeneric(profile: DecadeProfile, opts: DecadeRenderOptions): string {
  const c = createDecadeRenderContext(profile, opts);
  const origin = opts.origin;
  const canonical = `${origin}${METHODOLOGY_PATH}`;
  const title = "How We Rank __DECADE_SLUG__ Baby Names: Methodology | NobodyNamed";
  const desc = "Data source, coverage, eligibility rules, ownership-score formulas, classroom reconstruction, and spelling-family curation for the NobodyNamed __DECADE_SLUG__ decade hub.";
  const alpha = fmt(profile.alpha);

  const ownershipMetrics = [
    MetricDefinition(
      "Raw concentration",
      "The share of a name's recorded lifetime births that occurred in __PERIOD__. Kept in the data for transparency, but never presented as the score on its own.",
      "raw_concentration = births_in_decade / lifetime_births",
    ),
    MetricDefinition(
      "Prior decade share",
      `The baseline concentration of the whole eligible set, computed separately for the female and male comparison sets (two priors). The shrinkage step applies each sex's own prior: ${(profile.priorDecadeShareFemale * 100).toFixed(2)}% for girls, ${(profile.priorDecadeShareMale * 100).toFixed(2)}% for boys. The pooled reference value is ${(profile.priorDecadeShare * 100).toFixed(2)}%.`,
      "prior_decade_share = Σ births_in_decade (eligible set) / Σ lifetime_births (eligible set), computed per sex",
    ),
    MetricDefinition(
      "Adjusted concentration",
      `Empirical-Bayes-style shrinkage toward the prior, so a low-volume name cannot top the table on a lucky ratio. The smoothing strength α = ${alpha} was chosen by sensitivity testing, not arbitrarily (see below).`,
      `adjusted_concentration = (births_in_decade + α × prior_decade_share) / (lifetime_births + α), α = ${alpha}`,
    ),
    MetricDefinition(
      "Raw prominence",
      "How visible the name was during the decade, on a log scale so that sheer size matters but does not dominate.",
      "raw_prominence = ln(1 + births_in_decade)",
    ),
    MetricDefinition(
      "Normalization",
      "Both prominence and adjusted concentration are min-max normalized within each sex's eligible set, so each component lands on a 0–1 scale.",
      "normalized_x = (x − min(x)) / (max(x) − min(x)), over the eligible set of that sex",
    ),
    MetricDefinition(
      "Ownership score",
      "The final score weights concentration (identity) at 70% and prominence (visibility) at 30%. Data retains four decimal places; this site rounds for display only.",
      "ownership_score = 100 × (0.70 × normalized_concentration + 0.30 × normalized_prominence)",
    ),
  ].join("\n");

  const diversityMetrics = [
    MetricDefinition(
      "Name share",
      "Every name-and-sex row's share of all recorded births in the decade, pooled across sexes.",
      "p_i = births_i / total_births",
    ),
    MetricDefinition(
      "Shannon entropy",
      "How evenly births are spread across names. Higher means more even.",
      "H = −Σ (p_i × ln(p_i))",
    ),
    MetricDefinition(
      "Effective number of names",
      `The headline diversity figure: the number of equally common names that would produce the same entropy. For the __DECADE_SLUG__, ${fmt(Math.round(profile.effectiveNames))}.`,
      "N_eff = exp(H)",
    ),
    MetricDefinition(
      "Diversity score",
      `Entropy normalized to 0–100 against the maximum possible entropy for ${fmt(profile.distinctNames)} distinct name-and-sex rows. The __DECADE_SLUG__ scores ${profile.diversityScore.toFixed(1)}.`,
      "diversity_score = 100 × H / ln(N_distinct)",
    ),
    MetricDefinition(
      "Concentration score",
      `A Herfindahl index normalized so 0 means perfectly diffuse and 100 means one name takes every birth. The __DECADE_SLUG__ scores ${profile.concentrationScore.toFixed(1)}.`,
      "HHI = Σ p_i²; concentration_score = 100 × (HHI − 1/N) / (1 − 1/N)",
    ),
  ].join("\n");

  const body = identityWrap(
    `${HUB_CONTENT_ID}/methodology`,
    METHODOLOGY_PATH,
    `<p class="eyebrow">Decade hub · methodology</p>
<h1>Methodology: the __DECADE_SLUG__ decade hub</h1>
<p class="lede">Exactly what every number on this hub measures, how it is computed, and where the data falls short. Written for a general reader; formulas included in full.</p>
${DecadeChildNavigation()}
${DataCoverageBadge(profile)}

<section class="dh-method-section">
  <h2>What the ownership score measures — and what it does not</h2>
  <p>The ownership score is a descriptive statistic about recorded births. It ranks names by how concentrated their recorded history is inside __PERIOD__, adjusted so rare names cannot dominate, and weighted by how visible the name actually was. It does not measure why parents chose a name, what a name meant culturally, or anything about the people who carry it. A high score means one thing only: an unusually large share of this name's recorded use happened in this decade, given its size.</p>
</section>

<section class="dh-method-section">
  <h2>Data source and coverage</h2>
  <p>All figures derive from U.S. Social Security Administration national birth records, __START_YEAR__ through __END_YEAR__ — ${profile.isComplete ? "a complete decade" : "a partial decade"} in the current dataset, which runs through ${profile.dataThroughYear}. Rankings, ownership scores, the classroom, and spelling families are computed offline from the same source and served as a precomputed profile; nothing is recalculated in your browser.</p>
  <h3>Source limitations</h3>
  <ul>
    <li>The SSA suppresses name-and-sex counts below 5 per year, so very rare names are under-counted everywhere on this hub.</li>
    <li>Records reflect sex as recorded at birth, in two categories; they are not a record of gender identity.</li>
    <li>Coverage is national only — no state or regional breakdown is used here.</li>
    <li>“Lifetime” births mean recorded births from 1880 through ${profile.dataThroughYear}, the SSA file's own span, not all of history.</li>
  </ul>
</section>

<section class="dh-method-section">
  <h2>Eligibility</h2>
  <p>Female and male records are separate comparison sets end to end; a name recorded for both sexes is scored independently in each. A name-and-sex pair is eligible for ownership ranking if it meets either condition:</p>
  <ul>
    <li>at least 5,000 recorded births during __PERIOD__, or</li>
    <li>a top-1,000 national rank for its sex in at least five distinct years of __PERIOD__.</li>
  </ul>
</section>

<section class="dh-method-section">
  <h2>The ownership score, formula by formula</h2>
  <dl class="dh-metrics">
${ownershipMetrics}
  </dl>
  <h3>Choosing α</h3>
  <p>α controls how strongly low-volume names are pulled toward the prior. Candidate values 500, 1,000, 2,500, 5,000, and 10,000 were compared with a sensitivity script that tabulates the top 25 at each value, rank churn between values, and intrusions by names with fewer than 5,000 decade births. The selected value, α = ${alpha}, is the smallest candidate with zero low-volume intrusions in the top 25 that preserved intuitive ordering among substantial names.</p>
  <h3>Ties and ranking views</h3>
  <p>All sorts are deterministic: ties break toward higher __DECADE_SLUG__ births, then alphabetically. The ranking views are fixed rules, not editorial picks: Most Owned sorts by ownership score; Most Popular by decade births; Popular but Timeless keeps names at or above the median births of the pooled eligible set (both sexes) and at or below its 25th percentile of adjusted concentration; Unexpected Results keeps names whose popularity rank exceeds their ownership rank by 20 or more within their sex set.</p>
</section>

<section class="dh-method-section">
  <h2>Diversity and concentration</h2>
  <dl class="dh-metrics">
${diversityMetrics}
  </dl>
  <p>Pooling note: shares are computed over name-and-sex rows pooled across both sexes, so “Michael, boys” and “Michael, girls” are separate entries. Top-10 and top-100 shares use the same pooled table.</p>
</section>

<section class="dh-method-section">
  <h2>The __CLASSROOM_YEAR__ classroom</h2>
  <p>The classroom is a statistical reconstruction of an average classroom, not an actual class record. It uses the year __CLASSROOM_YEAR__, 30 seats, and national records. Seat allocation:</p>
  <ol>
    <li><code>femaleSeats = round(30 × F_total / (F_total + M_total))</code> from actual __CLASSROOM_YEAR__ totals; boys take the remainder (for __CLASSROOM_YEAR__: ${profile.classroomDefaults.femaleSeats} / ${profile.classroomDefaults.maleSeats}).</li>
    <li><code>expected_seats_i = count_i / sex_total × sexSeats</code> for every name recorded in __CLASSROOM_YEAR__.</li>
    <li>Whole seats are floored; the leftovers are distributed by largest remainder, ties broken by higher count, then alphabetically. If rounding still leaves a gap, the alphabetically first maximal-remainder name is adjusted — deterministic either way.</li>
  </ol>
  <p>Repeated names are expected and are not suppressed. The same inputs always produce the same roster.</p>
</section>

<section class="dh-method-section">
  <h2>Spelling families</h2>
  <p>${escapeHtml(SPELLING_FAMILY_COPY_RULE)}</p>
  <p>Families come from one manually reviewed curation file — there is no automatic clustering. A family ships only with review status “approved”, at least two variants each recording 1,000 or more __DECADE_SLUG__ births, and a combined 20,000 or more. A variant may appear in only one approved family. The combined decade rank is where the family's summed births would sit in the decade's per-sex rankings; each variant's own rank is shown alongside.</p>
</section>

<section class="dh-method-section">
  <h2>Missing and suppressed data</h2>
  <p>Years in which a name falls below the SSA's five-birth suppression threshold contribute zero to that name's counts here — the suppression means the true count is unknown, between zero and four. Names with no recorded __DECADE_SLUG__ births are absent rather than zeroed. Status labels reuse this site's existing name-status taxonomy and read “unknown” where no status is on record.</p>
</section>

<section class="dh-method-section">
  <h2>Updates and versioning</h2>
  <p>This profile is regenerated when the SSA releases a new annual vintage. Any change to a formula bumps the methodology version; the version, build timestamp, source vintage, and build commit (when available) are rendered from the payload itself at the top of this page.</p>
  <p><a href="${HUB_PATH}">Back to the __DECADE_SLUG__ hub</a></p>
</section>`,
  );

  const dataset = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "NobodyNamed __DECADE_SLUG__ decade hub profile",
    description: "Precomputed __PERIOD__ baby-name aggregates: ownership rankings, diversity and concentration statistics, a __CLASSROOM_YEAR__ classroom reconstruction, and hand-reviewed spelling families, derived from SSA national birth records.",
    url: canonical,
    temporalCoverage: "__START_YEAR__/__END_YEAR__",
    version: profile.methodologyVersion,
    dateModified: profile.generatedAt.slice(0, 10),
    creator: PUBLISHER_ORG,
    isBasedOn: {
      "@type": "Dataset",
      name: "Social Security Administration national baby name data",
      url: "https://www.ssa.gov/oact/babynames/limits.html",
    },
  };

  return materialize(pageShell({
    title,
    description: desc,
    canonical,
    ogImage: `${origin}/api/og/default`,
    ogType: "article",
    currentPath: METHODOLOGY_PATH,
    headerOpts: { navItems: BROWSE_NAV },
    body,
    structuredData: [
      breadcrumb(origin, [
        { name: "__DECADE_SLUG__", path: HUB_PATH },
        { name: "Methodology", path: METHODOLOGY_PATH },
      ]),
      webPage(origin, title, desc, canonical),
      dataset,
    ],
    scripts: ["/assets/app.js"],
    headExtras: DECADE_HUB_SCRIPT,
    footerVariant: "minimal",
    footerYearRange: `1880–${profile.dataThroughYear}`,
  }), c);
}
