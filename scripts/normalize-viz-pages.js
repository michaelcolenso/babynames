// Normalize viz pages to share consistent site chrome.
// Preserves each page's immersive dark aesthetic and visualization code.

const fs = require("fs");
const path = require("path");

const VIZ_DIR = path.join(__dirname, "..", "apps", "web", "public", "viz");

const STANDARD_HEADER = `<header class="site" style="width:100%;padding:0.8rem 2rem 1rem;border-bottom:1px solid var(--rule,rgba(255,255,255,0.1));margin:0 auto;box-sizing:border-box;">
    <a class="brand" href="/" aria-label="NobodyNamed home" style="display:inline-flex;align-items:center;color:var(--text,#e8e6e3);text-decoration:none;"><img class="brand-logo" src="/assets/brand/wordmark.svg" alt="nobodynamed" style="filter:invert(1) brightness(1.2);display:block;width:clamp(160px,20vw,210px);aspect-ratio:240/44;height:auto;"></a>
    <nav aria-label="Main navigation" style="display:flex;flex-wrap:wrap;justify-content:flex-end;gap:0.2rem 0.8rem;font-family:var(--sans,system-ui,sans-serif);">
      <a href="/extinct" style="color:var(--muted,#6b7280);font-size:0.83rem;font-weight:600;text-decoration:none;">Extinct</a>
      <a href="/endangered" style="color:var(--muted,#6b7280);font-size:0.83rem;font-weight:600;text-decoration:none;">Endangered</a>
      <a href="/comeback" style="color:var(--muted,#6b7280);font-size:0.83rem;font-weight:600;text-decoration:none;">Comebacks</a>
      <a href="/year" style="color:var(--muted,#6b7280);font-size:0.83rem;font-weight:600;text-decoration:none;">Birth year</a>
      <a href="/rising" style="color:var(--muted,#6b7280);font-size:0.83rem;font-weight:600;text-decoration:none;">Rising</a>
      <a href="/viz" style="color:var(--text,#e8e6e3);font-size:0.83rem;font-weight:600;text-decoration:none;" aria-current="page">Visualizations</a>
      <a href="/blog/" style="color:var(--muted,#6b7280);font-size:0.83rem;font-weight:600;text-decoration:none;">Namecalling</a>
      <a href="/about" style="color:var(--muted,#6b7280);font-size:0.83rem;font-weight:600;text-decoration:none;">About</a>
    </nav>
  </header>`;

const STANDARD_FOOTER = `<footer class="site" style="width:100%;padding:1.25rem 2rem;border-top:1px solid var(--rule,rgba(255,255,255,0.1));margin-top:2rem;font-family:var(--sans,system-ui,sans-serif);font-size:0.82rem;color:var(--muted,#6b7280);display:flex;justify-content:space-between;flex-wrap:wrap;gap:0.5rem;box-sizing:border-box;">
    <div>
      <div style="color:var(--muted,#6b7280);">nobodynamed is a small data project about American first names.</div>
      <div style="color:var(--muted,#6b7280);font-size:0.82rem;">Data sourced from Social Security Administration birth records (1880–present).</div>
    </div>
    <div><a href="/about" style="color:var(--muted,#6b7280);text-decoration:none;">About</a> &middot; <a target="_blank" rel="noopener" href="https://www.ssa.gov/oact/babynames/" style="color:var(--muted,#6b7280);text-decoration:none;">SSA source</a></div>
  </footer>`;

function normalizeVizPage(filename) {
  const filepath = path.join(VIZ_DIR, filename);
  let html = fs.readFileSync(filepath, "utf-8");

  // Skip pages that already have the standard header
  if (html.includes('aria-label="NobodyNamed home"') && html.includes('class="site"')) {
    // Might already be normalized (e.g., index.html)
    // Still fix meta tags if needed
  }

  // Add favicon if missing
  if (!html.includes('<link rel="icon"') && !html.includes('<link rel="shortcut icon"')) {
    // Insert after the last <meta> or before <script> or <style>
    const insertBefore = html.match(/<(script|style|link\s+rel="stylesheet")/i);
    if (insertBefore) {
      const idx = html.indexOf(insertBefore[0]);
      html = html.slice(0, idx) + '  <link rel="icon" href="/favicon.svg" type="image/svg+xml">\n  ' + html.slice(idx);
    }
  }

  // Add theme-color if missing
  if (!html.includes('name="theme-color"')) {
    const insertBefore = html.match(/<(script|style|link\s+rel="stylesheet"|link\s+rel="icon")/i);
    if (insertBefore) {
      const idx = html.indexOf(insertBefore[0]);
      html = html.slice(0, idx) + '  <meta name="theme-color" content="#f7f5f2" media="(prefers-color-scheme: light)">\n  <meta name="theme-color" content="#151412" media="(prefers-color-scheme: dark)">\n  ' + html.slice(idx);
    }
  }

  // Add style.css if missing (before existing styles)
  if (!html.includes('/assets/style.css')) {
    const insertBefore = html.match(/<(style|script|link\s+rel="icon")/i);
    if (insertBefore) {
      const idx = html.indexOf(insertBefore[0]);
      html = html.slice(0, idx) + '  <link rel="stylesheet" href="/assets/style.css">\n  ' + html.slice(idx);
    }
  }

  // Replace custom nav/header with standard header
  // Pattern 1: <nav>...</nav> (empire, heatwave style)
  const navRegex = /<nav>[\s\S]*?<\/nav>/i;
  if (navRegex.test(html)) {
    html = html.replace(navRegex, STANDARD_HEADER);
  }

  // Pattern 2: <header>...</header> followed by <nav>...</nav> (gallery style)
  const headerNavRegex = /<header>[\s\S]*?<\/header>\s*<nav>[\s\S]*?<\/nav>/i;
  if (headerNavRegex.test(html)) {
    html = html.replace(headerNavRegex, STANDARD_HEADER);
  }

  // Add skip-link before body content
  if (!html.includes('class="skip-link"')) {
    // Find first element after <body>
    const bodyMatch = html.match(/<body>\s*/i);
    if (bodyMatch) {
      const idx = html.indexOf(bodyMatch[0]) + bodyMatch[0].length;
      html = html.slice(0, idx) + '<a href="#viz-content" class="skip-link" style="position:absolute;top:-40px;left:0;background:var(--accent,#818cf8);color:#fff;padding:0.5rem 1rem;text-decoration:none;font-family:var(--sans,system-ui,sans-serif);font-size:0.85rem;font-weight:600;z-index:100;border-radius:0 0 4px 0;">Skip to content</a>\n' + html.slice(idx);
    }
  }

  // Add footer before </body>
  if (!html.includes('<footer class="site"')) {
    html = html.replace(/<\/body>/i, `\n${STANDARD_FOOTER}\n</body>`);
  }

  // Wrap main content in #viz-content for skip-link if not already wrapped
  // We look for the first major div/section after the header and add id
  if (html.includes('href="#viz-content"') && !html.includes('id="viz-content"')) {
    // Add id to first div/section after header
    html = html.replace(/(<header class="site"[\s\S]*?<\/header>\s*)(<div|<section)/i, '$1$2 id="viz-content"');
  }

  fs.writeFileSync(filepath, html);
  console.log(`Normalized viz/${filename}`);
}

const files = fs.readdirSync(VIZ_DIR).filter((f) => f.endsWith(".html") && f !== "index.html");
for (const f of files) {
  normalizeVizPage(f);
}
