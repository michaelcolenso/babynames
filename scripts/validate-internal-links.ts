import { mkdir, writeFile } from "node:fs/promises";
import { canonicalRoutePath } from "../packages/shared/src/indexable-routes";

interface PageResult {
  url: string;
  family: string;
  status: number;
  finalUrl: string;
  noindex: boolean;
  canonical?: string;
  links: string[];
}

const baseArg = process.argv.find((arg) => arg.startsWith("--base="));
const concurrencyArg = process.argv.find((arg) => arg.startsWith("--concurrency="));
const base = new URL(baseArg?.slice(7) || "http://localhost:8788");
const concurrency = Math.max(1, Number(concurrencyArg?.slice(14) || 12));
const artifacts = new URL("../artifacts/", import.meta.url);

function normalize(raw: string, source = base): string | null {
  if (/^(?:mailto:|tel:|javascript:|data:)/i.test(raw) || raw.startsWith("#")) return null;
  const url = new URL(raw, source);
  if (url.origin !== base.origin || /\.(?:css|js|json|xml|png|jpe?g|gif|svg|webp|woff2?|ico|pdf)$/i.test(url.pathname)) return null;
  url.hash = "";
  url.search = "";
  url.pathname = canonicalRoutePath(url.pathname);
  return url.toString();
}

function family(url: string): string {
  const path = new URL(url).pathname;
  if (/^\/name\//.test(path)) return "name";
  if (/^\/year\/\d/.test(path)) return "year";
  if (/^\/names\/ending\//.test(path)) return "ending";
  if (/^\/names\/[a-z]\/$/.test(path)) return "initial";
  if (/^\/names\/\d+s\/(?:methodology|classroom|spelling-families)/.test(path)) return "decade-child";
  if (/^\/names\/\d+s\//.test(path)) return "decade";
  if (/^\/blog\//.test(path)) return "blog";
  if (/^\/viz\//.test(path)) return "visualization";
  return "static";
}

function attr(tag: string, name: string): string | undefined {
  return tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1];
}

async function load(url: string): Promise<PageResult> {
  const response = await fetch(url, { redirect: "follow" });
  const html = await response.text();
  const links = [...html.matchAll(/<a\b[^>]*>/gi)]
    .filter(([tag]) => !/(?:^|\s)rel\s*=\s*["'][^"']*nofollow/i.test(tag))
    .map(([tag]) => attr(tag, "href"))
    .filter((href): href is string => Boolean(href))
    .map((href) => normalize(href, new URL(response.url)))
    .filter((href): href is string => Boolean(href));
  const canonicalTag = html.match(/<link\b[^>]*rel\s*=\s*["']canonical["'][^>]*>/i)?.[0];
  return {
    url, family: family(url), status: response.status, finalUrl: normalize(response.url) ?? response.url,
    noindex: /<meta\b[^>]*name\s*=\s*["']robots["'][^>]*content\s*=\s*["'][^"']*noindex/i.test(html),
    canonical: canonicalTag && attr(canonicalTag, "href") ? normalize(attr(canonicalTag, "href")!, new URL(response.url)) ?? undefined : undefined,
    links: [...new Set(links)],
  };
}

async function pooled<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const output: R[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) { const index = cursor++; output[index] = await fn(items[index]); }
  }));
  return output;
}

const sitemapResponse = await fetch(new URL("/sitemap.xml", base));
if (!sitemapResponse.ok) throw new Error(`Sitemap returned ${sitemapResponse.status}`);
const sitemap = await sitemapResponse.text();
const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => normalize(match[1])).filter((url): url is string => Boolean(url));
const pages = await pooled([...new Set(urls)], load);
const inbound = new Map<string, Set<string>>(pages.map((page) => [page.url, new Set()]));
for (const page of pages) for (const target of page.links) inbound.get(target)?.add(page.url);
const failures = pages.flatMap((page) => {
  const reasons: string[] = [];
  if (page.status !== 200) reasons.push(`status-${page.status}`);
  if (page.finalUrl !== page.url) reasons.push("redirect");
  if (page.noindex) reasons.push("noindex");
  if (page.canonical && page.canonical !== page.url) reasons.push("canonical-mismatch");
  const count = inbound.get(page.url)?.size ?? 0;
  if (count < 3) reasons.push(count === 0 ? "orphan" : "fewer-than-3-inbound");
  return reasons.length ? [{ url: page.url, family: page.family, inbound: count, reasons }] : [];
});
await mkdir(artifacts, { recursive: true });
await writeFile(new URL("internal-link-graph.json", artifacts), JSON.stringify({ base: base.origin, generatedAt: new Date().toISOString(), pages: pages.map((page) => ({ ...page, inboundSources: [...(inbound.get(page.url) ?? [])] })), failures }, null, 2));
const csv = ["url,route_family,inbound_sources,reasons", ...failures.map((failure) => [failure.url, failure.family, failure.inbound, failure.reasons.join("|")].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))].join("\n") + "\n";
await writeFile(new URL("internal-link-failures.csv", artifacts), csv);
const counts = new Map<string, typeof failures>();
for (const failure of failures) counts.set(failure.family, [...(counts.get(failure.family) ?? []), failure]);
console.log(`Audited ${pages.length} indexable pages; ${failures.length} failed.`);
for (const [routeFamily, items] of counts) console.log(`  ${routeFamily}: ${items.length}`);
if (failures.length) process.exitCode = 1;
