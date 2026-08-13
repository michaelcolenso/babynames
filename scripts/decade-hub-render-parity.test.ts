import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { onRequestGet as decadeIndexGet } from "../apps/web/functions/names/[decade]/index";
import { onRequestGet as methodologyGet } from "../apps/web/functions/names/[decade]/methodology/index";
import { onRequestGet as classroomGet } from "../apps/web/functions/names/[decade]/classroom/index";
import { onRequestGet as spellingGet } from "../apps/web/functions/names/[decade]/spelling-families/index";
import { renderDecadeClassroomGeneric, renderDecadeHubGeneric, renderDecadeMethodologyGeneric, renderDecadeSpellingFamiliesGeneric } from "../packages/shared/src/render-decade-hub-core";
import { DecadeHero as DecadeHero1980, renderDecadeHub } from "../packages/shared/src/render-decade-hub";
import { DecadeHero as DecadeHero1920, renderDecadeHub1920 } from "../packages/shared/src/render-decade-hub-1920";
import type { DecadeProfile } from "../packages/shared/src/decade-hub-types";
import type { DecadeHubDefinition } from "../packages/shared/src/content/decade-hub-definitions";
import type { DecadeThesis } from "../packages/shared/src/content/decade-theses";

const PROFILE_1920 = JSON.parse(readFileSync(new URL("../data/dist/decade-hub-1920.json", import.meta.url), "utf8")) as DecadeProfile;
const PROFILE_1980 = JSON.parse(readFileSync(new URL("./fixtures/decade-hub-1980.fixture.json", import.meta.url), "utf8")) as DecadeProfile;
const ORIGIN = "https://example.com";
const CACHE = "public, s-maxage=604800, stale-while-revalidate=86400";

function profileForDefinition(profile: DecadeProfile, definition: DecadeHubDefinition, sourceVersion = "fixture"): DecadeProfile {
  return {
    ...profile,
    decade: definition.startYear,
    startYear: definition.startYear,
    endYear: definition.nominalEndYear,
    nominalEndYear: definition.nominalEndYear,
    dataThroughYear: definition.nominalEndYear,
    isComplete: true,
    sourceVersion,
  };
}

type Decade = "1920s" | "1980s";
type Route = "hub" | "methodology" | "classroom" | "spelling-families";

const profiles: Record<Decade, DecadeProfile> = { "1920s": PROFILE_1920, "1980s": PROFILE_1980 };

