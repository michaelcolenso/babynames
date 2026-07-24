export type StoryStatus = "draft" | "review" | "published";
export type EvidenceKind = "query" | "source" | "manual";

export interface StoryEvidence { id: string; kind: EvidenceKind; title: string; url?: string; query?: string; }
export interface StoryClaim { id: string; text: string; evidenceIds: string[]; }
export interface StoryVisual { id: string; title: string; alt: string; asset?: string; }
export interface StoryPackage {
  schemaVersion: 1;
  id: string;
  slug: string;
  title: string;
  status: StoryStatus;
  franchiseId?: string;
  publishedAt?: string;
  updatedAt: string;
  dek: string;
  primaryNames?: string[];
  primaryStates?: string[];
  startYear?: number;
  endYear?: number;
  claims: StoryClaim[];
  evidence: StoryEvidence[];
  visuals?: StoryVisual[];
}

export function validateStoryPackage(story: StoryPackage, seenIds: Set<string> = new Set()): string[] {
  const errors: string[] = [];
  if (story.schemaVersion !== 1) errors.push("Unsupported story schemaVersion");
  if (!story.id) errors.push("Story needs id");
  if (seenIds.has(story.id)) errors.push(`Duplicate story id: ${story.id}`);
  if (story.status === "published" && !story.publishedAt) errors.push("Published stories need publishedAt");
  if (story.startYear && story.endYear && story.endYear < story.startYear) errors.push("Story endYear cannot precede startYear");
  const evidenceIds = new Set(story.evidence.map((item) => item.id));
  for (const claim of story.claims) {
    if (!claim.evidenceIds.length) errors.push(`Claim ${claim.id} needs evidence`);
    for (const id of claim.evidenceIds) if (!evidenceIds.has(id)) errors.push(`Claim ${claim.id} references missing evidence ${id}`);
  }
  for (const visual of story.visuals ?? []) if (!visual.alt.trim()) errors.push(`Visual ${visual.id} needs alt text`);
  return errors;
}
