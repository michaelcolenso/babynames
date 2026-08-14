#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { onRequestGet as hubGet } from "../apps/web/functions/names/[decade]/index";
import { onRequestGet as methodologyGet } from "../apps/web/functions/names/[decade]/methodology/index";
import { onRequestGet as classroomGet } from "../apps/web/functions/names/[decade]/classroom/index";
import { onRequestGet as spellingFamiliesGet } from "../apps/web/functions/names/[decade]/spelling-families/index";
import { DECADE_HUB_DEFINITIONS, type DecadeHubDefinition } from "../packages/shared/src/content/decade-hub-definitions";
import { stableStringify } from "../packages/shared/src/decade-hub-compute-core";
import { validateDecadeHubProfile } from "../packages/shared/src/decade-hub-validate";
import type { DecadeProfile } from "../packages/shared/src/decade-hub-types";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_ARTIFACTS = path.join(REPO, "data/dist/decade-hubs");
const ORIGIN = "https://decade-hub-verifier.local";
const CACHE_CONTROL = "public, s-maxage=604800, stale-while-revalidate=86400";
const ROUTES_PER_DECADE = 4;
const EXPECTED_PROFILE_COUNT = 15;

type RouteKind = "hub" | "methodology" | "classroom" | "spelling-families";
type Handler = (ctx: never) => Promise<Response>;

interface ManifestProfile {
  decade: number;
  slug: string;
  startYear: number;
  endYear: number;
  nominalEndYear: number;
  isComplete: boolean;
  methodologyVersion: string;
  sourceVersion: string;
  profileSha256: string;
  payloadBytes: number;
  familyStatus: string;
  validationOnly: boolean;
}

interface Manifest {
  schemaVersion: number;
  generatedAt: string;
  source: {
    type: string;
    label: string;
    sourceVersion: string;
    fingerprint: string;
    minYear: number;
    maxYear: number;
    validationOnly: boolean;
  };
  validationOnly: boolean;
  profiles: ManifestProfile[];
}

interface LoadedProfile {
  definition: DecadeHubDefinition;
  manifest: ManifestProfile;
  profile: DecadeProfile;
  payload: string;
}

function fail(message: string): never {
  throw new Error(message);
}

function routePath(slug: string, route: RouteKind): string {
  return route === "hub" ? `/names/${slug}/` : `/names/${slug}/${route}/`;
}

function handlerFor(route: RouteKind): Handler {
  if (route === "hub") return hubGet as unknown as Handler;
  if (route === "methodology") return methodologyGet as unknown as Handler;
  if (route === "classroom") return classroomGet as unknown as Handler;
  return spellingFamiliesGet as unknown as Handler;
}

function parseOption(argv: readonly string[], name: string, defaultValue: string): string {
  let value: string | undefined;
  for (const arg of argv) {
    if (!arg.startsWith(`${name}=`)) continue;
    if (value !== undefined) fail(`duplicate option: ${name}`);
    value = arg.slice(name.length + 1);
    if (!value) fail(`${name} requires a path`);
  }
  return value ?? defaultValue;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function metaByName(html: string, name: string): string {
  const match = new RegExp(`<meta name="${escapeHtml(name)}" content="([^"]*)">`).exec(html);
  if (!match) fail(`missing meta name=${name}`);
  return match[1]!;
}

function metaByProperty(html: string, property: string): string {
  const match = new RegExp(`<meta property="${escapeHtml(property)}" content="([^"]*)">`).exec(html);
  if (!match) fail(`missing meta property=${property}`);
  return match[1]!;
}

function jsonLdBlocks(html: string, route: string): Record<string, unknown>[] {
  const blocks: Record<string, unknown>[] = [];
  for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[1]!);
    } catch (error) {
      fail(`${route}: invalid JSON-LD: ${error instanceof Error ? error.message : String(error)}`);
    }
    for (const block of Array.isArray(parsed) ? parsed : [parsed]) {
      if (typeof block !== "object" || block === null || Array.isArray(block)) fail(`${route}: JSON-LD block must be an object`);
      blocks.push(block as Record<string, unknown>);
    }
  }
  if (!blocks.length) fail(`${route}: expected at least one JSON-LD block`);
  return blocks;
}

function jsonLdTypes(blocks: readonly Record<string, unknown>[]): string[] {
  return blocks.map((block) => String(block["@type"] ?? ""));
}

