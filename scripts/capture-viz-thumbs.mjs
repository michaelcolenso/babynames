// Regenerate the /viz/ gallery thumbnails in apps/web/public/assets/viz-thumbs/.
//
// Reads the card links from apps/web/public/viz/index.html, opens each page on
// the live site in headless Chromium, finds the main chart (largest
// svg/canvas, preferring the anchored section for /viz/explore#... links),
// and saves a ~480px-wide JPEG named after the card slug.
//
// Run after each yearly SSA data release so the previews match the data:
//   npm i -D playwright-core   (plus a Chromium; set CHROMIUM_PATH if not found)
//   NODE_USE_ENV_PROXY=1 node scripts/capture-viz-thumbs.mjs
//
// The browser never touches the network directly: every request is
// intercepted and fulfilled via Node fetch. This makes the capture work in
// sandboxed/proxied environments where Chromium's own TLS connections are
// rejected by an intercepting egress proxy, and it is harmless elsewhere.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUB = path.join(ROOT, "apps", "web", "public");
const OUT = path.join(PUB, "assets", "viz-thumbs");
const ORIGIN = process.env.THUMB_ORIGIN || "https://nobodynamed.com";
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium";
fs.mkdirSync(OUT, { recursive: true });

// Pages where the auto-picked chart is wrong or unstable: shoot the viewport
// instead (after scrolling to the anchor / past the masthead).
const VIEWPORT_ONLY = {
  // EKG traces draw in slowly; the bare svg screenshots near-blank
  "heartbeats": { scrollPast: 430, wait: 8000 },
  // These explore anchors don't contain their own svg, so the largest-chart
  // heuristic would grab a neighboring section's chart
  "explore-decade-radar": { wait: 4000 },
  "explore-gender-drift": { wait: 4000 },
  "explore-phantom-names": { wait: 4000 },
};

const html = fs.readFileSync(path.join(PUB, "viz", "index.html"), "utf8");
const hrefs = [...new Set([...html.matchAll(/class="viz-card" href="([^"]+)"/g)].map((m) => m[1]))];
const slugFor = (href) => href.replace(/^\/viz\//, "").replace(/#/, "-").replace(/[^a-z0-9-]/gi, "-");

const cache = new Map();
async function nodeFetch(url) {
  if (cache.has(url)) return cache.get(url);
  const r = await fetch(url, { redirect: "follow" });
  const body = Buffer.from(await r.arrayBuffer());
  const headers = {};
  for (const [k, v] of r.headers) {
    if (!["content-encoding", "content-length", "transfer-encoding", "connection"].includes(k.toLowerCase())) headers[k] = v;
  }
  const out = { status: r.status, headers, body };
  if (r.status === 200 && body.length < 8 * 1024 * 1024) cache.set(url, out);
  return out;
}

const browser = await chromium.launch({ executablePath: CHROMIUM });
const ctx = await browser.newContext({
  viewport: { width: 1200, height: 750 },
  deviceScaleFactor: 0.4, // ~480px-wide output
});
await ctx.route("**/*", async (route) => {
  const req = route.request();
  if (req.method() !== "GET" || !req.url().startsWith("https://")) return route.abort();
  try {
    const { status, headers, body } = await nodeFetch(req.url());
    await route.fulfill({ status, headers, body });
  } catch {
    await route.abort();
  }
});

const results = [];
for (const href of hrefs) {
  const slug = slugFor(href);
  const file = path.join(OUT, slug + ".jpg");
  const page = await ctx.newPage();
  try {
    await page.goto(ORIGIN + href, { waitUntil: "networkidle", timeout: 60000 });
    const hash = href.includes("#") ? "#" + href.split("#")[1] : null;
    if (hash) {
      const el = page.locator(hash);
      if (await el.count()) await el.evaluate((n) => n.scrollIntoView({ block: "start" }));
    }
    const override = VIEWPORT_ONLY[slug];
    await page.waitForTimeout(override?.wait ?? 3500); // lazy sections + D3 transitions

    let mode = "viewport";
    if (override) {
      if (override.scrollPast) await page.evaluate((y) => scrollTo(0, y), override.scrollPast);
      await page.screenshot({ path: file, type: "jpeg", quality: 80 });
    } else {
      const handle = await page.evaluateHandle((scopeSel) => {
        const scope = scopeSel ? document.querySelector(scopeSel) : null;
        const pools = [];
        if (scope) pools.push([...scope.querySelectorAll("svg, canvas")]);
        pools.push([...document.querySelectorAll("svg, canvas")]);
        for (const els of pools) {
          let best = null;
          for (const el of els) {
            const r = el.getBoundingClientRect();
            if (r.width < 400 || r.height < 180) continue;
            if (!best || r.width * r.height > best.r.width * best.r.height) best = { el, r };
          }
          if (best) return best.el;
        }
        return null;
      }, hash);
      const el = handle.asElement();
      const box = el ? await el.boundingBox() : null;
      if (el && box && box.height <= box.width * 1.4) {
        await el.scrollIntoViewIfNeeded();
        await page.waitForTimeout(600);
        await el.screenshot({ path: file, type: "jpeg", quality: 80 });
        mode = "chart";
      } else if (el && box) {
        // Chart much taller than wide (barcodes etc.) — shoot its top viewport-full
        await el.scrollIntoViewIfNeeded();
        await page.waitForTimeout(600);
        await page.screenshot({ path: file, type: "jpeg", quality: 80 });
        mode = "chart-top";
      } else {
        await page.evaluate(() => scrollTo(0, 380));
        await page.waitForTimeout(400);
        await page.screenshot({ path: file, type: "jpeg", quality: 80 });
      }
      // A near-empty JPEG means the chart hadn't painted — wait and retake
      if (fs.statSync(file).size < 2600) {
        await page.waitForTimeout(2500);
        await page.screenshot({ path: file, type: "jpeg", quality: 80 });
        mode += "+retake";
      }
    }
    results.push({ slug, ok: true, mode, kb: Math.round(fs.statSync(file).size / 1024) });
  } catch (e) {
    results.push({ slug, ok: false, err: String(e).split("\n")[0].slice(0, 100) });
  }
  await page.close();
}
await browser.close();

for (const r of results) console.log((r.ok ? "ok  " : "FAIL") + ` ${r.mode || ""} ${r.slug} ${r.kb ?? r.err}`);
const failed = results.filter((r) => !r.ok).length;
console.log("total:", results.length, "failed:", failed);
process.exit(failed ? 1 : 0);
