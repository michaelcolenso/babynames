// Route tests for the 1980s decade hub (SPEC §11, Coder B checklist).
//
// Imports the Pages Function handlers directly and serves them a hand-built
// fixture payload through a fake D1, following the pattern of
// scripts/editorial-pages.test.ts. The fixture is illustrative (Stage 4
// regenerates it from real build output): note its `unexpected` view deltas
// are smaller than the production >= 20 rule because a 12-name-per-sex
// fixture cannot produce a 20-rank gap, and its classroom includes repeats
// on purpose so both roster states are exercised here.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { onRequestGet as decadeIndexGet } from "../apps/web/functions/names/[decade]/index";
import { onRequestGet as methodologyGet } from "../apps/web/functions/names/[decade]/methodology/index";
import { onRequestGet as classroomGet } from "../apps/web/functions/names/[decade]/classroom/index";
import { onRequestGet as spellingGet } from "../apps/web/functions/names/[decade]/spelling-families/index";
import { onRequestGet as sitemapGet } from "../apps/web/functions/sitemap.xml";

const FIXTURE = JSON.parse(
  readFileSync(new URL("./fixtures/decade-hub-1980.fixture.json", import.meta.url), "utf8"),
);

interface FakeDbOptions {
  hubPayload?: string | null;
  hubThrows?: boolean;
  decadeRows?: { name: string; sex: "F" | "M"; decade_total: number; rank: number }[];
  initialRows?: { name: string; sex: "F" | "M"; total_count: number; peak_year: number; latest_count: number; status: string; rank: number }[];
  minYear?: string;
  maxYear?: string;
}

