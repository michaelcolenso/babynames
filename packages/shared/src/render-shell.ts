// Canonical page shell for all NobodyNamed HTML pages.
//
// Use pageShell() for full documents, or siteHeader/siteFooter directly when
// you need to compose a custom shell (e.g. static HTML files).

export interface NavItem {
  label: string;
  href: string;
}

const DEFAULT_NAV: NavItem[] = [
  { label: "Extinct", href: "/extinct" },
  { label: "Endangered", href: "/endangered" },
  { label: "Comebacks", href: "/comeback" },
  { label: "Birth year", href: "/year" },
  { label: "Rising", href: "/rising" },
  { label: "Visualizations", href: "/viz" },
  { label: "Namecalling", href: "/blog/" },
  { label: "About", href: "/about" },
];

const BROWSE_NAV: NavItem[] = [
  { label: "Extinct", href: "/extinct" },
  { label: "Endangered", href: "/endangered" },
  { label: "Comebacks", href: "/comeback" },
  { label: "Birth year", href: "/year" },
  { label: "By decade", href: "/names/1980s/" },
  { label: "By initial", href: "/names/a/" },
  { label: "By ending", href: "/names/ending/a/" },
  { label: "Rising", href: "/rising" },
  { label: "About", href: "/about" },
];

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderNav(items: NavItem[], currentPath?: string): string {
  const links = items
    .map((item) => {
      const isActive = currentPath === item.href || (item.href !== "/" && currentPath?.startsWith(item.href));
      const activeAttr = isActive ? ' aria-current="page"' : "";
      return `<a href="${escape(item.href)}"${activeAttr}>${escape(item.label)}</a>`;
    })
    .join("");
  return `<nav aria-label="Main navigation">${links}</nav>`;
}

function renderMobileNav(items: NavItem[], currentPath?: string): string {
  const links = items
    .map((item) => {
      const isActive = currentPath === item.href || (item.href !== "/" && currentPath?.startsWith(item.href));
      const activeAttr = isActive ? ' aria-current="page"' : "";
      return `<a href="${escape(item.href)}"${activeAttr}>${escape(item.label)}</a>`;
    })
    .join("");
  return `<details class="mobile-nav">
  <summary aria-label="Toggle navigation"><span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span></summary>
  <nav aria-label="Mobile navigation">${links}</nav>
</details>`;
}

export interface SiteHeaderOpts {
  mobileNav?: boolean;
  navItems?: NavItem[];
}

export function siteHeader(currentPath?: string, opts: SiteHeaderOpts = {}): string {
  const items = opts.navItems ?? DEFAULT_NAV;
  const mobileNav = opts.mobileNav !== false ? renderMobileNav(items, currentPath) : "";
  return `<header class="site">
  <a class="brand" href="/" aria-label="NobodyNamed home"><img class="brand-logo" src="/assets/brand/wordmark.svg" alt=""></a>
  ${renderNav(items, currentPath)}
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
  <div><a href="/about">Methodology</a> &middot; <a href="/press">Press</a></div>
</footer>`;
  }
  return `<footer class="site">
  <div>
    <div>NobodyNamed is a small data project about American first names.</div>
    <div class="footer-note">Data sourced from Social Security Administration birth records (1880–present).</div>
  </div>
  <div><a href="/about">About</a> &middot; <a href="/press">Press</a> &middot; <a href="https://www.ssa.gov/oact/babynames/">SSA source</a></div>
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
  const themeDark = opts.themeColorDark ?? "#151412";
  const favicon = opts.favicon ?? "/favicon.svg";
  const mainId = opts.mainId ?? "main-content";

  const ogImageMeta = opts.ogImage
    ? `<meta property="og:image" content="${escape(opts.ogImage)}">\n<meta property="og:image:type" content="image/png">`
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
<link rel="stylesheet" href="/assets/style.css">
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
${scriptTags}
${jsonBlocks}
${inlineScriptTags}
</body>
</html>`;
}
