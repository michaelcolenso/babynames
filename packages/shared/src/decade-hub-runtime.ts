import type { DecadeProfile } from "./decade-hub-types";
import { validateDecadeHubProfile, type DecadeHubValidationIssue } from "./decade-hub-validate";
import {
  getDecadeHubDefinition,
  type DecadeHubDefinition,
} from "./content/decade-hub-definitions";
import { DECADE_THESES, type DecadeThesis } from "./content/decade-theses";

export type DecadeHubRuntimeResult =
  | {
      readonly status: "eligible";
      readonly definition: DecadeHubDefinition;
      readonly thesis: DecadeThesis;
      readonly profile: DecadeProfile;
    }
  | {
      readonly status: "ineligible";
      readonly reason: "unknown-definition" | "draft-definition" | "missing-thesis" | "thesis-provenance" | "malformed-json" | "invalid-profile";
      readonly definition?: DecadeHubDefinition;
      readonly issues?: readonly DecadeHubValidationIssue[];
    }
  | {
      readonly status: "unavailable";
      readonly reason: "query-failed" | "missing-row";
      readonly definition: DecadeHubDefinition;
    };

export interface DecadeHubRuntimeLogger {
  warn(message: string, details: Readonly<Record<string, unknown>>): void;
}

/**
 * Trusted route boundary for persisted decade-hub profiles.
 *
 * Expected persistence and payload failures are classified here. Rendering is
 * deliberately not part of this function, so renderer/programmer errors remain
 * visible to the Pages runtime rather than being disguised as missing data.
 */
export async function loadDecadeHubRuntime(
  db: D1Database,
  slug: string,
  logger: DecadeHubRuntimeLogger = console,
): Promise<DecadeHubRuntimeResult> {
  const definition = getDecadeHubDefinition(slug);
  if (!definition) return { status: "ineligible", reason: "unknown-definition" };
  return loadDecadeHubRuntimeForDefinition(db, definition, DECADE_THESES[definition.slug], logger);
}

/** Injectable definition seam for direct rollout-state and provenance tests. */
export async function loadDecadeHubRuntimeForDefinition(
  db: D1Database,
  definition: DecadeHubDefinition,
  thesis: DecadeThesis | undefined,
  logger: DecadeHubRuntimeLogger = console,
): Promise<DecadeHubRuntimeResult> {
  if (definition.rolloutState === "draft") {
    return { status: "ineligible", reason: "draft-definition", definition };
  }
  if (!thesis) return { status: "ineligible", reason: "missing-thesis", definition };
  if (!definition.thesisSourceVersion || thesis.sourceVersion !== definition.thesisSourceVersion) {
    return { status: "ineligible", reason: "thesis-provenance", definition };
  }

  let row: { payload: string } | null;
  try {
    row = await db
      .prepare("SELECT payload FROM decade_hub WHERE decade = ?1")
      .bind(definition.slug)
      .first<{ payload: string }>();
  } catch {
    logger.warn("decade hub profile query failed", { slug: definition.slug, reason: "query-failed" });
    return { status: "unavailable", reason: "query-failed", definition };
  }
  if (!row || typeof row.payload !== "string") {
    return { status: "unavailable", reason: "missing-row", definition };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(row.payload);
  } catch {
    logger.warn("decade hub profile payload is malformed", { slug: definition.slug, reason: "malformed-json" });
    return { status: "ineligible", reason: "malformed-json", definition };
  }

  const validation = validateDecadeHubProfile(payload, definition);
  if (!validation.ok) {
    logger.warn("decade hub profile failed validation", {
      slug: definition.slug,
      reason: "invalid-profile",
      issueCodes: [...new Set(validation.issues.map((issue) => issue.code))],
    });
    return {
      status: "ineligible",
      reason: "invalid-profile",
      definition,
      issues: validation.issues,
    };
  }

  return {
    status: "eligible",
    definition,
    thesis,
    profile: validation.profile,
  };
}