function fakeDb(options: { payload?: string | null; throws?: boolean } = {}) {
  const payload = options.payload === undefined ? JSON.stringify(PROFILE_1980) : options.payload;
  return {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          if (/FROM decade_hub/.test(sql)) {
            return {
              async first<T>() {
                if (options.throws) throw new Error("no such table: decade_hub");
                if (payload === null) return null;
                const requested = String(values[0]);
                const selected = requested === "1920s" ? PROFILE_1920 : PROFILE_1980;
                return { payload: options.payload === undefined ? JSON.stringify(selected) : payload } as T;
              },
            };
          }
          if (/FROM meta/.test(sql)) {
            return {
              async first<T>() {
                const key = String(values[0]);
                return { value: key === "min_year" ? "1880" : key === "max_year" ? "2017" : "test-version" } as T;
              },
            };
          }
          return {
            async all<T>() {
              if (/decade_total/.test(sql)) {
                return {
                  results: [
                    { name: "Jessica", sex: "F", decade_total: 469439, rank: 1 },
                    { name: "Michael", sex: "M", decade_total: 663592, rank: 1 },
                  ] as T[],
                };
              }
              return { results: [] as T[] };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

function pathFor(decade: Decade, route: Route): string {
  return route === "hub" ? `/names/${decade}/` : `/names/${decade}/${route}/`;
}

function handlerFor(route: Route) {
  return route === "hub" ? decadeIndexGet : route === "methodology" ? methodologyGet : route === "classroom" ? classroomGet : spellingGet;
}

async function renderRoute(decade: Decade, route: Route, db = fakeDb()): Promise<{ response: Response; html: string }> {
  const path = pathFor(decade, route);
  const response = await handlerFor(route)({
    params: { decade },
    request: new Request(`${ORIGIN}${path}`),
    env: { DB: db },
  } as never);
  return { response, html: await response.text() };
}

function jsonLdTypes(html: string): string[] {
  const blocks: { "@type"?: string }[] = [];
  for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    const parsed = JSON.parse(match[1]!) as { "@type"?: string } | { "@type"?: string }[];
    blocks.push(...(Array.isArray(parsed) ? parsed : [parsed]));
  }
  return blocks.map((value) => String(value["@type"]));
}

function metaContent(html: string, name: string): string {
  const match = new RegExp(`<meta name="${name}" content="([^"]*)">`).exec(html);
  assert.ok(match, `missing meta ${name}`);
  return match[1]!;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertJsonLdIncludes(html: string, required: readonly string[]): void {
  const types = jsonLdTypes(html);
  for (const type of required) {
    assert.ok(types.includes(type), `missing JSON-LD type ${type}; found ${types.join(", ")}`);
  }
}

function semanticFingerprint(html: string): string {
  const main = html.match(/<main[\s\S]*<\/main>/)?.[0];
  assert.ok(main, "expected main content");
  const semantic = main
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/(<dt>\s*Generated\s*<\/dt>\s*<dd>)[^<]*(<\/dd>)/g, "$1<TIMESTAMP>$2")
    .replace(/>\s+</g, "><")
    .trim();
  return createHash("sha256").update(semantic).digest("hex");
}

// Filled from the pilot output after the characterization assertions below are green.
const EXPECTED_FINGERPRINTS: Record<string, string> = {
  "1920s/hub": "775ac8779e3409a7dd0868895ce023c072b4a49333dc819cd1f5a0e06bb4cd8b",
  "1920s/methodology": "8e5679370e896da68f0154ba9409053f8031a6b2be2d0a36c65a00a1edaf8bc1",
  "1920s/classroom": "82b06300f1f3a179f1916193ea6d8fabd45bbf432c739cdba115c09498a12b97",
  "1920s/spelling-families": "28ba073fad1da3f3e90efdf32ba15ed89def99ebe9538416473e5993992d50e5",
  "1980s/hub": "d843d96908fa9639b6304edc3438a660ebc0e30a855c287c5623d0039104a915",
  "1980s/methodology": "f9b171775fe5be99d981eb29ee6ec5fa6bd01403304bd4e506f4f0f6ba95fd6c",
  "1980s/classroom": "bc20cd8ca3c9cc6db3a6170deb702a340057f71d04d161fc7d36efc03554d46c",
  "1980s/spelling-families": "f9270051b60261749a6a212464b9273b601be64e56cf2fa4d3a16896e629cc14",
};

test("generic renderer accepts a non-pilot definition and derives its decade identity", () => {
  const definition: DecadeHubDefinition = {
    slug: "1970s",
    startYear: 1970,
    nominalEndYear: 1979,
    classroomYear: 1974,
    thesisSourceVersion: "fixture",
    sanityAnchors: [],
    familyFile: "fixture",
    rolloutState: "draft",
  };
  const thesis: DecadeThesis = {
    sourceVersion: "fixture",
    heading: "Fixture decade",
    paragraphs: ["Reviewed fixture copy."],
  };
  const html = renderDecadeHubGeneric(profileForDefinition(PROFILE_1980, definition), { origin: ORIGIN, definition, thesis });
  assert.match(html, /data-content-id="decade-hub:1970s"/);
  assert.match(html, /<h1>1970s baby names<\/h1>/);
  assert.match(html, /Reviewed fixture copy\./);
  assert.match(html, /href="\/year\/1970\/"/);
});


test("generic renderer shows an honest empty spelling-family state", () => {
  const definition: DecadeHubDefinition = {
    slug: "1970s", startYear: 1970, nominalEndYear: 1979, classroomYear: 1974,
    thesisSourceVersion: "fixture", sanityAnchors: [], familyFile: "fixture", rolloutState: "draft",
  };
  const html = renderDecadeHubGeneric({ ...profileForDefinition(PROFILE_1980, definition), spellingFamilies: [] }, {
    origin: ORIGIN, definition, thesis: { sourceVersion: "fixture", heading: "Fixture decade", paragraphs: ["Reviewed fixture copy."] },
  });
  assert.match(html, /No reviewed spelling families meet the published thresholds/);
  assert.doesNotMatch(html, /Explore all 0 spelling families/);
  assert.doesNotMatch(html, /data-dh-chart=/);
});

test("generic renderer limits partial-decade language, labels, and dataset coverage", () => {
  const definition: DecadeHubDefinition = {
    slug: "2020s", startYear: 2020, nominalEndYear: 2029, classroomYear: 2024,
    thesisSourceVersion: "fixture", sanityAnchors: [], familyFile: "fixture", rolloutState: "draft",
  };
  const profile = { ...PROFILE_1980, decade: 2020, startYear: 2020, endYear: 2025, nominalEndYear: 2029, dataThroughYear: 2025, isComplete: false, sourceVersion: "ssa-national-2025", spellingFamilies: [] };
  const html = renderDecadeHubGeneric(profile, { origin: ORIGIN, definition, thesis: { sourceVersion: "ssa-national-2025", heading: "Reviewed so far", paragraphs: ["Explicit fixture copy."] } });
  assert.match(html, /2020s so far · data through 2025/);
  assert.match(html, /Data coverage<\/dt><dd>Decade 2020–2025/);
  assert.doesNotMatch(html, /href="\/year\/202[6-9]\//);
  assert.doesNotMatch(html, /2020[6-9]–2029/);
  const methodology = renderDecadeMethodologyGeneric(profile, { origin: ORIGIN, definition, thesis: { sourceVersion: "ssa-national-2025", heading: "Reviewed so far", paragraphs: [] } });
  assert.match(methodology, /temporalCoverage":"2020\/2025/);
});

test("generic renderers reject mismatched profile, definition, and thesis identities", () => {
  const definition: DecadeHubDefinition = {
    slug: "1970s", startYear: 1970, nominalEndYear: 1979, classroomYear: 1974,
    thesisSourceVersion: "fixture", sanityAnchors: [], familyFile: "fixture", rolloutState: "reviewed",
  };
  const thesis: DecadeThesis = { sourceVersion: "fixture", heading: "Reviewed fixture", paragraphs: [] };
  const matching = profileForDefinition(PROFILE_1980, definition);
  const renderers = [renderDecadeHubGeneric, renderDecadeClassroomGeneric, renderDecadeSpellingFamiliesGeneric, renderDecadeMethodologyGeneric];
  for (const render of renderers) {
    assert.throws(() => render(PROFILE_1980, { origin: ORIGIN, definition, thesis }), /profile decade/i);
    assert.throws(() => render(matching, { origin: ORIGIN, definition: { ...definition, slug: "1980s" }, thesis }), /definition slug/i);
    assert.throws(() => render(matching, { origin: ORIGIN, definition, thesis: { ...thesis, sourceVersion: "stale" } }), /thesis source/i);
  }
});

test("pilot wrappers reject stale profiles and preserve the historical DecadeHero signature", () => {
  assert.throws(() => renderDecadeHub({ ...PROFILE_1980, sourceVersion: "ssa-national-2017" }, { origin: ORIGIN }), /thesis source/i);
  assert.throws(() => renderDecadeHub1920({ ...PROFILE_1920, sourceVersion: "ssa-national-2017" }, { origin: ORIGIN }), /thesis source/i);
  assert.match(DecadeHero1980(PROFILE_1980, { heading: "Legacy heading", paragraphs: ["Legacy paragraph."] }), /Legacy heading/);
  assert.match(DecadeHero1920(PROFILE_1920, { heading: "Legacy heading", paragraphs: ["Legacy paragraph."] }), /Legacy heading/);

  const staleEditorial = {
    heading: "Stale heading",
    paragraphs: ["Stale paragraph."],
    sourceVersion: "ssa-national-2017",
  } as { heading: string; paragraphs: string[] } & { sourceVersion: string };
  assert.throws(() => DecadeHero1980(PROFILE_1980, staleEditorial), /thesis source/i);
  assert.throws(() => DecadeHero1920(PROFILE_1920, staleEditorial), /thesis source/i);
});


test("both pilot hubs preserve metadata, headers, JSON-LD, links, and analytics identity", async () => {
  for (const decade of ["1920s", "1980s"] as const) {
    const profile = profiles[decade];
    const { response, html } = await renderRoute(decade, "hub");
    const male = profile.maleChampion.name;
    const female = profile.femaleChampion.name;
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), CACHE);
    assert.equal(response.headers.get("Link"), `<${ORIGIN}/names/${decade}/>; rel="canonical"`);
    assert.match(html, new RegExp(`<title>${decade} Baby Names: ${escapeRegExp(male)} &amp; ${escapeRegExp(female)} Led the Decade \\| NobodyNamed</title>`));
    assert.match(metaContent(html, "description"), new RegExp(`most popular ${decade} girl names`));
    assert.match(html, new RegExp(`<link rel="canonical" href="${ORIGIN}/names/${decade}/">`));
    assertJsonLdIncludes(html, ["BreadcrumbList", "WebPage", "ItemList"]);
    assert.match(html, new RegExp(`data-content-id="decade-hub:${decade}"`));
    assert.match(html, /data-content-type="decade-hub"/);

    for (let year = Number(decade.slice(0, 4)); year <= Number(decade.slice(0, 4)) + 9; year++) {
      assert.match(html, new RegExp(`href="/year/${year}/"`), `year link ${year}`);
    }
    assert.match(html, new RegExp(`href="/names/${decade}/methodology/"`));
    assert.match(html, new RegExp(`href="/names/${decade}/classroom/"`));
    assert.match(html, new RegExp(`href="/names/${decade}/spelling-families/"`));

    const scorecard = html.indexOf('<dl class="dh-scorecard">');
    const lede = html.indexOf('<p class="lede">');
    assert.ok(scorecard >= 0 && lede >= 0, `${decade}: scorecard and lede are present`);
    if (decade === "1920s") assert.ok(scorecard < lede, "1920s scorecard precedes editorial lede");
    else assert.ok(scorecard > lede, "1980s pilot preserves its existing lede-before-scorecard order");
  }
});

test("both pilot child routes preserve canonical headers, JSON-LD types, identity, and copy", async () => {
  for (const decade of ["1920s", "1980s"] as const) {
    for (const route of ["methodology", "classroom", "spelling-families"] as const) {
      const { response, html } = await renderRoute(decade, route);
      const path = pathFor(decade, route);
      assert.equal(response.status, 200, `${decade} ${route}`);
      assert.equal(response.headers.get("Cache-Control"), CACHE);
      assert.equal(response.headers.get("Link"), `<${ORIGIN}${path}>; rel="canonical"`);
      assert.match(html, new RegExp(`<link rel="canonical" href="${ORIGIN}${path}">`));
      assert.match(html, new RegExp(`data-content-id="decade-hub:${decade}/${route}"`));
      assert.match(html, /data-content-type="decade-hub"/);

      if (route === "methodology") {
        assert.match(html, new RegExp(`<title>How We Rank ${decade} Baby Names: Methodology \\| NobodyNamed</title>`));
        assert.equal(metaContent(html, "description"), `Data source, coverage, eligibility rules, ownership-score formulas, classroom reconstruction, and spelling-family curation for the NobodyNamed ${decade} decade hub.`);
        assertJsonLdIncludes(html, ["BreadcrumbList", "WebPage", "Dataset"]);
        for (const formula of [
          "raw_concentration = births_in_decade / lifetime_births",
          "adjusted_concentration = (births_in_decade + α × prior_decade_share) / (lifetime_births + α)",
          "raw_prominence = ln(1 + births_in_decade)",
          "ownership_score = 100 × (0.70 × normalized_concentration + 0.30 × normalized_prominence)",
          "H = −Σ (p_i × ln(p_i))",
          "N_eff = exp(H)",
          "HHI = Σ p_i²; concentration_score = 100 × (HHI − 1/N) / (1 − 1/N)",
          "femaleSeats = round(30 × F_total / (F_total + M_total))",
        ]) assert.match(html, new RegExp(formula.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${decade}: ${formula}`);
        assert.match(html, /suppresses name-and-sex counts below 5/);
        assert.match(html, /Names with no recorded .* births are absent rather than zeroed/);
      } else if (route === "classroom") {
        const year = decade === "1920s" ? 1924 : 1984;
        assert.match(html, new RegExp(`<title>${year} Classroom Names: An Average 30-Student Roster \\| NobodyNamed</title>`));
        assert.match(metaContent(html, "description"), new RegExp(`^A statistical reconstruction of an average ${year} American classroom:`));
        assert.match(html, /A statistical reconstruction of an average classroom, not an actual class record\./);
        assert.match(html, new RegExp(`The ${year} classroom`));
        assert.match(html, /data-dh-sentinel="classroom-bottom"/);
        assertJsonLdIncludes(html, ["BreadcrumbList", "WebPage"]);
      } else {
        assert.match(html, new RegExp(`<title>${decade} Spelling Families: Combined Name Rankings \\| NobodyNamed</title>`));
        assert.match(metaContent(html, "description"), new RegExp(`^Conventional rankings split spelling variants\\. This view groups \\d+ hand-reviewed ${decade} spelling families`));
        assert.match(html, /Conventional rankings (?:separate|split) spelling variants/);
        assert.match(html, /role="img" aria-label="Line chart of yearly births/);
        assert.match(html, /<details class="dh-chart-data">/);
        assert.match(html, /<table class="table dh-table">/);
        assert.match(html, /<caption>Yearly SSA births by spelling variant/);
        assertJsonLdIncludes(html, ["BreadcrumbList", "WebPage"]);
      }
    }
  }
});

test("pilot route fingerprints are stable after generated timestamps are stripped", async () => {
  const observed: Record<string, string> = {};
  for (const decade of ["1920s", "1980s"] as const) {
    for (const route of ["hub", "methodology", "classroom", "spelling-families"] as const) {
      const { html } = await renderRoute(decade, route);
      observed[`${decade}/${route}`] = semanticFingerprint(html);
    }
  }
  assert.deepEqual(observed, EXPECTED_FINGERPRINTS, `observed fingerprints: ${JSON.stringify(observed)}`);
});

test("missing or malformed pilot rows keep the hub fallback and child 404 behavior", async () => {
  for (const decade of ["1920s", "1980s"] as const) {
    for (const db of [
      fakeDb({ payload: null }),
      fakeDb({ payload: "{\"decade\":1970}" }),
      fakeDb({ throws: true }),
    ]) {
      const hub = await renderRoute(decade, "hub", db);
      assert.equal(hub.response.status, 200);
      assert.match(hub.html, new RegExp(`<h1>${decade} baby names</h1>`));
      assert.doesNotMatch(hub.html, /class="dh-page"/);
      for (const route of ["methodology", "classroom", "spelling-families"] as const) {
        const child = await renderRoute(decade, route, db);
        assert.equal(child.response.status, 404, `${decade} ${route}`);
        assert.match(child.html, /<h1>Not found<\/h1>/);
      }
    }
  }
});