function fakeDb({
  hubPayload = JSON.stringify(FIXTURE),
  hubThrows = false,
  decadeRows = [
    { name: "Jessica", sex: "F", decade_total: 469439, rank: 1 },
    { name: "Jennifer", sex: "F", decade_total: 440859, rank: 2 },
    { name: "Michael", sex: "M", decade_total: 663592, rank: 1 },
    { name: "Christopher", sex: "M", decade_total: 532418, rank: 2 },
  ],
  initialRows = [
    { name: "Ashley", sex: "F", total_count: 853000, peak_year: 1987, latest_count: 1200, status: "stable", rank: 1 },
    { name: "Andrew", sex: "M", total_count: 640000, peak_year: 1989, latest_count: 900, status: "stable", rank: 1 },
  ],
  minYear = "1880",
  maxYear = "2017",
}: FakeDbOptions = {}) {
  return {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          if (/FROM decade_hub/.test(sql)) {
            return {
              async first<T>() {
                if (hubThrows) throw new Error("no such table: decade_hub");
                if (hubPayload === null) return null;
                return { payload: hubPayload } as T;
              },
            };
          }
          if (/FROM meta/.test(sql)) {
            return {
              async first<T>() {
                const key = String(values[0]);
                const value = key === "min_year" ? minYear : key === "max_year" ? maxYear : "test-version";
                return { value } as T;
              },
            };
          }
          if (/decade_total/.test(sql)) {
            return {
              async all<T>() {
                return { results: decadeRows as T[] };
              },
            };
          }
          // topByInitial / listIndexableNames / listBlogPosts and any other
          // .all() consumer (sitemap name + blog queries expect empty here).
          return {
            async all<T>() {
              const isInitialQuery = /FROM names\s/.test(sql) && /name_lower >=/.test(sql);
              return { results: (isInitialQuery ? initialRows : []) as T[] };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

function ctxFor(handler: (ctx: never) => Promise<Response>, path: string, decade: string, db: D1Database) {
  return handler({
    params: { decade },
    request: new Request(`https://example.com${path}`),
    env: { DB: db },
  } as never);
}

const getHub = (path: string, decade: string, db: D1Database) => ctxFor(decadeIndexGet, path, decade, db);
const getMethodology = (path: string, decade: string, db: D1Database) => ctxFor(methodologyGet, path, decade, db);
const getClassroom = (path: string, decade: string, db: D1Database) => ctxFor(classroomGet, path, decade, db);
const getSpelling = (path: string, decade: string, db: D1Database) => ctxFor(spellingGet, path, decade, db);

function jsonLdBlocks(html: string): unknown[] {
  const match = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
  assert.ok(match, "expected an application/ld+json block");
  return JSON.parse(match[1]!) as unknown[];
}

function jsonLdTypes(html: string): string[] {
  return jsonLdBlocks(html).map((block) => String((block as { "@type"?: string })["@type"]));
}

function metaContent(html: string, attr: string, value: string): string | null {
  const re = new RegExp(`<meta ${attr}="${value}" content="([^"]*)">`);
  return re.exec(html)?.[1] ?? null;
}

function assertSingleH1(html: string) {
  assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1, "expected exactly one h1");
}

function assertA11yBasics(html: string, { expectTables = true }: { expectTables?: boolean } = {}) {
  assertSingleH1(html);
  assert.match(html, /class="skip-link"/, "skip-link should be present via the shell");
  if (expectTables) {
    assert.match(html, /<th scope="col"/, "column headers should carry scope");
    assert.match(html, /<caption>/, "tables should carry captions");
  } else {
    assert.doesNotMatch(html, /<th(?![^>]*scope=)/, "any th present must carry scope");
  }
}

// ── Hub route ──────────────────────────────────────────────────────────────

test("hub renders 200 with SSR ownership table, canonicals, and metadata", async () => {
  const response = await getHub("/names/1980s/", "1980s", fakeDb());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Link"), "<https://example.com/names/1980s/>; rel=\"canonical\"");
  assert.match(response.headers.get("Cache-Control") ?? "", /s-maxage=604800/);

  const html = await response.text();
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.com\/names\/1980s\/">/);
  assert.match(html, /<title>1980s Baby Names: Michael &amp; Jessica Led the Decade \| NobodyNamed<\/title>/);
  assert.ok(metaContent(html, "name", "description")?.includes("1980s girl names"));
  assert.match(html, /property="og:title"/);
  assert.match(html, /<meta property="og:image" content="https:\/\/example\.com\/api\/og\/decade\/1980s">/);

  // SSR-first: the ownership table is fully present without JS, and the dead
  // legacy hydration hook is gone from the 1980s branch.
  assert.match(html, /<table class="table dh-table">/);
  assert.match(html, /aria-label="Ownership ranking views"/);
  assert.match(html, /data-dh-tab="girls"/);
  assert.match(html, /data-dh-panel="unexpected"/);
  assert.doesNotMatch(html, /renderDecadeTable/);
  assert.doesNotMatch(html, /nv-decade-data/);

  // Top ownership rows come straight from the payload (fixture: Tiffany #1 F).
  assert.match(html, /<th scope="row"><a href="\/name\/Tiffany\/" data-dh-name="tiffany">Tiffany<\/a><\/th>/);

  // Internal links: all ten year pages, adjacent decades, methodology, children.
  for (let y = 1980; y <= 1989; y++) {
    assert.match(html, new RegExp(`href="/year/${y}/"`), `year link ${y}`);
  }
  assert.match(html, /href="\/names\/1970s\/"/);
  assert.match(html, /href="\/names\/1990s\/"/);
  assert.match(html, /href="\/names\/1980s\/methodology\/"/);
  assert.match(html, /href="\/names\/1980s\/classroom\/"/);
  assert.match(html, /href="\/names\/1980s\/spelling-families\/"/);

  // Content identity drives the auto-pageview beacon.
  assert.match(html, /data-content-id="decade-hub:1980s"/);
  assert.match(html, /data-content-type="decade-hub"/);

  assertA11yBasics(html);
});

test("hub JSON-LD parses and includes BreadcrumbList, WebPage, and ItemList", async () => {
  const response = await getHub("/names/1980s/", "1980s", fakeDb());
  const html = await response.text();
  const types = jsonLdTypes(html);
  assert.ok(types.includes("BreadcrumbList"));
  assert.ok(types.includes("WebPage"));
  assert.ok(types.includes("ItemList"));

  const blocks = jsonLdBlocks(html) as Record<string, unknown>[];
  const itemList = blocks.find((b) => b["@type"] === "ItemList") as {
    numberOfItems: number;
    itemListElement: { position: number; item: { name: string; url: string } }[];
  };
  assert.equal(itemList.numberOfItems, 24);
  assert.equal(itemList.itemListElement[0]!.item.name, "Tiffany");
  assert.equal(itemList.itemListElement[0]!.item.url, "https://example.com/name/Tiffany/");
});

test("hub falls back to the legacy decade page when the decade_hub row is missing", async () => {
  const response = await getHub("/names/1980s/", "1980s", fakeDb({ hubPayload: null }));
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<h1>1980s baby names<\/h1>/);
  assert.match(html, /year-name-list/);
  // The legacy branch keeps its (dead) hydration hook — only the hub branch drops it.
  assert.match(html, /renderDecadeTable/);
  assert.doesNotMatch(html, /dh-table/);
});

test("hub falls back to the legacy page when the decade_hub query throws (pre-migration)", async () => {
  const response = await getHub("/names/1980s/", "1980s", fakeDb({ hubThrows: true }));
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<h1>1980s baby names<\/h1>/);
  assert.doesNotMatch(html, /dh-table/);
});

test("hub falls back to the legacy page when the payload is malformed", async () => {
  const response = await getHub("/names/1980s/", "1980s", fakeDb({ hubPayload: "{\"decade\":1970}" }));
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<h1>1980s baby names<\/h1>/);
});

