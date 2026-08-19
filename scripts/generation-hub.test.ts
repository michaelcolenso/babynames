// Generation hub tests: registry sanity, request-time computation, route
// rendering, sitemap integration, and the static-page era links.
//
// Follows the fixture-D1 pattern of scripts/decade-hub-routes.test.ts: the
// Pages Functions handler is imported directly and served a hand-built fixture
// through a fake D1. Fixture numbers are recomputed by hand below.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { D1Database } from "@cloudflare/workers-types";

import { onRequestGet as decadeIndexGet } from "../apps/web/functions/names/[decade]/index";
import { GENERATION_DEFINITIONS, getGenerationDefinition } from "../packages/shared/src/content/generation-definitions";
import { DECADE_HUB_DEFINITIONS } from "../packages/shared/src/content/decade-hub-definitions";
import { buildIndexableRoutes } from "../packages/shared/src/indexable-routes";
import { loadGenerationHubProfile, SIGNATURE_LIFETIME_FLOOR } from "../packages/shared/src/generation-hub-compute";

// ── Fixture data (hand-recomputed) ─────────────────────────────────────────
//
// Millennial window 1981–1996 (16 years). year_totals: 1,000,000 per sex per
// year → 16,000,000 girls + 16,000,000 boys = 32,000,000 recorded births.
// windowShare = window_total / lifetime_total:
//   F Jessica  350,000/500,000   = 0.700
//   F Ashley   300,000/450,000   = 0.667
//   F Amanda   250,000/300,000   = 0.833
//   F Sarah    200,000/1,000,000 = 0.200
//   F Tiffany  100,000/120,000   = 0.833  (tie with Amanda → Amanda first by rank)
//   M Michael  450,000/2,000,000 = 0.225
//   M Christopher 400,000/900,000 = 0.444
//   M Matthew  350,000/800,000   = 0.438
//   M Joshua   300,000/650,000   = 0.462
//   M Dustin   150,000/170,000   = 0.882
const MILLENNIAL_ROWS = [
  { name: "Jessica", sex: "F", window_total: 350_000, lifetime_total: 500_000, rank: 1 },
  { name: "Ashley", sex: "F", window_total: 300_000, lifetime_total: 450_000, rank: 2 },
  { name: "Amanda", sex: "F", window_total: 250_000, lifetime_total: 300_000, rank: 3 },
  { name: "Sarah", sex: "F", window_total: 200_000, lifetime_total: 1_000_000, rank: 4 },
  { name: "Tiffany", sex: "F", window_total: 100_000, lifetime_total: 120_000, rank: 5 },
  { name: "Michael", sex: "M", window_total: 450_000, lifetime_total: 2_000_000, rank: 1 },
  { name: "Christopher", sex: "M", window_total: 400_000, lifetime_total: 900_000, rank: 2 },
  { name: "Matthew", sex: "M", window_total: 350_000, lifetime_total: 800_000, rank: 3 },
  { name: "Joshua", sex: "M", window_total: 300_000, lifetime_total: 650_000, rank: 4 },
  { name: "Dustin", sex: "M", window_total: 150_000, lifetime_total: 170_000, rank: 5 },
];

// Gen X window 1965–1980 (comparison baseline for the Millennial hub).
const GEN_X_ROWS = [
  { name: "Jennifer", sex: "F", window_total: 400_000, lifetime_total: 800_000, rank: 1 },
  { name: "Lisa", sex: "F", window_total: 300_000, lifetime_total: 700_000, rank: 2 },
  { name: "Michael", sex: "M", window_total: 600_000, lifetime_total: 2_200_000, rank: 1 },
  { name: "Jason", sex: "M", window_total: 450_000, lifetime_total: 900_000, rank: 2 },
];

