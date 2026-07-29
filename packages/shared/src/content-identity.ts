export type ContentType = "name-page" | "article" | "visualization" | "newsletter" | "franchise-hub" | "state-page" | "decade-hub";

export interface ContentIdentity {
  contentId: string;
  contentType: ContentType;
  slug: string;
  franchiseId?: string;
  publishedAt?: string;
  primaryNames?: string[];
  primaryStates?: string[];
  startYear?: number;
  endYear?: number;
}

export function contentId(type: ContentType, slug: string, qualifier?: string): string {
  const cleanSlug = slug.trim().toLowerCase().replace(/^\/+|\/+$/g, "").replace(/[^a-z0-9:-]+/g, "-");
  const cleanQualifier = qualifier?.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `${type === "franchise-hub" ? "franchise" : type.replace(/-page$/, "")}:${cleanSlug}${cleanQualifier ? `:${cleanQualifier}` : ""}`;
}

export function contentIdentityMeta(identity: ContentIdentity): string {
  const attrs: Record<string, string | undefined> = {
    "data-content-id": identity.contentId,
    "data-content-type": identity.contentType,
    "data-content-slug": identity.slug,
    "data-franchise-id": identity.franchiseId,
  };
  return Object.entries(attrs)
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([key, value]) => `${key}="${escapeAttr(value)}"`)
    .join(" ");
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
