// Normalize static HTML files to use the canonical site shell.

const fs = require("fs");
const path = require("path");

const PUBLIC_DIR = path.join(__dirname, "..", "apps", "web", "public");

// The "Discover" group keeps the flat nav from growing forever as more
// status hubs are added — see packages/shared/src/render-shell.ts (the
// canonical, single-source-of-truth version of this same structure).
const DISCOVER_GROUP = [
  { label: "Extinct", href: "/extinct" },
  { label: "Endangered", href: "/endangered" },
  { label: "Comebacks", href: "/comeback" },
  { label: "Rising", href: "/rising" },
  { label: "Emerging", href: "/emerging" },
  { label: "Fading", href: "/fading" },
];
const TOP_LEVEL_ITEMS = [
  { label: "Birth year", href: "/year" },
  { label: "Visualizations", href: "/viz" },
  { label: "Namecalling", href: "/blog/" },
  { label: "About", href: "/about" },
];

const STANDARD_HEADER = (currentPath) => {
  const isActive = (href) => currentPath === href || (href !== "/" && currentPath?.startsWith(href));
  const link = (item) => `<a href="${item.href}"${isActive(item.href) ? ' aria-current="page"' : ""}>${item.label}</a>`;

  const groupActive = DISCOVER_GROUP.some((item) => isActive(item.href));
  const groupClass = groupActive ? "nav-group nav-group-active" : "nav-group";
  const navLinks = `<details class="${groupClass}"><summary>Discover</summary><div class="nav-group-panel">${DISCOVER_GROUP.map(link).join("")}</div></details>${TOP_LEVEL_ITEMS.map(link).join("")}`;

  // Mobile nav stays a flat list of every leaf link — a nested disclosure
  // inside the mobile menu's own disclosure isn't worth the interaction cost.
  const mobileLinks = [...DISCOVER_GROUP, ...TOP_LEVEL_ITEMS].map(link).join("");

  return `<header class="site">
      <a class="brand" href="/" aria-label="NobodyNamed home"><img class="brand-logo" src="/assets/brand/wordmark.svg" alt="nobodynamed"></a>
      <nav aria-label="Main navigation">
        ${navLinks}
      </nav>
      <button type="button" class="theme-toggle" aria-pressed="false" aria-label="Switch to dark theme">
  <svg class="theme-toggle-icon icon-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v3M12 18.5v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2.5 12h3M18.5 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>
  <svg class="theme-toggle-icon icon-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5z"/></svg>
</button>
      <details class="mobile-nav">
        <summary aria-label="Toggle navigation"><span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span></summary>
        <nav aria-label="Mobile navigation">
          ${mobileLinks}
        </nav>
      </details>
    </header>`;
};

// Kept in sync by hand with THEME_INIT_SCRIPT / THEME_TOGGLE_HTML in
// packages/shared/src/render-shell.ts — see that file for why each exists.
const THEME_INIT_SCRIPT = '<script>(function(){try{var t=localStorage.getItem("nv-theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t);}catch(e){}})();</script>';
const THEME_JS_TAG = '<script src="/assets/theme.js" defer></script>';

const STANDARD_FOOTER_FULL = `<footer class="site">
      <div>
        <div>nobodynamed is a small data project about American first names.</div>
        <div class="footer-note">Data sourced from Social Security Administration birth records (1880–present).</div>
      </div>
      <div><a href="/about">About</a> &middot; <a target="_blank" rel="noopener" href="https://www.ssa.gov/oact/babynames/">SSA source</a></div>
    </footer>`;

const STANDARD_FOOTER_MINIMAL = `<footer class="site">
      <div>Based on SSA records 1880–present.</div>
      <div><a href="/about">Methodology</a></div>
    </footer>`;

const FILES = {
  "about.html": { currentPath: "/about", footer: "full", mainId: "main-content" },
  "year.html": { currentPath: "/year", footer: "minimal", mainId: "main-content" },
  "extinct.html": { currentPath: "/extinct", footer: "minimal", mainId: "main-content" },
  "endangered.html": { currentPath: "/endangered", footer: "minimal", mainId: "main-content" },
  "rising.html": { currentPath: "/rising", footer: "minimal", mainId: "main-content" },
  "emerging.html": { currentPath: "/emerging", footer: "minimal", mainId: "main-content" },
  "fading.html": { currentPath: "/fading", footer: "minimal", mainId: "main-content" },
  "comeback.html": { currentPath: "/comeback", footer: "minimal", mainId: "main-content" },
  "press.html": { currentPath: "/press", footer: "full", mainId: "main-content" },
};