function hrefs(html: string): string[] {
  return [...html.matchAll(/\bhref="([^"]*)"/g)].map((match) => match[1]!);
}

function assertTablesAccessible(html: string, route: string): void {
  const tables = [...html.matchAll(/<table\b[\s\S]*?<\/table>/g)].map((match) => match[0]);
  for (const [index, table] of tables.entries()) {
    if (!/<caption>[^<]*[\s\S]*<\/caption>/.test(table)) fail(`${route}: table ${index + 1} has no caption`);
    for (const th of table.matchAll(/<th\b([^>]*)>/g)) {
      if (!/\bscope="(?:col|row|colgroup|rowgroup)"/.test(th[1]!)) fail(`${route}: table ${index + 1} has an unscoped th`);
    }
  }
}

function assertSvgsAccessible(html: string, route: string): void {
  const svgs = [...html.matchAll(/<svg\b([^>]*)>/g)].map((match) => match[1]!);
  for (const [index, attrs] of svgs.entries()) {
    if (/\baria-hidden="true"/.test(attrs)) continue;
    if (!/\brole="img"/.test(attrs)) fail(`${route}: svg ${index + 1} is missing role=img`);
    const label = /\baria-label="([^"]+)"/.exec(attrs)?.[1] ?? "";
    if (label.trim().length < 12 || /(?:undefined|NaN|Infinity)/.test(label)) fail(`${route}: svg ${index + 1} has no useful accessible label`);
  }

  const charts = [...html.matchAll(/<figure\b[^>]*class="[^"]*dh-chart[^"]*"[\s\S]*?<\/figure>/g)].map((match) => match[0]);
  const chartSvgs = charts.filter((chart) => /<svg\b[^>]*\brole="img"/.test(chart));
  if (chartSvgs.length !== charts.length) fail(`${route}: every chart is required to have an accessible SVG`);
  for (const [index, chart] of charts.entries()) {
    if (!/<details class="dh-chart-data">[\s\S]*?<table\b[\s\S]*?<caption>[^<]*[\s\S]*<\/caption>[\s\S]*?<\/table>[\s\S]*?<\/details>/.test(chart)) {
      fail(`${route}: chart ${index + 1} has no tabular fallback`);
    }
  }
}

function assertStructuralDecadeIdentity(html: string, slug: string, routeKind: RouteKind, route: string): void {
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1]?.replace(/<[^>]+>/g, " ").trim() ?? "";
  const expectedH1 = routeKind === "hub"
    ? `${slug} baby names`
    : routeKind === "methodology"
      ? `Methodology: the ${slug} decade hub`
      : routeKind === "spelling-families"
        ? `${slug} spelling families`
        : null;
  if (expectedH1 !== null && h1 !== expectedH1) fail(`${route}: wrong H1 identity: ${h1}`);

  const structuralText = [
    ...[...html.matchAll(/<caption>([\s\S]*?)<\/caption>/g)].map((match) => match[1]!),
    ...[...html.matchAll(/<svg\b[^>]*\baria-label="([^"]+)"/g)].map((match) => match[1]!),
  ].join(" ").replace(/<[^>]+>/g, " ");
  const wrong = [...new Set(
    [...structuralText.matchAll(/\b(?:18|19|20)\d0s\b/g)]
      .map((match) => match[0])
      .filter((label) => label !== slug),
  )];
  if (wrong.length) fail(`${route}: structural content has copied decade literal(s): ${wrong.join(", ")}`);
}

