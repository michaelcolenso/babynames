import type { ContentIdentity, ContentType } from "./content-identity";

export type AnalyticsEventName =
  | "landing"
  | "meaningful_content_view"
  | "internal_discovery_click"
  | "second_content_view"
  | "newsletter_signup_start"
  | "newsletter_signup_complete"
  | "return_visit"
  // Registry-driven decade hubs (event contract is stable; keep in sync with
  // apps/web/functions/api/analytics/event.ts EVENT_NAMES).
  | "decade_hub_view"
  | "decade_hub_scroll_depth"
  | "decade_hub_engaged_time"
  | "decade_hub_internal_click"
  | "decade_hub_share"
  | "decade_hub_copy_link"
  | "ownership_tab_changed"
  | "ownership_sort_changed"
  | "ownership_name_clicked"
  | "ownership_methodology_clicked"
  | "classroom_loaded"
  | "classroom_name_clicked"
  | "classroom_duplicate_clicked"
  | "classroom_completed"
  | "spelling_family_expanded"
  | "spelling_family_chart_interacted"
  | "spelling_variant_clicked"
  | "spelling_methodology_clicked";

export interface AnalyticsEvent {
  name: AnalyticsEventName;
  contentId?: string;
  contentType?: ContentType;
  targetContentId?: string;
  targetContentType?: ContentType;
  sourcePlacement?: string;
  franchiseId?: string;
}

export function eventFromContent(name: AnalyticsEventName, identity: ContentIdentity, extra: Omit<AnalyticsEvent, "name" | "contentId" | "contentType" | "franchiseId"> = {}): AnalyticsEvent {
  return { name, contentId: identity.contentId, contentType: identity.contentType, franchiseId: identity.franchiseId, ...extra };
}

export function validateAnalyticsEvent(event: AnalyticsEvent): string[] {
  const errors: string[] = [];
  if (!event.name) errors.push("Analytics event needs a name");
  if (event.name === "internal_discovery_click" && !event.targetContentId) errors.push("Discovery clicks need targetContentId");
  if ((event.name === "newsletter_signup_start" || event.name === "newsletter_signup_complete") && !event.sourcePlacement) errors.push("Newsletter signup events need sourcePlacement");
  return errors;
}
