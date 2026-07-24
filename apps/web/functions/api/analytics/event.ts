import { validateAnalyticsEvent } from "@nv/shared";
import type { AnalyticsEvent, AnalyticsEventName } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

const EVENT_NAMES: readonly AnalyticsEventName[] = [
  "landing",
  "meaningful_content_view",
  "internal_discovery_click",
  "second_content_view",
  "newsletter_signup_start",
  "newsletter_signup_complete",
  "return_visit",
];

type IncomingEvent = AnalyticsEvent & { sessionId?: string };

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  try {
    const body = (await ctx.request.json()) as IncomingEvent;
    const name = body?.name;

    if (!EVENT_NAMES.includes(name as AnalyticsEventName)) {
      return new Response(null, { status: 204 });
    }

    const event: AnalyticsEvent = {
      name: name as AnalyticsEventName,
      contentId: body.contentId,
      contentType: body.contentType,
      targetContentId: body.targetContentId,
      targetContentType: body.targetContentType,
      sourcePlacement: body.sourcePlacement,
      franchiseId: body.franchiseId,
    };

    const errors = validateAnalyticsEvent(event);
    if (errors.length === 0) {
      const sessionId = String(body.sessionId ?? "").slice(0, 200) || null;
      const contentId = event.contentId ? String(event.contentId).slice(0, 200) : null;
      const contentType = event.contentType ? String(event.contentType).slice(0, 200) : null;
      const targetContentId = event.targetContentId ? String(event.targetContentId).slice(0, 200) : null;
      const targetContentType = event.targetContentType ? String(event.targetContentType).slice(0, 200) : null;
      const sourcePlacement = event.sourcePlacement ? String(event.sourcePlacement).slice(0, 200) : null;
      const franchiseId = event.franchiseId ? String(event.franchiseId).slice(0, 200) : null;

      try {
        await ctx.env.DB.prepare(
          `INSERT INTO analytics_events(name, content_id, content_type, target_content_id, target_content_type, source_placement, franchise_id, session_id)
           VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
        )
          .bind(
            String(event.name).slice(0, 200),
            contentId,
            contentType,
            targetContentId,
            targetContentType,
            sourcePlacement,
            franchiseId,
            sessionId,
          )
          .run();
      } catch {
        // Analytics failures must never surface to the client.
      }
    }
  } catch {
    // Malformed JSON or any other failure — swallow silently.
  }

  return new Response(null, { status: 204 });
};
