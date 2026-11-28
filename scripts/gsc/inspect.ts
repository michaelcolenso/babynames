/**
 * gsc/inspect.ts — URL inspection and index coverage checks.
 *
 * Usage:
 *   npm run gsc:inspect -- https://nobodynamed.com/name/Emma/
 *   npm run gsc:inspect -- --csv=scripts/gsc-inspect.csv
 *
 * CSV mode reads a list of URLs (one per line) from the CSV or
 * inspects sitemap URLs. Useful for checking the 11 5xx + 10 not-found
 * URLs flagged in GSC.
 */

import { readFileSync, writeFileSync } from "node:fs";
import {
  buildConfig,
  loadServiceAccount,
  getAccessToken,
  inspectUrl,
  type InspectResult,
} from "./lib.js";

const args = process.argv.slice(2);
const cfg = buildConfig(args);

const urls: string[] = [];
let csvOut: string | undefined;

for (let i = 0; i < args.length; i++) {
  const arg = args[i]!;
  if (arg === "--csv" || arg.startsWith("--csv=")) {
    csvOut = arg.startsWith("--csv=") ? arg.slice(6) : args[i + 1];
  } else if (!arg.startsWith("--")) {
    urls.push(arg);
  }
}

if (urls.length === 0) {
  console.error(
    "Usage: npm run gsc:inspect -- <url> [url2 ...]\n" +
      "       npm run gsc:inspect -- --csv=output.csv <url> [url2 ...]",
  );
  process.exit(1);
}

const sa = loadServiceAccount(cfg.keyPath);
const token = await getAccessToken(sa, cfg.retries, cfg.retryDelayMs);

console.log(`\nInspecting ${urls.length} URL(s) on ${cfg.site}\n`);

const results: Array<{
  url: string;
  verdict: string;
  coverage: string;
  lastCrawl: string;
  pageFetch: string;
  robots: string;
}> = [];

for (const url of urls) {
  try {
    const res = await inspectUrl(token, cfg.site, url, cfg.retries, cfg.retryDelayMs);
    const idx = res.indexStatusResult;
    const row = {
      url,
      verdict: idx?.verdict ?? "UNKNOWN",
      coverage: idx?.coverageState ?? "—",
      lastCrawl: idx?.lastCrawlTime ? idx.lastCrawlTime.slice(0, 10) : "—",
      pageFetch: idx?.pageFetchState ?? "—",
      robots: idx?.robotsTxtState ?? "—",
    };
    results.push(row);

    const icon =
      row.verdict === "PASS" ? "✓" : row.verdict === "FAIL" ? "✗" : "?";
    console.log(
      `${icon} ${url}\n   verdict: ${row.verdict} | coverage: ${row.coverage} | crawl: ${row.lastCrawl} | fetch: ${row.pageFetch}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({
      url,
      verdict: "ERROR",
      coverage: msg.slice(0, 60),
      lastCrawl: "—",
      pageFetch: "—",
      robots: "—",
    });
    console.log(`✗ ${url}\n   ERROR: ${msg.slice(0, 120)}`);
  }
}

if (csvOut) {
  const lines = [
    "url,verdict,coverage,lastCrawl,pageFetch,robots",
    ...results.map((r) =>
      [r.url, r.verdict, r.coverage, r.lastCrawl, r.pageFetch, r.robots]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    ),
  ];
  writeFileSync(csvOut, lines.join("\n") + "\n");
  console.log(`\n✓ CSV written to ${csvOut}`);
}
