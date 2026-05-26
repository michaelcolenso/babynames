import type { PagesFunction } from "@cloudflare/workers-types";

const LINK_HEADER =
  '</.well-known/api-catalog>; rel="api-catalog", ' +
  '</about>; rel="service-doc", ' +
  '</.well-known/agent-skills/index.json>; rel="https://agentskills.io/rel/skills-index"';

const MARKDOWN = `# NobodyNamed

A cultural history of American baby names built on Social Security Administration birth records from 1880 to 2025.

## What This Site Does

Every name that has ever appeared in US birth records is classified by trend: rising, stable, declining, endangered, or extinct. Search any name to see where it peaked, when it fell, and how it compares to the current moment.

## APIs

All endpoints are public. No authentication required. Base URL: \`https://nobodynamed.com\`

### Search names
\`\`\`
GET /api/search?q={prefix}
\`\`\`
Returns up to 10 autocomplete suggestions for names starting with \`prefix\`.

### Full name timeseries
\`\`\`
GET /api/name/{name}
\`\`\`
Yearly birth counts 1880–2025 for both sexes, plus trend classification (rising/stable/declining/endangered/extinct), peak year, peak count, and computed metrics.

### Site metadata
\`\`\`
GET /api/meta
\`\`\`
Top-10 names per year, total births per year, year range.

### Collections
\`\`\`
GET /api/landing/{kind}
\`\`\`
Curated lists. \`kind\`: \`extinct\` | \`endangered\` | \`rising\` | \`comeback\`

### Birth year roster
\`\`\`
GET /api/year/{year}
\`\`\`
Top names for a given birth year (1880–2025).

## Name Classifications

| Status | Meaning |
|--------|---------|
| \`rising\` | Gaining share of total births |
| \`stable\` | Holding position with low variance |
| \`declining\` | Losing share, still in active use |
| \`endangered\` | Near-zero recent counts |
| \`extinct\` | Zero births in the most recent years on record |

## Data

- Source: U.S. Social Security Administration (public domain)
- Coverage: 1880–2025, ~100,000 unique name/sex pairs, ~1.9M data points
- SSA suppresses names with fewer than 5 births in a given year
- Updated annually (typically May)

## Machine-Readable Resources

- API catalog: https://nobodynamed.com/.well-known/api-catalog
- Agent skills: https://nobodynamed.com/.well-known/agent-skills/index.json
- About & methodology: https://nobodynamed.com/about
`;

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const accept = ctx.request.headers.get("Accept") ?? "";

  if (accept.includes("text/markdown")) {
    const tokens = Math.ceil(MARKDOWN.length / 4);
    return new Response(MARKDOWN, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Vary": "Accept",
        "Link": LINK_HEADER,
        "x-markdown-tokens": String(tokens),
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  }

  const res = await ctx.env.ASSETS.fetch(ctx.request);
  const headers = new Headers(res.headers);
  headers.set("Link", LINK_HEADER);
  headers.set("Vary", "Accept");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
};