test("other decades keep the legacy page even when the hub row exists", async () => {
  const response = await getHub("/names/1970s/", "1970s", fakeDb());
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<h1>1970s baby names<\/h1>/);
  assert.doesNotMatch(html, /dh-table/);
});

test("single-letter /names/:initial/ behavior is preserved", async () => {
  const response = await getHub("/names/a/", "a", fakeDb());
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<h1>Baby names that start with A<\/h1>/);
  assert.match(html, /href="\/name\/Ashley\/"/);
});

// ── Methodology route ──────────────────────────────────────────────────────

test("methodology renders formulas, provenance, and Dataset JSON-LD", async () => {
  const response = await getMethodology("/names/1980s/methodology/", "1980s", fakeDb());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Link"), "<https://example.com/names/1980s/methodology/>; rel=\"canonical\"");

  const html = await response.text();
  assert.match(html, /<title>How We Rank 1980s Baby Names: Methodology \| NobodyNamed<\/title>/);
  assert.ok(metaContent(html, "name", "description"));
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.com\/names\/1980s\/methodology\/">/);

  // Exact formulas visible in HTML (SPEC §8).
  assert.match(html, /raw_concentration = births_in_decade \/ lifetime_births/);
  assert.match(html, /adjusted_concentration = \(births_in_decade \+ α × prior_decade_share\) \/ \(lifetime_births \+ α\), α = 1,000/);
  assert.match(html, /raw_prominence = ln\(1 \+ births_in_decade\)/);
  assert.match(html, /ownership_score = 100 × \(0\.70 × normalized_concentration \+ 0\.30 × normalized_prominence\)/);
  assert.match(html, /H = −Σ \(p_i × ln\(p_i\)\)/);
  assert.match(html, /N_eff = exp\(H\)/);
  assert.match(html, /concentration_score = 100 × \(HHI − 1\/N\) \/ \(1 − 1\/N\)/);
  assert.match(html, /femaleSeats = round\(30 × F_total \/ \(F_total \+ M_total\)\)/);

  // Per-sex priors from payload + pooled reference.
  assert.match(html, /30\.39% for girls/);
  assert.match(html, /13\.74% for boys/);
  assert.match(html, /pooled reference value is 18\.17%/);

  // Provenance rendered from payload; coverage never beyond dataThroughYear.
  assert.match(html, /decade-hub\/v1\.0\.0/);
  assert.match(html, /ssa-national-2017/);
  assert.match(html, /2026-06-01T00:00:00\.000Z/);
  assert.match(html, /lifetime data through 2017/);
  assert.doesNotMatch(html, /through 2024/);

  // Limitations + verbatim curation copy.
  assert.match(html, /suppresses name-and-sex counts below 5/);
  assert.match(html, /Conventional rankings separate spelling variants\. This view groups manually reviewed variants to show their combined demographic footprint\./);

  const types = jsonLdTypes(html);
  assert.ok(types.includes("BreadcrumbList"));
  assert.ok(types.includes("WebPage"));
  assert.ok(types.includes("Dataset"));

  assertA11yBasics(html, { expectTables: false });
  assert.match(html, /data-content-id="decade-hub:1980s\/methodology"/);
});

