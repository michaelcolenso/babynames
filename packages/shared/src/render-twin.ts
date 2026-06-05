// HTML renderer for /name/:name/twin/ — similar-name discovery page.

import { pageShell } from "./render-shell";

export interface TwinResult {
  name: string;
  sex: string;
  similarity: number;
}

export function renderTwinPage(
  targetName: string,
  targetSex: string,
  twins: TwinResult[],
  opts: { canonical: string; origin?: string },
): string {
  const sexLabel = targetSex === "M" ? "Masculine" : "Feminine";
  const title = `Names like ${targetName} — similar baby names | NobodyNamed`;
  const desc = `Baby names with the most similar popularity trajectory to ${targetName}. Cosine-similarity ranking from SSA data.`;
  const origin = opts.origin || new URL(opts.canonical).origin;
  const ogImageUrl = `${origin}/api/og/${encodeURIComponent(targetName)}`;
  const nameUrl = `${origin}/name/${encodeURIComponent(targetName)}/`;

  const structuredData = JSON.stringify([
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: origin + "/" },
        { "@type": "ListItem", position: 2, name: `${targetName} dossier`, item: nameUrl },
        { "@type": "ListItem", position: 3, name: "Similar names", item: opts.canonical },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: title,
      url: opts.canonical,
      description: desc,
      isPartOf: { "@type": "WebSite", name: "NobodyNamed", url: origin + "/" },
      mainEntity: {
        "@type": "ItemList",
        name: `Names similar to ${targetName}`,
        itemListElement: twins.slice(0, 10).map((t, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: t.name,
          url: `${origin}/name/${encodeURIComponent(t.name)}/`,
        })),
      },
    },
  ]).replace(/</g, "\\u003c");

  const twinCards = twins
    .map((t) => {
      return `<a class="diagnosis-card" href="/name/${encodeURIComponent(t.name)}/">
  <span class="card-name">${escapeHtml(t.name)}</span>
  <span class="card-status">${t.sex === "M" ? "Masculine" : "Feminine"} · similarity ${t.similarity}</span>
</a>`;
    })
    .join("");

  return pageShell({
    title,
    description: desc,
    canonical: opts.canonical,
    ogImage: ogImageUrl,
    ogType: "article",
    currentPath: undefined,
    body: `
    <p class="eyebrow">Trajectory match</p>
    <h1>Names like ${escapeHtml(targetName)}</h1>
    <p class="lede">The baby names whose popularity curves most closely resemble ${escapeHtml(targetName)}. Ranked by cosine similarity of their 60-year normalized sparklines.</p>
    <nav class="report-links" aria-label="Back to dossier">
      <a href="${escapeHtml(nameUrl)}">← ${escapeHtml(targetName)} dossier</a>
    </nav>
    <div class="diagnosis-grid">${twinCards}</div>
  `,
    structuredData: JSON.parse(structuredData),
    footerVariant: "minimal",
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
