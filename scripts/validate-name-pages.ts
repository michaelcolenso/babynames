// Validates rendered /name/:name/ pages for SEO completeness.
// Run with: npx tsx scripts/validate-name-pages.ts [--verbose]
//
// Reports: missing h1, title, meta description, canonical, at-a-glance section,
// quick-answer section, JSON-LD parse errors, word-count below 300, zero internal links.

import { renderFullPage } from "../packages/shared/src/render-name";
import { classify } from "../packages/shared/src/classify";
import type { NameRecord, ClassifyResult } from "../packages/shared/src";

const VERBOSE = process.argv.includes("--verbose");

// ── helpers ───────────────────────────────────────────────────────────────────

function makeRecord(
  name: string,
  sex: "M" | "F",
  series: Record<number, number>,
): NameRecord {
  const years = Object.keys(series).map(Number).sort((a, b) => a - b);
  const ym = years[0] ?? 1880;
  const yM = years[years.length - 1] ?? 2024;
  return { name, sex, ym, yM, series };
}

interface CheckResult {
  name: string;
  issues: string[];
  ok: boolean;
}

function wordCount(html: string): number {
  const stripped = html.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ");
  return stripped.split(/\s+/).filter((w) => w.length > 1).length;
}

function checkPage(record: NameRecord, cls: ClassifyResult): CheckResult {
  const canonical = `https://nobodynamed.com/name/${encodeURIComponent(record.name)}/`;
  const html = renderFullPage(record, cls, { canonical });
  const issues: string[] = [];

  // h1 present
  if (!/<h1[^>]*>/i.test(html)) issues.push("missing <h1>");

  // <title>
  const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
  if (!titleMatch) {
    issues.push("missing <title>");
  } else {
    const t = titleMatch[1]!;
    if (!t.includes("NobodyNamed")) issues.push("title does not contain 'NobodyNamed'");
    if (!t.toLowerCase().includes(record.name.toLowerCase())) issues.push("title does not contain name");
  }

  // meta description
  const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
  if (!descMatch) {
    issues.push("missing <meta name=description>");
  } else {
    if (descMatch[1]!.length < 50) issues.push("meta description too short (<50 chars)");
    if (!descMatch[1]!.toLowerCase().includes(record.name.toLowerCase()))
      issues.push("meta description does not mention name");
  }

  // canonical
  if (!html.includes('<link rel="canonical"')) issues.push("missing <link rel=canonical>");

  // at-a-glance section
  if (!html.includes('class="name-summary"')) issues.push("missing .name-summary section");
  if (!html.includes("at a glance")) issues.push("missing 'at a glance' heading text");

  // quick-answers section
  if (!html.includes('class="name-answers"')) issues.push("missing .name-answers section");
  if (!html.includes("Quick answers about")) issues.push("missing 'Quick answers about' heading");

  // Q&A blocks: required questions
  const lname = record.name.toLowerCase();
  if (!html.toLowerCase().includes(`how many people are named ${lname}`))
    issues.push("missing 'How many people are named' Q&A (or population data unavailable)");
  if (!html.toLowerCase().includes(`how rare is the name ${lname}`))
    issues.push("missing 'How rare is the name' Q&A");
  if (!html.toLowerCase().includes(`is ${lname} rising or falling`))
    issues.push("missing 'Is ... rising or falling' Q&A");

  // JSON-LD
  const ldMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
  if (!ldMatch) {
    issues.push("missing JSON-LD <script>");
  } else {
    try {
      const parsed = JSON.parse(ldMatch[1]!.replace(/\\u003c/g, "<"));
      if (!Array.isArray(parsed) || parsed.length < 2)
        issues.push("JSON-LD should be an array with at least 2 items");
      const hasBreadcrumb = parsed.some((item: Record<string, unknown>) => item["@type"] === "BreadcrumbList");
      const hasWebPage = parsed.some((item: Record<string, unknown>) => item["@type"] === "WebPage");
      if (!hasBreadcrumb) issues.push("JSON-LD missing BreadcrumbList");
      if (!hasWebPage) issues.push("JSON-LD missing WebPage");
    } catch (e) {
      issues.push(`JSON-LD parse error: ${(e as Error).message}`);
    }
  }

  // word count
  const wc = wordCount(html);
  if (wc < 300) issues.push(`word count too low: ${wc} (need ≥300)`);

  // internal links
  const internalLinks = (html.match(/href="\/[^"]+"/g) ?? []).length;
  if (internalLinks === 0) issues.push("no internal links found");

  // no literal "undefined" or "null" in visible text
  const visibleText = html.replace(/<[^>]+>/g, " ");
  if (/\bundefined\b/.test(visibleText)) issues.push("literal 'undefined' in page text");
  if (/\bnull\b/.test(visibleText)) issues.push("literal 'null' in page text");

  return { name: record.name, issues, ok: issues.length === 0 };
}

// ── test cases ────────────────────────────────────────────────────────────────

function makeHelenSeries(): Record<number, number> {
  const s: Record<number, number> = {};
  for (let y = 1905; y <= 2024; y++) {
    if (y < 1934) s[y] = Math.min(54000, 5000 + (y - 1905) * 1700);
    else if (y === 1934) s[y] = 54000;
    else s[y] = Math.max(150, 54000 - (y - 1934) * 700);
  }
  return s;
}

function makeMarySeries(): Record<number, number> {
  const s: Record<number, number> = {};
  for (let y = 1880; y <= 2024; y++) {
    if (y <= 1954) s[y] = Math.min(80000, 10000 + (y - 1880) * 900);
    else s[y] = Math.max(300, 80000 - (y - 1954) * 1000);
  }
  return s;
}

const cases: [NameRecord, string][] = [
  [makeRecord("Helen", "F", makeHelenSeries()), "declining classic"],
  [makeRecord("Mary", "F", makeMarySeries()), "massive historic"],
  [makeRecord("Abhay", "M", { 2005: 6, 2008: 9, 2015: 8, 2020: 6, 2024: 5 }), "very rare"],
  [makeRecord("Jeter", "M", {
    1999: 25, 2001: 60, 2005: 30, 2010: 10, 2015: 5, 2020: 8, 2024: 5,
  }), "one-era"],
  [makeRecord("Myrtie", "F", {
    1900: 350, 1910: 800, 1920: 1800, 1930: 1200, 1940: 600, 1950: 200, 1960: 20, 1965: 6,
  }), "extinct"],
  [makeRecord("Zelpha", "F", { 1890: 120, 1895: 80, 1900: 50, 1905: 20 }), "no age data"],
  [makeRecord("Nova", "F", (() => {
    const s: Record<number, number> = {};
    for (let y = 2005; y <= 2024; y++) s[y] = 100 + (y - 2005) * 250;
    return s;
  })()), "rising modern"],
  [makeRecord("Aiden", "M", (() => {
    const s: Record<number, number> = {};
    for (let y = 1998; y <= 2024; y++) {
      s[y] = y <= 2012 ? (y - 1998) * 1500 + 100 : Math.max(3000, 22000 - (y - 2012) * 1000);
    }
    return s;
  })()), "modern popular"],
];

// ── run ────────────────────────────────────────────────────────────────────────

let totalIssues = 0;
console.log("NobodyNamed — name page SEO validation\n");

for (const [record, label] of cases) {
  const cls = classify({ series: record.series, yM: record.yM })!;
  const result = checkPage(record, cls);
  const icon = result.ok ? "✓" : "✗";
  const suffix = result.ok ? "" : ` (${result.issues.length} issue${result.issues.length > 1 ? "s" : ""})`;
  console.log(`${icon} ${result.name} [${label}]${suffix}`);
  if (!result.ok) {
    for (const issue of result.issues) {
      console.log(`    → ${issue}`);
    }
    totalIssues += result.issues.length;
  }
  if (VERBOSE && result.ok) {
    console.log(`    (no issues)`);
  }
}

console.log(`\n${"─".repeat(50)}`);
if (totalIssues === 0) {
  console.log("All pages passed validation.");
} else {
  console.log(`Total issues: ${totalIssues}`);
  process.exit(1);
}
