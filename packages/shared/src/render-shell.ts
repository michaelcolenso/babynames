// Canonical page shell for all NobodyNamed HTML pages.
//
// Use pageShell() for full documents, or siteHeader/siteFooter directly when
// you need to compose a custom shell (e.g. static HTML files).

export interface NavItem {
  label: string;
  href: string;
}

// A grouped disclosure entry in the top-level nav — renders as a
// <details>/<summary> dropdown so the flat link count doesn't grow forever
// as more status hubs are added. See renderNav()/renderMobileNav().
export interface NavGroup {
  label: string;
  items: NavItem[];
}

export type NavEntry = NavItem | NavGroup;

function isNavGroup(entry: NavEntry): entry is NavGroup {
  return "items" in entry;
}

const DEFAULT_NAV: NavEntry[] = [
  {
    label: "Discover",
    items: [
      { label: "Extinct", href: "/extinct" },
      { label: "Endangered", href: "/endangered" },
      { label: "Comebacks", href: "/comeback" },
      { label: "Rising", href: "/rising" },
      { label: "Emerging", href: "/emerging" },
      { label: "Fading", href: "/fading" },
    ],
  },
  { label: "Birth year", href: "/year" },
  { label: "Visualizations", href: "/viz" },
  { label: "Namecalling", href: "/blog/" },
  { label: "Newsletter", href: "/newsletter" },
  { label: "About", href: "/about" },
];

const STYLESHEET_HREF = "/assets/style.css?v=25";

