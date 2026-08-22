// Content Factory — blog post renderer.
// Emits content/blog/<slug>.md (frontmatter + interpolated body).
// Round-trip verification through compileBlogPost happens in the CLI/test
// layer (compileBlogPost lives in scripts/, outside the shared package).

import { interpolateBody } from "./factory-compute";
import type { ClaimValue, ContentDefinition } from "./factory-types";

export interface RenderPostOpts {
  date: string; // YYYY-MM-DD
  author?: string;
  status?: "draft" | "published";
  ogImage?: string;
}

export function renderFactoryPostMarkdown(
  def: ContentDefinition,
  evaluatedClaims: Record<string, ClaimValue>,
  bodyTemplate: string,
  panels: Record<string, string>,
  opts: RenderPostOpts,
): string {
  const body = interpolateBody(bodyTemplate, evaluatedClaims, panels);
  const frontmatter = [
    "---",
    `title: "${escapeQuotes(def.title)}"`,
    `date: "${opts.date}"`,
    `description: "${escapeQuotes(def.description)}"`,
    `author: "${escapeQuotes(opts.author ?? "NobodyNamed")}"`,
    `status: "${opts.status ?? "published"}"`,
    `og_image: "${opts.ogImage ?? "/api/og/default"}"`,
    `slug: "${def.slug}"`,
    "---",
    "",
  ].join("\n");

  return `${frontmatter}# ${def.title}\n\n${body}\n`;
}

function escapeQuotes(value: string): string {
  return value.replace(/"/g, '\\"');
}