function normalizeFile(filename, opts) {
  const filepath = path.join(PUBLIC_DIR, filename);
  let html = fs.readFileSync(filepath, "utf-8");

  // These both preserve whatever ?v=N the stylesheet link already carries —
  // never strip it. /assets/style.css caches for 24h in the browser
  // (Cache-Control: max-age=86400) with no other cache-busting mechanism for
  // static pages, so an unversioned link means any CSS change (like this
  // one) goes unseen by returning visitors for up to a day. Bump the number
  // by hand (matching STYLESHEET_HREF in render-shell.ts) whenever
  // style.css changes.
  const STYLESHEET_LINK_RE = /<link rel="stylesheet" href="\/assets\/style\.css(\?v=\d+)?">/;

  // Add favicon if missing
  if (!html.includes('<link rel="icon"')) {
    html = html.replace(
      STYLESHEET_LINK_RE,
      (match) => `<link rel="icon" href="/favicon.svg" type="image/svg+xml">\n  ${match}`
    );
  }

  // Add theme-color if missing
  if (!html.includes('name="theme-color"')) {
    html = html.replace(
      STYLESHEET_LINK_RE,
      (match) => `<meta name="theme-color" content="#f7f5f2" media="(prefers-color-scheme: light)">\n  <meta name="theme-color" content="#14161d" media="(prefers-color-scheme: dark)">\n  ${match}`
    );
  }

  // theme.js, right after the stylesheet link
  if (!html.includes("assets/theme.js")) {
    html = html.replace(STYLESHEET_LINK_RE, (match) => `${match}\n  ${THEME_JS_TAG}`);
  }

  // Inline FOUC-prevention script, right after charset — must run before the
  // stylesheet is applied, so keep it early regardless of where other head
  // injections above land.
  if (!html.includes("nv-theme")) {
    html = html.replace('<meta charset="utf-8">', `<meta charset="utf-8">\n  ${THEME_INIT_SCRIPT}`);
  }

  // Replace header
  const headerRegex = /<header class="site">[\s\S]*?<\/header>/;
  html = html.replace(headerRegex, STANDARD_HEADER(opts.currentPath));

  // Replace footer
  const footerRegex = /<footer class="site">[\s\S]*?<\/footer>/;
  const footerHtml = opts.footer === "full" ? STANDARD_FOOTER_FULL : STANDARD_FOOTER_MINIMAL;
  html = html.replace(footerRegex, footerHtml);

  // Add skip-link before .page
  if (!html.includes('class="skip-link"')) {
    html = html.replace(
      '<div class="page">',
      '<a href="#main-content" class="skip-link">Skip to content</a>\n  <div class="page">'
    );
  }

  // Wrap body content in <main id="main-content"> if not already wrapped
  // This is tricky because we need to find the content between header and footer
  // We'll look for the pattern: </header> ... <footer
  const mainMatch = html.match(/<\/header>\s*([\s\S]*?)\s*<footer/);
  if (mainMatch) {
    let innerContent = mainMatch[1].trim();
    // If it doesn't already start with <main, wrap it
    if (!innerContent.startsWith('<main')) {
      innerContent = `<main id="${opts.mainId}">\n    ${innerContent.replace(/\n/g, "\n    ")}\n  </main>`;
      html = html.replace(/(<\/header>)\s*[\s\S]*?\s*(<footer)/, `$1\n  ${innerContent}\n  $2`);
    } else if (!innerContent.includes('id="main-content"')) {
      // Has <main> but wrong id
      html = html.replace(/<main[^>]*>/, `<main id="${opts.mainId}">`);
    }
  }

  fs.writeFileSync(filepath, html);
  console.log(`Normalized ${filename}`);
}

for (const [filename, opts] of Object.entries(FILES)) {
  normalizeFile(filename, opts);
}