// Runs synchronously before the stylesheet is applied, so an explicit
// dark/light choice from a prior visit takes effect on first paint instead
// of flashing the OS-preference theme and then snapping to the stored one.
// Keep this in sync with the [data-theme] read in assets/theme.js.
export const THEME_INIT_SCRIPT = `<script>(function(){try{var t=localStorage.getItem("nv-theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t);}catch(e){}})();</script>`;

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Most og:image values are dynamic /api/og/* routes, which always render PNG.
// A handful (blog post hero images) are static assets with their own
// extension — trust that when present instead of always claiming PNG, since
// a wrong og:image:type can make some link-preview crawlers reject the image.
function ogImageType(url: string): string {
  const ext = (url.split(/[?#]/)[0] ?? "").split(".").pop()?.toLowerCase();
  switch (ext) {
    case "webp":
      return "image/webp";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "svg":
      return "image/svg+xml";
    default:
      return "image/png";
  }
}

function isItemActive(item: NavItem, currentPath?: string): boolean {
  return currentPath === item.href || (item.href !== "/" && currentPath?.startsWith(item.href) === true);
}

function renderNavLink(item: NavItem, currentPath?: string): string {
  const activeAttr = isItemActive(item, currentPath) ? ' aria-current="page"' : "";
  return `<a href="${escape(item.href)}"${activeAttr}>${escape(item.label)}</a>`;
}

// Top-level nav entries render flat; a NavGroup renders as a <details>
// dropdown with real <a href> links in its panel, so grouped items stay
// crawlable in the raw HTML regardless of open/closed state — no JS involved.
function renderNav(entries: NavEntry[], currentPath?: string): string {
  const parts = entries.map((entry) => {
    if (!isNavGroup(entry)) return renderNavLink(entry, currentPath);
    const groupActive = entry.items.some((item) => isItemActive(item, currentPath));
    const activeClass = groupActive ? " nav-group-active" : "";
    const links = entry.items.map((item) => renderNavLink(item, currentPath)).join("");
    return `<details class="nav-group${activeClass}">
    <summary>${escape(entry.label)}</summary>
    <div class="nav-group-panel">${links}</div>
  </details>`;
  });
  return `<nav aria-label="Main navigation">${parts.join("")}</nav>`;
}

// Mobile nav flattens groups into a single list — a nested disclosure inside
// the mobile menu's own disclosure isn't worth the interaction cost at that
// size, and this list is short enough (leaf items only) to scan directly.
function renderMobileNav(entries: NavEntry[], currentPath?: string): string {
  const leaves = entries.flatMap((entry) => (isNavGroup(entry) ? entry.items : [entry]));
  const links = leaves.map((item) => renderNavLink(item, currentPath)).join("");
  return `<details class="mobile-nav">
  <summary aria-label="Toggle navigation"><span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span></summary>
  <nav aria-label="Mobile navigation">${links}</nav>
</details>`;
}

// Both icons always render; style.css shows only the one matching the
// current effective theme (data-theme attribute, falling back to OS
// preference) via CSS, so this needs no JS to paint correctly on first load.
export const THEME_TOGGLE_HTML = `<button type="button" class="theme-toggle" aria-pressed="false" aria-label="Switch to dark theme">
  <svg class="theme-toggle-icon icon-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v3M12 18.5v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2.5 12h3M18.5 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>
  <svg class="theme-toggle-icon icon-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5z"/></svg>
</button>`;

export interface SiteHeaderOpts {
  mobileNav?: boolean;
  navItems?: NavEntry[];
}

// A compact search box embedded in the shared header so every page built on
// pageShell() — not just "/" — lets visitors search a new name without
// backtracking home first. Wired up by assets/header-search.js, which
// pageShell() loads unconditionally (see below).
const HEADER_SEARCH_HTML = `<div class="header-search">
  <input id="header-q" type="text" placeholder="Search a name…" autocomplete="off" spellcheck="false" aria-label="Search a name" aria-autocomplete="list" aria-controls="header-suggestions" aria-expanded="false">
  <button type="button" id="header-go" aria-label="Search">
    <svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><line x1="16.3" y1="16.3" x2="21" y2="21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
  </button>
  <div id="header-suggestions" class="suggestions hidden" role="listbox" aria-label="Name suggestions"></div>
</div>`;

export function siteHeader(currentPath?: string, opts: SiteHeaderOpts = {}): string {
  const items = opts.navItems ?? DEFAULT_NAV;
  const mobileNav = opts.mobileNav !== false ? renderMobileNav(items, currentPath) : "";
  return `<header class="site">
  <a class="brand" href="/" aria-label="NobodyNamed home"><img class="brand-logo brand-logo-light" src="/assets/brand/wordmark.svg" alt="NobodyNamed" loading="lazy"><img class="brand-logo brand-logo-dark" src="/assets/brand/wordmark-dark.svg" alt="NobodyNamed" loading="lazy"></a>
  ${renderNav(items, currentPath)}
  ${HEADER_SEARCH_HTML}
  ${THEME_TOGGLE_HTML}
  ${mobileNav}
</header>`;
}

export interface SiteFooterOpts {
  yearRange?: string;
}

export function siteFooter(variant: "full" | "minimal" = "full", opts: SiteFooterOpts = {}): string {
  if (variant === "minimal") {
    const range = opts.yearRange ? ` ${opts.yearRange}` : "";
    return `<footer class="site">
  <div>Based on SSA records${range}.</div>
  <div><a href="/about">Methodology</a> &middot; <a href="/newsletter">Newsletter</a> &middot; <a href="/press">Press</a> &middot; <a href="/developers">Developers</a></div>
</footer>`;
  }
  return `<footer class="site">
  <div>
    <div>NobodyNamed is a small data project about American first names.</div>
    <div class="footer-note">Data sourced from Social Security Administration birth records (1880–present).</div>
  </div>
  <div><a href="/about">About</a> &middot; <a href="/newsletter">Newsletter</a> &middot; <a href="/press">Press</a> &middot; <a href="/developers">Developers</a> &middot; <a href="https://www.ssa.gov/oact/babynames/">SSA source</a></div>
</footer>`;
}

export interface PageShellOpts {
  title: string;
  description: string;
  canonical: string;
  body: string;
  currentPath?: string;
  ogImage?: string;
  ogImageAlt?: string;
  ogType?: "website" | "article";
  twitterCard?: "summary" | "summary_large_image";
  structuredData?: object | object[];
  scripts?: string[];
  inlineScripts?: string[];
  jsonDataBlocks?: { id: string; data: unknown }[];
  themeColorLight?: string;
  themeColorDark?: string;
  favicon?: string;
  skipLink?: boolean;
  mainId?: string;
  footerVariant?: "full" | "minimal";
  footerYearRange?: string;
  headExtras?: string;
  headerOpts?: SiteHeaderOpts;
}

export function pageShell(opts: PageShellOpts): string {
  const title = escape(opts.title);
  const desc = escape(opts.description);
  const canonical = escape(opts.canonical);
  const ogType = opts.ogType ?? "website";
  const twitterCard = opts.twitterCard ?? "summary_large_image";
  const themeLight = opts.themeColorLight ?? "#f7f5f2";
  const themeDark = opts.themeColorDark ?? "#14161d";
  const favicon = opts.favicon ?? "/favicon.svg";
  const mainId = opts.mainId ?? "main-content";

  // All og:images render at 1200×630 (see functions/api/og/*). Declaring the
  // dimensions lets platforms size the card correctly on first scrape.
  const ogImageMeta = opts.ogImage
    ? `<meta property="og:image" content="${escape(opts.ogImage)}">\n<meta property="og:image:type" content="${ogImageType(opts.ogImage)}">\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">`
    : "";
  const ogImageAltMeta = opts.ogImageAlt
    ? `<meta property="og:image:alt" content="${escape(opts.ogImageAlt)}">`
    : "";
  const twitterImageMeta = opts.ogImage ? `<meta name="twitter:image" content="${escape(opts.ogImage)}">` : "";
  const twitterImageAltMeta = opts.ogImageAlt ? `<meta name="twitter:image:alt" content="${escape(opts.ogImageAlt)}">` : "";

  const structuredDataMeta = opts.structuredData
    ? `<script type="application/ld+json">${JSON.stringify(opts.structuredData).replace(/</g, "\\u003c")}</script>`
    : "";

  const scriptTags = (opts.scripts ?? []).map((src) => `<script src="${escape(src)}"></script>`).join("\n");
  const inlineScriptTags = (opts.inlineScripts ?? []).map((code) => `<script>\n${code}\n</script>`).join("\n");
  const jsonBlocks = (opts.jsonDataBlocks ?? [])
    .map((block) => `<script type="application/json" id="${escape(block.id)}">${JSON.stringify(block.data).replace(/</g, "\\u003c")}</script>`)
    .join("\n");

  const skipLink = opts.skipLink !== false
    ? `<a href="#${mainId}" class="skip-link">Skip to content</a>`
    : "";

  const headExtras = opts.headExtras ?? "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
${THEME_INIT_SCRIPT}
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="${canonical}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:type" content="${ogType}">
<meta property="og:url" content="${canonical}">
${ogImageMeta}
${ogImageAltMeta}
<meta name="twitter:card" content="${twitterCard}">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${desc}">
${twitterImageMeta}
${twitterImageAltMeta}
<meta name="theme-color" content="${themeLight}" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="${themeDark}" media="(prefers-color-scheme: dark)">
<link rel="icon" href="${favicon}" type="image/svg+xml">
<link rel="stylesheet" href="${STYLESHEET_HREF}">
${structuredDataMeta}
${headExtras}
</head>
<body>
${skipLink}
<div class="page">
  ${siteHeader(opts.currentPath, opts.headerOpts)}
  <main id="${mainId}">
    ${opts.body}
  </main>
  ${siteFooter(opts.footerVariant, { yearRange: opts.footerYearRange })}
</div>
<script src="/assets/theme.js" defer></script>
<script src="/assets/analytics.js" defer></script>
<script src="/assets/header-search.js" defer></script>
<script src="/assets/webmcp.js" defer></script>
${scriptTags}
${jsonBlocks}
${inlineScriptTags}
</body>
</html>`;
}