// ── Classroom route ────────────────────────────────────────────────────────

test("classroom renders the full 30-student roster with repeats and reconstruction label", async () => {
  const response = await getClassroom("/names/1980s/classroom/", "1980s", fakeDb());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Link"), "<https://example.com/names/1980s/classroom/>; rel=\"canonical\"");

  const html = await response.text();
  assert.match(html, /<title>1984 Classroom Names: An Average 30-Student Roster \| NobodyNamed<\/title>/);
  assert.match(html, /A statistical reconstruction of an average classroom, not an actual class record\./);

  // 30 seat cards, repeats highlighted with ×N badges (not color-only).
  assert.equal((html.match(/<li class="dh-student/g) ?? []).length, 30);
  assert.match(html, /aria-label="3 students named Jennifer">×3<\/span>/);
  assert.match(html, /dh-student--repeat/);
  assert.match(html, /data-dh-sentinel="classroom-bottom"/);
  assert.match(html, /href="\/name\/Jennifer\/" data-dh-name="jennifer" data-dh-seats="3"/);

  // Summary stats from payload.
  assert.match(html, /<dt>Unique names<\/dt><dd>22<\/dd>/);
  assert.match(html, /<dt>Repeated seats<\/dt><dd>8<\/dd>/);

  assertA11yBasics(html);
  assert.match(html, /data-content-id="decade-hub:1980s\/classroom"/);
});

test("classroom handles the zero-repeat state as first-class copy", async () => {
  const noRepeats = JSON.parse(JSON.stringify(FIXTURE));
  noRepeats.classroomDefaults.uniqueNames = 30;
  noRepeats.classroomDefaults.repeatedNames = 0;
  noRepeats.classroomDefaults.mostRepeated = { name: "Michael", slug: "Michael", seats: 1 };
  noRepeats.classroomDefaults.topShare = 1 / 30;
  // 30 distinct names, one seat each — the real-data apportionment outcome.
  const girlNames = ["Jessica", "Jennifer", "Amanda", "Ashley", "Sarah", "Stephanie", "Nicole", "Elizabeth", "Heather", "Megan", "Melissa", "Tiffany", "Michelle", "Amber", "Christina"];
  const boyNames = ["Michael", "Christopher", "Matthew", "Joshua", "David", "James", "Daniel", "Robert", "John", "Joseph", "Jason", "Justin", "Ryan", "Brian", "William"];
  noRepeats.classroomDefaults.students = [
    ...girlNames.map((name) => ({ name, slug: name, sex: "F", seats: 1 })),
    ...boyNames.map((name) => ({ name, slug: name, sex: "M", seats: 1 })),
  ];

  const response = await getClassroom("/names/1980s/classroom/", "1980s", fakeDb({ hubPayload: JSON.stringify(noRepeats) }));
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Every seat carries a different name — no name was common enough in 1984 to guarantee a duplicate in a class of 30\./);
  assert.doesNotMatch(html, /dh-student--repeat/);
  assert.doesNotMatch(html, /×3<\/span>/);
});

test("classroom renders a unique-name (non-expanded) roster payload correctly", async () => {
  // Defensive path: students arrive as unique names with seat counts.
  const compact = JSON.parse(JSON.stringify(FIXTURE));
  compact.classroomDefaults.students = [
    { name: "Jennifer", slug: "Jennifer", sex: "F", seats: 3 },
    { name: "Michael", slug: "Michael", sex: "M", seats: 3 },
    { name: "Ashley", slug: "Ashley", sex: "F", seats: 2 },
    { name: "Amanda", slug: "Amanda", sex: "F", seats: 1 },
  ];

  const response = await getClassroom("/names/1980s/classroom/", "1980s", fakeDb({ hubPayload: JSON.stringify(compact) }));
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.equal((html.match(/<li class="dh-student/g) ?? []).length, 9, "3+3+2+1 seats should render as 9 cards");
  assert.match(html, /aria-label="3 students named Jennifer"/);
});

// ── Spelling families route ────────────────────────────────────────────────

test("spelling families render verbatim copy rule, charts, and tabular fallbacks", async () => {
  const response = await getSpelling("/names/1980s/spelling-families/", "1980s", fakeDb());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Link"), "<https://example.com/names/1980s/spelling-families/>; rel=\"canonical\"");

  const html = await response.text();
  assert.match(html, /<title>1980s Spelling Families: Combined Name Rankings \| NobodyNamed<\/title>/);
  assert.match(html, /Conventional rankings separate spelling variants\. This view groups manually reviewed variants to show their combined demographic footprint\./);

  // Both fixture families present with combined-rank callouts.
  assert.match(html, /id="dh-family-brittany" data-dh-family="brittany"/);
  assert.match(html, /id="dh-family-caitlin" data-dh-family="caitlin"/);
  assert.match(html, /would rank <strong>#9<\/strong>/);
  assert.match(html, /would rank <strong>#28<\/strong>/);

  // Accessible charts: svg role=img with a summary + a mirrored data table.
  assert.equal((html.match(/role="img" aria-label="Line chart of yearly births/g) ?? []).length, 2);
  assert.equal((html.match(/<details class="dh-chart-data">/g) ?? []).length, 2);
  assert.match(html, /<caption>Yearly SSA births by spelling variant, 1980–1989<\/caption>/);

  // Variant links carry dossier hrefs + analytics attributes.
  assert.match(html, /href="\/name\/Brittney\/" data-dh-name="brittney"/);

  assertA11yBasics(html);
  assert.match(html, /data-content-id="decade-hub:1980s\/spelling-families"/);
});

// ── Child route guards ─────────────────────────────────────────────────────

test("child routes 404 for non-1980s decades", async () => {
  for (const get of [getMethodology, getClassroom, getSpelling]) {
    const response = await get("/names/1970s/methodology/", "1970s", fakeDb());
    assert.equal(response.status, 404);
  }
});

test("child routes 404 when the decade_hub row is missing", async () => {
  const db = fakeDb({ hubPayload: null });
  for (const [get, path] of [
    [getMethodology, "/names/1980s/methodology/"],
    [getClassroom, "/names/1980s/classroom/"],
    [getSpelling, "/names/1980s/spelling-families/"],
  ] as const) {
    const response = await get(path, "1980s", db);
    assert.equal(response.status, 404);
  }
});

// ── Sitemap ────────────────────────────────────────────────────────────────

test("sitemap includes the three decade-hub child routes", async () => {
  const response = await sitemapGet({
    request: new Request("https://example.com/sitemap.xml"),
    env: { DB: fakeDb() },
  } as never);
  assert.equal(response.status, 200);
  const xml = await response.text();
  assert.match(xml, /<loc>https:\/\/example\.com\/names\/1980s\/methodology\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/example\.com\/names\/1980s\/classroom\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/example\.com\/names\/1980s\/spelling-families\/<\/loc>/);
  // Hub itself stays in the decade list exactly once.
  assert.equal((xml.match(/<loc>https:\/\/example\.com\/names\/1980s\/<\/loc>/g) ?? []).length, 1);
});