// Boomer window 1946–1964 (19 years → 19,000,000 per sex = 38,000,000 total).
const BOOMER_ROWS = [
  { name: "Mary", sex: "F", window_total: 700_000, lifetime_total: 4_000_000, rank: 1 },
  { name: "Linda", sex: "F", window_total: 650_000, lifetime_total: 900_000, rank: 2 },
  { name: "Patricia", sex: "F", window_total: 600_000, lifetime_total: 950_000, rank: 3 },
  { name: "Susan", sex: "F", window_total: 550_000, lifetime_total: 800_000, rank: 4 },
  { name: "Barbara", sex: "F", window_total: 520_000, lifetime_total: 900_000, rank: 5 },
  { name: "James", sex: "M", window_total: 800_000, lifetime_total: 4_200_000, rank: 1 },
  { name: "Robert", sex: "M", window_total: 780_000, lifetime_total: 4_100_000, rank: 2 },
  { name: "John", sex: "M", window_total: 750_000, lifetime_total: 4_000_000, rank: 3 },
  { name: "Michael", sex: "M", window_total: 700_000, lifetime_total: 2_200_000, rank: 4 },
  { name: "David", sex: "M", window_total: 650_000, lifetime_total: 2_800_000, rank: 5 },
];

// Silent window 1928–1945 (baseline for the Boomer hub).
const SILENT_ROWS = [
  { name: "Mary", sex: "F", window_total: 550_000, lifetime_total: 3_900_000, rank: 1 },
  { name: "Robert", sex: "M", window_total: 500_000, lifetime_total: 4_000_000, rank: 1 },
];

const LEGACY_DECADE_ROWS = [
  { name: "Jessica", sex: "F", decade_total: 469_439, rank: 1 },
  { name: "Michael", sex: "M", decade_total: 663_592, rank: 1 },
];

const WINDOW_FIXTURES: Record<number, typeof MILLENNIAL_ROWS> = {
  1981: MILLENNIAL_ROWS,
  1965: GEN_X_ROWS,
  1946: BOOMER_ROWS,
  1928: SILENT_ROWS,
};

interface FakeDbOptions {
  queries?: string[];
}