function assertNoBadArtifacts(html: string, profile: DecadeProfile, route: string): void {
  if (/(?:>\s*undefined\s*<|>\s*NaN\s*<|>\s*Infinity\s*<|href="\/name\/\/|data-dh-name="")/.test(html)) {
    fail(`${route}: rendered undefined, non-finite, or empty artifact`);
  }
  if (/(?:undefined|NaN|Infinity)/.test(html)) fail(`${route}: rendered non-finite or undefined text`);
  for (const champion of [profile.femaleChampion, profile.maleChampion]) {
    if (!champion.name.trim() || !champion.slug.trim() || champion.birthsInDecade <= 0) fail(`${route}: empty champion artifact`);
  }
}

function assertInternalHrefs(html: string, slug: string, route: RouteKind, routeUrl: string): void {
  const allowedDecadeRoutes = new Set([
    `/names/${slug}/`,
    `/names/${slug}/methodology/`,
    `/names/${slug}/classroom/`,
    `/names/${slug}/spelling-families/`,
  ]);
  for (const href of hrefs(html)) {
    if (!href.startsWith("/")) continue;
    if (href.startsWith("/names/")) {
      if (!/^\/names\/(?:\d{4}s|[a-z]|ending\/[a-z])\/(?:(?:methodology|classroom|spelling-families)\/)?(?:#[-a-z0-9]+)?$/i.test(href)) {
        fail(`${routeUrl}: malformed internal decade href ${href}`);
      }
      const base = href.split("#", 1)[0]!;
      if (base.startsWith(`/names/${slug}`) && !allowedDecadeRoutes.has(base)) fail(`${routeUrl}: non-canonical current-decade href ${href}`);
    }
    if (/^\/year\/\d{4}$/.test(href) || /^\/name\/[^/]+$/.test(href)) fail(`${routeUrl}: internal href must have a trailing slash: ${href}`);
    if (/^\/year\/\d{4}\/\//.test(href)) fail(`${routeUrl}: malformed year href ${href}`);
  }
}

function assertCoverageLinks(html: string, profile: DecadeProfile, definition: DecadeHubDefinition, route: string): void {
  const start = definition.startYear;
  const end = profile.endYear;
  const yearLinks = [...html.matchAll(/href="\/year\/(\d{4})\/"/g)].map((match) => Number(match[1]));
  const expected = Array.from({ length: end - start + 1 }, (_, index) => start + index);
  const actual = [...new Set(yearLinks)].sort((a, b) => a - b);
  assert.deepEqual(actual, expected, `${route}: year links do not exactly match actual coverage`);
  if (!profile.isComplete) {
    if (profile.endYear !== profile.dataThroughYear || profile.endYear >= definition.nominalEndYear) fail(`${route}: partial profile coverage is not honest`);
    for (let year = profile.endYear + 1; year <= definition.nominalEndYear; year++) {
      if (yearLinks.includes(year)) fail(`${route}: unavailable year ${year} is linked`);
    }
  }
}

function assertIdentity(html: string, slug: string, route: RouteKind, routeUrl: string): void {
  const suffix = route === "hub" ? "" : `/${route}`;
  const contentId = `decade-hub:${slug}${suffix}`;
  const page = html.match(/<div class="dh-page"[^>]*data-dh-route="([^"]*)"[^>]*data-content-id="([^"]*)"[^>]*data-content-type="([^"]*)"[^>]*data-content-slug="([^"]*)">/);
  if (!page) fail(`${routeUrl}: missing decade page identity wrapper`);
  assert.equal(page[1], routeUrl, `${routeUrl}: wrong data-dh-route`);
  assert.equal(page[2], contentId, `${routeUrl}: wrong data-content-id`);
  assert.equal(page[3], "decade-hub", `${routeUrl}: wrong data-content-type`);
  assert.equal(page[4], slug, `${routeUrl}: wrong data-content-slug`);
}

function assertMetadata(html: string, profile: DecadeProfile, definition: DecadeHubDefinition, route: RouteKind, routeUrl: string): void {
  const canonical = `${ORIGIN}${routeUrl}`;
  const title = route === "hub"
    ? `${definition.slug} Baby Names${profile.isComplete ? `: ${profile.maleChampion.name} & ${profile.femaleChampion.name} Led the Decade` : ` So Far: ${profile.maleChampion.name} & ${profile.femaleChampion.name}`} | NobodyNamed`
    : route === "methodology"
      ? `How We Rank ${definition.slug} Baby Names: Methodology | NobodyNamed`
      : route === "classroom"
        ? `${definition.classroomYear} Classroom Names: An Average 30-Student Roster | NobodyNamed`
        : `${definition.slug} Spelling Families: Combined Name Rankings | NobodyNamed`;
  const description = route === "hub"
    ? `The most popular ${definition.slug} girl names and boy names from SSA records — plus the names that truly belonged to the decade, an average ${definition.classroomYear} classroom, and spelling families.`
    : route === "methodology"
      ? `Data source, coverage, eligibility rules, ownership-score formulas, classroom reconstruction, and spelling-family curation for the NobodyNamed ${definition.slug} decade hub.`
      : route === "classroom"
        ? `A statistical reconstruction of an average ${definition.classroomYear} American classroom: 30 students apportioned from SSA birth records — ${profile.classroomDefaults.uniqueNames} unique names across 30 seats, ${profile.classroomDefaults.repeatedNames > 0 ? `${profile.classroomDefaults.repeatedNames} of them repeats` : "no name repeated"}.`
        : `Conventional rankings split spelling variants. This view groups ${profile.spellingFamilies.length} hand-reviewed ${definition.slug} spelling families to show their combined demographic footprint, with yearly charts and rankings.`;

  assert.equal(html.match(/<h1[\s>]/g)?.length ?? 0, 1, `${routeUrl}: expected exactly one h1`);
  assert.match(html, new RegExp(`<title>${escapeHtml(title)}</title>`), `${routeUrl}: wrong title`);
  assert.equal(metaByName(html, "description"), escapeHtml(description), `${routeUrl}: wrong description`);
  assert.equal(metaByProperty(html, "og:title"), escapeHtml(title), `${routeUrl}: wrong og:title`);
  assert.equal(metaByProperty(html, "og:description"), escapeHtml(description), `${routeUrl}: wrong og:description`);
  assert.equal(metaByProperty(html, "og:url"), canonical, `${routeUrl}: wrong og:url`);
  const expectedOg = route === "hub" ? `${ORIGIN}/api/og/decade/${definition.slug}` : `${ORIGIN}/api/og/default`;
  assert.equal(metaByProperty(html, "og:image"), expectedOg, `${routeUrl}: wrong og:image`);
  assert.equal(metaByName(html, "twitter:title"), escapeHtml(title), `${routeUrl}: wrong twitter:title`);
  assert.equal(metaByName(html, "twitter:description"), escapeHtml(description), `${routeUrl}: wrong twitter:description`);
  assert.match(html, new RegExp(`<link rel="canonical" href="${escapeHtml(canonical)}">`), `${routeUrl}: wrong canonical HTML`);
}

function assertJsonLd(html: string, profile: DecadeProfile, definition: DecadeHubDefinition, route: RouteKind, routeUrl: string): void {
  const blocks = jsonLdBlocks(html, routeUrl);
  const types = jsonLdTypes(blocks);
  const required = route === "hub" ? ["BreadcrumbList", "WebPage", "ItemList"] : route === "methodology" ? ["BreadcrumbList", "WebPage", "Dataset"] : ["BreadcrumbList", "WebPage"];
  for (const type of required) if (!types.includes(type)) fail(`${routeUrl}: missing JSON-LD type ${type}; found ${types.join(", ")}`);
  const canonical = `${ORIGIN}${routeUrl}`;
  const webpage = blocks.find((block) => block["@type"] === "WebPage");
  if (!webpage || webpage.url !== canonical) fail(`${routeUrl}: JSON-LD WebPage URL is not canonical`);
  const breadcrumb = blocks.find((block) => block["@type"] === "BreadcrumbList");
  const items = breadcrumb?.itemListElement;
  if (!Array.isArray(items) || (items.at(-1) as { item?: unknown } | undefined)?.item !== canonical) fail(`${routeUrl}: JSON-LD breadcrumb does not end at canonical URL`);
  if (route === "methodology") {
    const dataset = blocks.find((block) => block["@type"] === "Dataset");
    if (!dataset || dataset.temporalCoverage !== `${definition.startYear}/${profile.endYear}`) fail(`${routeUrl}: JSON-LD Dataset coverage is wrong`);
    if (dataset.url !== canonical) fail(`${routeUrl}: JSON-LD Dataset URL is wrong`);
  }
  if (route === "hub") {
    const list = blocks.find((block) => block["@type"] === "ItemList");
    if (!list || !Array.isArray(list.itemListElement) || typeof list.numberOfItems !== "number") fail(`${routeUrl}: JSON-LD ItemList is malformed`);
  }
}

function fakeDb(payloads: ReadonlyMap<string, string>): D1Database {
  return {
    prepare(sql: string) {
      if (!/SELECT payload FROM decade_hub WHERE decade = \?1/.test(sql)) fail(`verifier fake D1 received unexpected SQL: ${sql}`);
      return {
        bind(slug: unknown) {
          return {
            async first<T>() {
              const payload = payloads.get(String(slug));
              return (payload === undefined ? null : { payload }) as T | null;
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

async function loadArtifacts(artifactsDir: string): Promise<LoadedProfile[]> {
  const manifestPath = path.join(artifactsDir, "decade-hub-manifest.json");
  let manifest: Manifest;
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as Manifest;
  } catch (error) {
    fail(`cannot read managed manifest ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  assert.equal(manifest.schemaVersion, 1, "manifest schemaVersion must be 1");
  assert.equal(manifest.validationOnly, false, "manifest must not be validation-only");
  assert.equal(manifest.source.validationOnly, false, "manifest source must not be validation-only");
  assert.equal(manifest.source.minYear, 1880, "manifest source minYear must be 1880");
  assert.equal(manifest.source.maxYear, 2025, "manifest source maxYear must be 2025");
  assert.equal(manifest.source.sourceVersion, "ssa-national-2025", "manifest source vintage must be ssa-national-2025");
  if (!manifest.source.fingerprint || !manifest.generatedAt) fail("manifest source fingerprint and generatedAt are required");
  assert.equal(manifest.profiles.length, EXPECTED_PROFILE_COUNT, "managed manifest must contain exactly 15 profiles");
  assert.equal(DECADE_HUB_DEFINITIONS.length, EXPECTED_PROFILE_COUNT, "active registry must contain exactly 15 definitions");

  const entries = await fs.readdir(artifactsDir);
  const expectedFiles = new Set([
    "decade-hub-manifest.json",
    ...DECADE_HUB_DEFINITIONS.flatMap((definition) => [`decade-hub-${definition.startYear}.json`, `decade-hub-${definition.startYear}.sql`]),
  ]);
  assert.deepEqual([...entries].sort(), [...expectedFiles].sort(), "managed artifact directory has unexpected or missing files");

  const bySlug = new Map<string, ManifestProfile>();
  for (const entry of manifest.profiles) {
    if (bySlug.has(entry.slug)) fail(`duplicate manifest profile ${entry.slug}`);
    bySlug.set(entry.slug, entry);
  }

  const loaded: LoadedProfile[] = [];
  for (const definition of DECADE_HUB_DEFINITIONS) {
    const entry = bySlug.get(definition.slug);
    if (!entry) fail(`missing manifest profile for ${definition.slug}`);
    const expectedEnd = Math.min(definition.nominalEndYear, manifest.source.maxYear);
    const expectedComplete = expectedEnd === definition.nominalEndYear;
    assert.equal(entry.decade, definition.startYear, `${definition.slug}: manifest decade mismatch`);
    assert.equal(entry.startYear, definition.startYear, `${definition.slug}: manifest start mismatch`);
    assert.equal(entry.endYear, expectedEnd, `${definition.slug}: manifest end mismatch`);
    assert.equal(entry.nominalEndYear, definition.nominalEndYear, `${definition.slug}: manifest nominal end mismatch`);
    assert.equal(entry.isComplete, expectedComplete, `${definition.slug}: manifest completeness mismatch`);
    assert.equal(entry.methodologyVersion, "decade-hub/v1.0.0", `${definition.slug}: manifest methodology mismatch`);
    assert.equal(entry.sourceVersion, manifest.source.sourceVersion, `${definition.slug}: manifest source mismatch`);
    assert.equal(entry.familyStatus, "reviewed", `${definition.slug}: manifest family status must be reviewed`);
    assert.equal(entry.validationOnly, false, `${definition.slug}: profile must not be validation-only`);

    const payloadPath = path.join(artifactsDir, `decade-hub-${definition.startYear}.json`);
    let payloadText: string;
    let value: unknown;
    try {
      payloadText = await fs.readFile(payloadPath, "utf8");
      value = JSON.parse(payloadText);
    } catch (error) {
      fail(`${definition.slug}: cannot read or parse profile: ${error instanceof Error ? error.message : String(error)}`);
    }
    const validation = validateDecadeHubProfile(value, definition);
    if (!validation.ok) fail(`${definition.slug}: profile validation failed: ${validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`);
    const profile = validation.profile;
    const canonicalPayload = stableStringify(profile);
    assert.equal(createHash("sha256").update(canonicalPayload, "utf8").digest("hex"), entry.profileSha256, `${definition.slug}: profile hash mismatch`);
    assert.equal(Buffer.byteLength(canonicalPayload, "utf8"), entry.payloadBytes, `${definition.slug}: profile byte count mismatch`);
    assert.equal(profile.sourceVersion, manifest.source.sourceVersion, `${definition.slug}: profile source mismatch`);
    loaded.push({ definition, manifest: entry, profile, payload: canonicalPayload });
  }
  if (bySlug.size !== EXPECTED_PROFILE_COUNT) fail("manifest contains an unknown profile");
  return loaded;
}

async function verifyRoute(loaded: LoadedProfile, route: RouteKind, db: D1Database): Promise<void> {
  const { definition, profile } = loaded;
  const routeUrl = routePath(definition.slug, route);
  try {
    const response = await handlerFor(route)({
      params: { decade: definition.slug },
      request: new Request(`${ORIGIN}${routeUrl}`),
      env: { DB: db },
    } as never);
    assert.equal(response.status, 200, `${routeUrl}: expected status 200`);
    assert.equal(response.headers.get("Content-Type"), "text/html; charset=utf-8", `${routeUrl}: wrong content type`);
    assert.equal(response.headers.get("Cache-Control"), CACHE_CONTROL, `${routeUrl}: wrong cache header`);
    assert.equal(response.headers.get("Link"), `<${ORIGIN}${routeUrl}>; rel="canonical"`, `${routeUrl}: wrong Link canonical`);
    const html = await response.text();
    assertMetadata(html, profile, definition, route, routeUrl);
    assertIdentity(html, definition.slug, route, routeUrl);
    assertStructuralDecadeIdentity(html, definition.slug, route, routeUrl);
    assertNoBadArtifacts(html, profile, routeUrl);
    assertTablesAccessible(html, routeUrl);
    assertSvgsAccessible(html, routeUrl);
    assertInternalHrefs(html, definition.slug, route, routeUrl);
    if (route === "hub") assertCoverageLinks(html, profile, definition, routeUrl);
    assertJsonLd(html, profile, definition, route, routeUrl);

    if (route === "hub") {
      if (!html.includes(`href="/names/${definition.slug}/methodology/"`) || !html.includes(`href="/names/${definition.slug}/classroom/"`)) {
        fail(`${routeUrl}: hub is missing methodology or classroom child-route links`);
      }
      if (profile.spellingFamilies.length > 0 && !html.includes(`href="/names/${definition.slug}/spelling-families/"`)) {
        fail(`${routeUrl}: hub is missing spelling-families child-route link`);
      }
      if (definition.slug === "1880s") {
        if (profile.spellingFamilies.length !== 0 || !html.includes("No reviewed spelling families meet the published thresholds for this decade.")) fail(`${routeUrl}: empty-family state is not honest`);
        if (html.includes("Explore all 0 spelling families")) fail(`${routeUrl}: empty-family page advertises zero families`);
      }
    }
    if (definition.slug === "2020s") {
      assert.equal(profile.startYear, 2020, `${routeUrl}: wrong partial start`);
      assert.equal(profile.endYear, 2025, `${routeUrl}: 2020s must end at 2025`);
      assert.equal(profile.nominalEndYear, 2029, `${routeUrl}: 2020s nominal end must remain 2029`);
      assert.equal(profile.dataThroughYear, 2025, `${routeUrl}: 2020s source coverage must end at 2025`);
      assert.equal(profile.isComplete, false, `${routeUrl}: 2020s must be partial`);
      for (const year of [2026, 2027, 2028, 2029]) if (html.includes(`/year/${year}/`)) fail(`${routeUrl}: unavailable 2020s year ${year} is linked`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith(`${routeUrl}:`)) throw error;
    throw new Error(`${routeUrl}: ${message}`);
  }
}

export async function verifyDecadeHubs(argv = process.argv.slice(2)): Promise<void> {
  for (const arg of argv) if (!arg.startsWith("--artifacts=")) fail(`unknown option: ${arg}`);
  const artifactsDir = path.resolve(parseOption(argv, "--artifacts", DEFAULT_ARTIFACTS));
  const loaded = await loadArtifacts(artifactsDir);
  const payloads = new Map(loaded.map(({ definition, payload }) => [definition.slug, payload]));
  const db = fakeDb(payloads);
  let verified = 0;
  for (const item of loaded) {
    for (const route of ["hub", "methodology", "classroom", "spelling-families"] as const) {
      await verifyRoute(item, route, db);
      verified += 1;
    }
  }
  const expected = EXPECTED_PROFILE_COUNT * ROUTES_PER_DECADE;
  assert.equal(verified, expected, "unexpected route count");
  console.log(`Decade hub verification: ${verified}/${expected} routes passed (15 hubs + 45 child routes).`);
}

const invokedAs = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedAs === path.resolve(fileURLToPath(import.meta.url))) {
  verifyDecadeHubs().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
