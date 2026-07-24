import type { ContentIdentity, ContentType } from "./content-identity";

export type AnalyticsEventName =
  | "landing"
  | "meaningful_content_view"
  | "internal_discovery_click"
  | "second_content_view"
  | "newsletter_signup_start"
  | "newsletter_signup_complete"
  | "return_visit";

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