function fakeDb({ queries }: FakeDbOptions = {}) {
  const seen: string[] = [];
  const record = (sql: string) => {
    seen.push(sql);
    queries?.push(sql);
  };
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          if (/FROM meta/.test(sql)) {
            return {
              async first<T>() {
                record(sql);
                const key = String(values[0]);
                return { value: key === "max_year" ? "2025" : "1880" } as T;
              },
            };
          }
          if (/FROM year_totals/.test(sql)) {
            return {
              async all<T>() {
                record(sql);
                const start = Number(values[0]);
                const end = Number(values[1]);
                const rows: { year: number; sex: "F" | "M"; total: number }[] = [];
                for (let year = start; year <= end; year++) {
                  rows.push({ year, sex: "F", total: 1_000_000 }, { year, sex: "M", total: 1_000_000 });
                }
                return { results: rows } as T;
              },
            };
          }
          if (/window_total/.test(sql)) {
            return {
              async all<T>() {
                record(sql);
                const start = Number(values[0]);
                return { results: (WINDOW_FIXTURES[start] ?? []) as T[] };
              },
            };
          }
          if (/decade_total/.test(sql)) {
            return {
              async all<T>() {
                record(sql);
                return { results: LEGACY_DECADE_ROWS as T[] };
              },
            };
          }
          if (/FROM names\s/.test(sql) && /name_lower >=/.test(sql)) {
            return {
              async all<T>() {
                record(sql);
                return {
                  results: [
                    { name: "Ashley", sex: "F", total_count: 853_000, peak_year: 1987, latest_count: 1200, status: "stable", rank: 1 },
                    { name: "Andrew", sex: "M", total_count: 640_000, peak_year: 1989, latest_count: 900, status: "stable", rank: 1 },
                  ] as T[],
                };
              },
            };
          }
          if (/FROM decade_hub/.test(sql)) {
            return {
              async first<T>() {
                record(sql);
                return null as T;
              },
            };
          }
          return {
            async first<T>() {
              record(sql);
              return null as T;
            },
            async all<T>() {
              record(sql);
              return { results: [] as T[] };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
  return { db, seen };
}

function ctxFor(handler: (ctx: never) => Promise<Response>, path: string, decade: string, db: D1Database) {
  return handler({
    params: { decade },
    request: new Request(`https://example.com${path}`),
    env: { DB: db },
  } as never);
}

const getHub = (path: string, decade: string, db: D1Database) => ctxFor(decadeIndexGet, path, decade, db);

function jsonLdBlocks(html: string): Record<string, unknown>[] {
  const match = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
  assert.ok(match, "expected an application/ld+json block");
  return JSON.parse(match[1]!) as Record<string, unknown>[];
}

function jsonLdTypes(html: string): string[] {
  return jsonLdBlocks(html).map((block) => String(block["@type"]));
}

function metaContent(html: string, attr: string, value: string): string | null {
  const re = new RegExp(`<meta ${attr}="${value}" content="([^"]*)">`);
  return re.exec(html)?.[1] ?? null;
}

function textWords(html: string): number {
  const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ");
  return withoutScripts
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

// ── Registry sanity ────────────────────────────────────────────────────────

test("registry: documented boundaries, unique slugs, valid decade links, live hubs complete", () => {
  const slugs = new Set<string>();
  const decadeSlugs = new Set(DECADE_HUB_DEFINITIONS.map((definition) => definition.slug));
  for (const definition of GENERATION_DEFINITIONS) {
    assert.equal(slugs.has(definition.slug), false, `duplicate generation slug ${definition.slug}`);
    slugs.add(definition.slug);
    assert.ok(definition.startYear < definition.endYear, definition.slug);
    assert.ok(definition.boundaryNote.length >= 80, `${definition.slug} needs a documented boundary note`);
    assert.ok(definition.heading.length > 0, definition.slug);
    assert.ok(definition.paragraphs.length >= 1, definition.slug);
    for (const link of definition.decadeLinks) {
      assert.ok(decadeSlugs.has(link.slug), `${definition.slug} links to unknown decade ${link.slug}`);
      assert.ok(link.anchor.length >= 20, `${definition.slug}->${link.slug} needs a descriptive anchor`);
    }
    if (definition.previous) assert.ok(getGenerationDefinition(definition.previous), definition.slug);
    if (definition.rolloutState === "live") {
      assert.ok(definition.paragraphs.length >= 2, `${definition.slug} live hub needs substantial editorial copy`);
      assert.ok(definition.previous, `${definition.slug} live hub needs an adjacent-generation baseline`);
      assert.ok(definition.decadeLinks.length >= 2, definition.slug);
    }
  }
});

test("registry: every generation window is fully covered by the SSA span", () => {
  for (const definition of GENERATION_DEFINITIONS) {
    assert.ok(definition.endYear <= 2025, `${definition.slug} end ${definition.endYear} exceeds data`);
    assert.ok(definition.startYear >= 1880, definition.slug);
  }
});

// ── Computation ────────────────────────────────────────────────────────────

test("compute: millennial profile derives champions, totals, shares, and signatures", async () => {
  const { db } = fakeDb();
  const definition = getGenerationDefinition("millennials")!;
  const profile = await loadGenerationHubProfile(db, definition);
  if (!profile) throw new Error("expected a generation profile");
  const p = profile;
  assert.equal(p.totalBirths, 32_000_000);
  assert.equal(p.femaleBirths, 16_000_000);
  assert.equal(p.maleBirths, 16_000_000);
  assert.equal(p.isComplete, true);
  assert.equal(p.dataThroughYear, 2025);

  assert.equal(p.femaleChampion.name, "Jessica");
  assert.equal(p.maleChampion.name, "Michael");
  assert.equal(p.femaleChampion.windowShare, 0.7);

  assert.deepEqual(p.signatureGirls.map((row) => row.name), ["Amanda", "Tiffany", "Jessica"]);
  assert.deepEqual(p.signatureBoys.map((row) => row.name), ["Dustin", "Joshua", "Christopher"]);
  for (const row of [...p.signatureGirls, ...p.signatureBoys]) {
    assert.ok(row.lifetimeTotal >= SIGNATURE_LIFETIME_FLOOR);
  }

  assert.ok(p.previous);
  assert.equal(p.previous.label, "Gen X");
  assert.equal(p.previous.femaleChampion?.name, "Jennifer");
  assert.equal(p.previous.maleChampion?.name, "Michael");
});

test("compute: boomer profile derives from its own window and silent-generation baseline", async () => {
  const { db } = fakeDb();
  const profile = await loadGenerationHubProfile(db, getGenerationDefinition("boomers")!);
  if (!profile) throw new Error("expected a generation profile");
  const p = profile;
  assert.equal(p.totalBirths, 38_000_000);
  assert.equal(p.femaleChampion.name, "Mary");
  assert.equal(p.maleChampion.name, "James");
  assert.deepEqual(p.signatureGirls.map((row) => row.name), ["Linda", "Susan", "Patricia"]);
  assert.equal(p.previous?.label, "Silent Generation");
  assert.equal(p.previous?.femaleChampion?.name, "Mary");
  assert.equal(p.previous?.maleChampion?.name, "Robert");
});

// ── Route rendering ────────────────────────────────────────────────────────

test("millennial hub renders SSR-only: title, meta, canonical, H1, substantial text", async () => {
  const { db } = fakeDb();
  const response = await getHub("/names/millennials/", "millennials", db);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Link"), "<https://example.com/names/millennials/>; rel=\"canonical\"");
  assert.match(response.headers.get("Cache-Control") ?? "", /s-maxage=604800/);

  const html = await response.text();
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.com\/names\/millennials\/">/);
  assert.match(html, /<title>Millennial Baby Names: Michael &amp; Jessica Led 1981–1996 \| NobodyNamed<\/title>/);
  assert.ok(metaContent(html, "name", "description")?.includes("millennial names"), "description should answer the millennial-names query class");

  assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1);
  assert.match(html, /<h1>Millennial baby names<\/h1>/);
  assert.ok(textWords(html) >= 300, `expected substantial SSR text, got ${textWords(html)} words`);
  assert.doesNotMatch(html, /renderDecadeTable/);
});

test("millennial hub answers the query class with era facts, links, and methodology", async () => {
  const { db } = fakeDb();
  const html = await (await getHub("/names/millennials/", "millennials", db)).text();

  // Dataset facts in server-rendered copy.
  assert.match(html, /32,000,000/);
  assert.match(html, /16,000,000/);
  assert.match(html, /Jessica/);
  assert.match(html, /Michael/);

  // Adjacent-generation shift copy (Gen X baseline).
  assert.match(html, /Gen X/);
  assert.match(html, /1965–1980/);
  assert.match(html, /from Jennifer to Jessica/);
  assert.match(html, /Michael held the boys' lead in both windows/);

  // Signature names callout.
  assert.match(html, /Signature names of the generation/);
  assert.match(html, /<a href="\/name\/Tiffany\/">Tiffany<\/a>/);
  assert.match(html, /<a href="\/name\/Dustin\/">Dustin<\/a>/);

  // Constituent decade hubs with descriptive anchors.
  for (const href of ["/names/1980s/", "/names/1990s/", "/names/2000s/"]) {
    assert.match(html, new RegExp(`href="${href}"`), href);
  }
  assert.match(html, /millennial classroom filled up/);
  assert.match(html, /millennial peak/);

  // Representative name pages.
  for (const name of ["Jessica", "Ashley", "Amanda", "Michael", "Christopher", "Matthew"]) {
    assert.match(html, new RegExp(`href="/name/${name}/"`), name);
  }

  // Methodology / source note.
  assert.match(html, /1981–1996/);
  assert.match(html, /suppresses name-and-sex counts below 5/);
  assert.match(html, /Social Security Administration national birth records/);

  // Analytics identity follows the decade-hub convention.
  assert.match(html, /data-content-id="generation-hub:millennials"/);
  assert.match(html, /data-content-type="generation-hub"/);
});

test("generation hubs have unique titles, descriptions, canonicals, and H1s", async () => {
  const { db } = fakeDb();
  const millennial = await (await getHub("/names/millennials/", "millennials", db)).text();
  const boomer = await (await getHub("/names/boomers/", "boomers", db)).text();

  const title = (html: string) => /<title>([^<]+)<\/title>/.exec(html)?.[1];
  const canonical = (html: string) => /<link rel="canonical" href="([^"]+)">/.exec(html)?.[1];
  const h1 = (html: string) => /<h1>([^<]+)<\/h1>/.exec(html)?.[1];
  const desc = (html: string) => metaContent(html, "name", "description");

  assert.notEqual(title(millennial), title(boomer));
  assert.notEqual(canonical(millennial), canonical(boomer));
  assert.notEqual(h1(millennial), h1(boomer));
  assert.notEqual(desc(millennial), desc(boomer));
  assert.match(h1(millennial) ?? "", /^Millennial baby names$/);
  assert.match(h1(boomer) ?? "", /^Baby Boomer baby names$/);
  assert.match(title(boomer) ?? "", /Baby Boomer Names: James &amp; Mary Led 1946–1964/);
});

test("generation hub JSON-LD parses: BreadcrumbList, WebPage, and ItemList", async () => {
  const { db } = fakeDb();
  const html = await (await getHub("/names/millennials/", "millennials", db)).text();
  const types = jsonLdTypes(html);
  assert.ok(types.includes("BreadcrumbList"));
  assert.ok(types.includes("WebPage"));
  assert.ok(types.includes("ItemList"));

  const itemList = jsonLdBlocks(html).find((block) => block["@type"] === "ItemList") as {
    numberOfItems: number;
    itemListElement: { position: number; item: { name: string; url: string } }[];
  } | undefined;
  if (!itemList) throw new Error("expected an ItemList block");
  assert.equal(itemList.numberOfItems, 10);
  assert.equal(itemList.itemListElement[0]!.item.name, "Jessica");
  assert.equal(itemList.itemListElement[0]!.item.url, "https://example.com/name/Jessica/");
});

test("draft generations 404 without touching the database; unknown segments stay 400", async () => {
  const { db, seen } = fakeDb({ queries: [] });
  assert.equal((await getHub("/names/gen-x/", "gen-x", db)).status, 404);
  assert.equal(seen.length, 0, "draft generations must not query D1");
  assert.equal((await getHub("/names/not-a-decade/", "not-a-decade", db)).status, 400);
});

test("existing decade and initial routing is preserved", async () => {
  const { db } = fakeDb();
  const decade = await (await getHub("/names/1980s/", "1980s", db)).text();
  assert.match(decade, /<h1>1980s baby names<\/h1>/);
  const initial = await (await getHub("/names/a/", "a", db)).text();
  assert.match(initial, /<h1>Baby names that start with A<\/h1>/);
});

test("generation pages render with single H1 and accessible tables", async () => {
  const { db } = fakeDb();
  const html = await (await getHub("/names/millennials/", "millennials", db)).text();
  assert.match(html, /class="skip-link"/);
  assert.match(html, /<th scope="col"/);
  assert.match(html, /<caption>/);
  assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1);
});

