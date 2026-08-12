import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { onRequestGet as decadeIndexGet } from "../apps/web/functions/names/[decade]/index";
import { onRequestGet as methodologyGet } from "../apps/web/functions/names/[decade]/methodology/index";
import { onRequestGet as classroomGet } from "../apps/web/functions/names/[decade]/classroom/index";
import { onRequestGet as spellingGet } from "../apps/web/functions/names/[decade]/spelling-families/index";
import type { DecadeProfile } from "../packages/shared/src/decade-hub-types";

const PROFILE_1920 = JSON.parse(readFileSync("data/dist/decade-hub-1920.json", "utf8")) as DecadeProfile;
const PROFILE_1980 = JSON.parse(readFileSync("scripts/fixtures/decade-hub-1980.fixture.json", "utf8")) as DecadeProfile;
const ORIGIN = "https://example.com";
const CACHE = "public, s-maxage=604800, stale-while-revalidate=86400";

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

function semanticFingerprint(html: string): string {
  const main = html.match(/<main[\s\S]*<\/main>/)?.[0];
  assert.ok(main, "expected main content");
  const semantic = main
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/(<dt>Generated<\/dt><dd>)[^<]*(<\/dd>)/g, "$1<TIMESTAMP>$2")
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
  "1980s/hub": "0154a691c842e43cac91e817f133a350202dd6cb08ea1d7dd68639746dbecb80",
  "1980s/methodology": "61b45c12a4efdb0868f6063bf233f658878a5150fa85c32b8f0e705a86069136",
  "1980s/classroom": "390a6193ac0c0f2917d53585965c1819b5d458f2b9bcc0377ddef5e004cffbde",
  "1980s/spelling-families": "46d4cfd47f04cc27abc98c90c695f510bef11fc346e5f0e20d4ec317dfeafa63",
};

test("both pilot hubs preserve metadata, headers, JSON-LD, links, and analytics identity", async () => {
  for (const decade of ["1920s", "1980s"] as const) {
    const profile = profiles[decade];
    const { response, html } = await renderRoute(decade, "hub");
    const male = profile.maleChampion.name;
    const female = profile.femaleChampion.name;
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), CACHE);
    assert.equal(response.headers.get("Link"), `<${ORIGIN}/names/${decade}/>; rel="canonical"`);
    assert.match(html, new RegExp(`<title>${decade} Baby Names: ${male} &amp; ${female} Led the Decade \\| NobodyNamed</title>`));
    assert.match(metaContent(html, "description"), new RegExp(`most popular ${decade} girl names`));
    assert.match(html, new RegExp(`<link rel="canonical" href="${ORIGIN}/names/${decade}/">`));
    assert.deepEqual(jsonLdTypes(html), ["BreadcrumbList", "WebPage", "ItemList"]);
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
        assert.deepEqual(jsonLdTypes(html), ["BreadcrumbList", "WebPage", "Dataset"]);
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
        assert.match(html, /A statistical reconstruction of an average classroom, not an actual class record\./);
        assert.match(html, new RegExp(`The ${year} classroom`));
        assert.match(html, /data-dh-sentinel="classroom-bottom"/);
        assert.deepEqual(jsonLdTypes(html), ["BreadcrumbList", "WebPage"]);
      } else {
        assert.match(html, new RegExp(`<title>${decade} Spelling Families: Combined Name Rankings \\| NobodyNamed</title>`));
        assert.match(html, /Conventional rankings (?:separate|split) spelling variants/);
        assert.match(html, /role="img" aria-label="Line chart of yearly births/);
        assert.match(html, /<details class="dh-chart-data">/);
        assert.match(html, /<table class="table dh-table">/);
        assert.match(html, /<caption>Yearly SSA births by spelling variant/);
        assert.deepEqual(jsonLdTypes(html), ["BreadcrumbList", "WebPage"]);
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
