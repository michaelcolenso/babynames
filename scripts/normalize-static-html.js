// Normalize static HTML files to use the canonical site shell.

const fs = require("fs");
const path = require("path");

const PUBLIC_DIR = path.join(__dirname, "..", "apps", "web", "public");

const STANDARD_HEADER = (currentPath) => {
  const items = [
    { label: "Extinct", href: "/extinct" },
    { label: "Endangered", href: "/endangered" },
    { label: "Comebacks", href: "/comeback" },
    { label: "Birth year", href: "/year" },
    { label: "Rising", href: "/rising" },
    { label: "Emerging", href: "/emerging" },
    { label: "Fading", href: "/fading" },
    { label: "Visualizations", href: "/viz" },
    { label: "Namecalling", href: "/blog/" },
    { label: "About", href: "/about" },
  ];
  const navLinks = items
    .map((item) => {
      const isActive = currentPath === item.href || (item.href !== "/" && currentPath?.startsWith(item.href));
      const activeAttr = isActive ? ' aria-current="page"' : "";
      return `<a href="${item.href}"${activeAttr}>${item.label}</a>`;
    })
    .join("");
  const mobileLinks = items
    .map((item) => {
      const isActive = currentPath === item.href || (item.href !== "/" && currentPath?.startsWith(item.href));
      const activeAttr = isActive ? ' aria-current="page"' : "";
      return `<a href="${item.href}"${activeAttr}>${item.label}</a>`;
    })
    .join("");
  return `<header class="site">
      <a class="brand" href="/" aria-label="NobodyNamed home"><img class="brand-logo" src="/assets/brand/wordmark.svg" alt="nobodynamed"></a>
      <nav aria-label="Main navigation">
        ${navLinks}
      </nav>
      <details class="mobile-nav">
        <summary aria-label="Toggle navigation"><span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span></summary>
        <nav aria-label="Mobile navigation">
          ${mobileLinks}
        </nav>
      </details>
    </header>`;
};

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

  // Add favicon if missing
  if (!html.includes('<link rel="icon"')) {
    html = html.replace(
      '<link rel="stylesheet" href="/assets/style.css">',
      '<link rel="icon" href="/favicon.svg" type="image/svg+xml">\n  <link rel="stylesheet" href="/assets/style.css">'
    );
    // Also handle versioned CSS
    html = html.replace(
      /<link rel="stylesheet" href="\/assets\/style.css\?v=\d+">/,
      '<link rel="icon" href="/favicon.svg" type="image/svg+xml">\n  <meta name="theme-color" content="#f7f5f2" media="(prefers-color-scheme: light)">\n  <meta name="theme-color" content="#151412" media="(prefers-color-scheme: dark)">\n  <link rel="stylesheet" href="/assets/style.css">'
    );
  }

  // Add theme-color if missing
  if (!html.includes('name="theme-color"')) {
    html = html.replace(
      '<link rel="stylesheet" href="/assets/style.css">',
      '<meta name="theme-color" content="#f7f5f2" media="(prefers-color-scheme: light)">\n  <meta name="theme-color" content="#151412" media="(prefers-color-scheme: dark)">\n  <link rel="stylesheet" href="/assets/style.css">'
    );
  }

  // Replace CSS version query strings
  html = html.replace(/\/assets\/style.css\?v=\d+/g, "/assets/style.css");

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