// ── Sitemap / indexable routes ─────────────────────────────────────────────

test("live generation hubs appear exactly once in the indexable routes", () => {
  const routes = buildIndexableRoutes({ minYear: 1880, maxYear: 2025 });
  const generationPaths = routes.filter((route) => route.family === "generation").map((route) => route.path);
  assert.deepEqual(generationPaths.sort(), ["/names/boomers/", "/names/millennials/"]);
  for (const definition of GENERATION_DEFINITIONS) {
    const path = `/names/${definition.slug}/`;
    const count = routes.filter((route) => route.path === path).length;
    assert.equal(count, definition.rolloutState === "live" ? 1 : 0, path);
    if (definition.rolloutState === "live") {
      assert.ok(path.endsWith("/"));
    }
  }
});

// ── Static high-traffic pages ──────────────────────────────────────────────

test("extinct/emerging/fading link into generation and decade hubs with descriptive anchors", () => {
  const cases: { file: string; hrefs: [string, string][] }[] = [
    {
      file: "apps/web/public/extinct.html",
      hrefs: [
        ["/names/1940s/", "1940s decade hub"],
        ["/names/1950s/", "1950s decade hub"],
        ["/names/1960s/", "1960s decade hub"],
        ["/names/boomers/", "Baby Boomer generation hub"],
      ],
    },
    {
      file: "apps/web/public/emerging.html",
      hrefs: [
        ["/names/2020s/", "2020s decade hub"],
        ["/names/2010s/", "2010s decade hub"],
      ],
    },
    {
      file: "apps/web/public/fading.html",
      hrefs: [
        ["/names/1980s/", "1980s decade hub"],
        ["/names/1990s/", "1990s decade hub"],
        ["/names/2000s/", "2000s decade hub"],
        ["/names/millennials/", "Millennial generation hub"],
      ],
    },
  ];
  for (const entry of cases) {
    const html = readFileSync(new URL(`../${entry.file}`, import.meta.url), "utf8");
    for (const [href, anchor] of entry.hrefs) {
      assert.ok(html.includes(`href="${href}"`), `${entry.file} should link ${href}`);
      assert.ok(html.includes(`>${anchor}</a>`), `${entry.file} should use the descriptive anchor "${anchor}"`);
    }
  }
});
