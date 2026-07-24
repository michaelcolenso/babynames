# nobodynamed editorial growth implementation plan

**Planning period:** July 20, 2026–October 18, 2026  
**Primary objective:** Turn nobodynamed from a strong baby-name data product into a repeatable editorial publication with measurable audience growth, deeper internal discovery, and a newsletter-driven retention loop.

## Executive summary

nobodynamed already has a credible technical foundation: Cloudflare Pages and Pages Functions for the frontend and API, D1 for structured data, a scheduled Cloudflare Worker for SSA ingestion, Queues for ingestion fan-out, R2 for source-archive storage, and shared TypeScript logic across the web and ingestion packages.

The product's strongest differentiator is not generic baby-name search. It is the ability to reveal culturally meaningful patterns in authoritative U.S. name data, including state-specific names, regional concentration, generational signatures, names entering or leaving use, geographic diffusion, and unusual historical trajectories.

The 90-day cycle should focus on five capabilities:

1. Analytics and content attribution.
2. One flagship editorial franchise.
3. A canonical story-package format.
4. Internal discovery.
5. A lean newsletter system.

The cycle should deliberately avoid framework migrations, major redesigns, user accounts, saved-name watchlists, broad parenting content, generic AI baby-name generation, and unrelated programmatic SEO expansion.

## Target state by October 18, 2026

### User-facing capabilities

- Readers can navigate from a name page to genuinely related names, stories, states, and visualizations.
- At least one editorial franchise publishes on a repeatable schedule.
- Every flagship story contains clear sourcing and links into the broader data product.
- Newsletter signup is available at high-intent points.
- A public newsletter archive exists.
- Story pages and visualization pages have consistent attribution metadata.

### Data capabilities

- Editorial stories are represented through a canonical structured manifest.
- Related-name relationships can be generated from transparent data rules.
- Editorial claims can be connected to supporting queries or records.
- Content entities have stable identifiers.
- Story-performance data can be grouped by franchise.

### Operational capabilities

- A franchise story can be researched, validated, previewed, published, distributed, and measured through a documented workflow.
- Newsletter assembly does not require rebuilding the same content manually.
- Production smoke tests cover important editorial and conversion routes.
- Failures in analytics or newsletter delivery do not break the public site.

## Scope

### In scope

- Typed analytics event framework.
- Content and franchise identifiers.
- One flagship editorial franchise.
- Structured story manifests.
- Newsletter signup and delivery workflow.
- Related-name ranking.
- Article-to-name and visualization-to-name linking.
- Performance reporting.
- Editorial QA.
- Production smoke-test expansion.
- Accessibility and mobile checks for new components.

### Explicitly out of scope

- Rebuilding the site in another framework.
- Replacing D1.
- Redesigning the entire brand.
- Adding a social network or native app.
- Comprehensive user accounts.
- Generic name-generation features.
- Broad parenting advice.
- International expansion.
- Paid subscriptions during this cycle.

## Proposed architecture

### Content identity model

Every content object should receive a stable, human-readable identifier and expose it to HTML metadata, analytics events, newsletter links, story manifests, related-content records, and reporting queries.

```ts
export type ContentType =
  | "name-page"
  | "article"
  | "visualization"
  | "newsletter"
  | "franchise-hub"
  | "state-page";

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
```

Example IDs:

- `name:helen:f`
- `article:ground-zero-modern-names`
- `viz:debut-of-the-year`
- `franchise:american-name-atlas`
- `newsletter:2026-08-12`

### Canonical story-package manifest

Store editorial source files in the existing canonical blog/content location if one exists; otherwise use `content/stories/`. The manifest should include schema version, lifecycle status, franchise identity, editorial metadata, scope, claims, evidence, visuals, distribution copy, and related entities.

Minimum validation rules:

- Claims must reference existing evidence.
- Published stories must include publication dates.
- Visuals must include alt text.
- Names, states, and year ranges must be valid.
- Duplicate story IDs must fail validation.

### Editorial database additions

D1 should remain the source of truth for published metadata and subscriber records, while editorial source files remain version-controlled.

```sql
CREATE TABLE content_items (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  franchise_id TEXT,
  status TEXT NOT NULL,
  published_at TEXT,
  updated_at TEXT NOT NULL,
  metadata_json TEXT,
  UNIQUE(type, slug)
);

CREATE TABLE content_entities (
  content_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_key TEXT NOT NULL,
  relationship TEXT NOT NULL,
  weight REAL,
  PRIMARY KEY (content_id, entity_type, entity_key, relationship),
  FOREIGN KEY (content_id) REFERENCES content_items(id)
);

CREATE INDEX idx_content_entities_lookup
ON content_entities(entity_type, entity_key);
```

### Related-name model

Related names should initially use interpretable signals rather than opaque language-model recommendations:

```text
related_score =
  0.30 × trajectory_similarity
+ 0.20 × peak_year_similarity
+ 0.20 × state_affinity_similarity
+ 0.15 × popularity_band_similarity
+ 0.10 × era_overlap
+ 0.05 × editorial_relationship
```

Every recommendation shown to readers should have a readable explanation such as "Similar trajectory," "Peaked in the same era," or "Strong in many of the same states."

### Analytics architecture

Create a shared analytics module rather than placing provider calls throughout page code. Event names and required properties should be centrally typed, analytics failures should never block rendering, development mode should support inspection without polluting production, and subscriber PII must not be sent as event properties.

Baseline funnel events:

1. Landing.
2. Meaningful content view.
3. Internal discovery click.
4. Second content view.
5. Newsletter signup start.
6. Newsletter signup completion.
7. Return visit.

### Newsletter system

Use a provider abstraction so application logic is not coupled to one delivery vendor.

```ts
export interface NewsletterProvider {
  subscribe(input: {
    email: string;
    sourceContentId?: string;
    sourcePlacement: string;
    consentTimestamp: string;
  }): Promise<{ subscriberId: string }>;

  unsubscribe(token: string): Promise<void>;

  sendCampaign(input: {
    campaignId: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<{ providerCampaignId: string }>;
}
```

Subscriber and campaign tables should store consent source, campaign metadata, provider IDs, status, and timestamps. Public pages should never expose subscriber-specific tracking data.

## Workstreams

### 1. Analytics and content attribution

**Objective:** Create a reliable measurement layer before making major editorial or navigation changes.

Tasks:

1. Audit current analytics and document the baseline in `docs/analytics-baseline.md`.
2. Add stable content identities to priority content routes.
3. Implement typed analytics events and a web adapter.
4. Instrument the baseline funnel.
5. Build a weekly reporting query for users by content type, multi-content sessions, internal click-through, newsletter conversion, franchise performance, acquisition pages, signup sources, and returning visitor rate.

Completion gate: Do not evaluate editorial or related-content experiments until content IDs are deployed, funnel events are verified in production, and one week of stable baseline data has been collected.

### 2. Flagship editorial franchise: American Name Atlas

**Objective:** Prove that a repeatable editorial format can outperform isolated stories.

Franchise thesis: Every state has names it uses at rates far above the national norm, revealing migration, ethnicity, religion, local heroes, language, and regional identity.

Qualification rules:

- State count clears a minimum reliability threshold.
- National count is sufficient for meaningful comparison.
- State-share-to-national-share ratio exceeds a defined threshold.
- The finding is not driven by one tiny denominator.
- The claim can be reproduced from stored data.
- Historical or cultural interpretation is marked separately from statistical fact.

Pilot sequence:

1. One single-state deep dive.
2. One multi-state thematic comparison.
3. One national "every state's most distinctive name" package.

Completion gate: Continue the franchise only when three stories have shipped, query and chart production are repeatable, factual review time is manageable, and at least one engagement metric beats the general editorial baseline.

### 3. Canonical story package

**Objective:** Create one source of truth for every flagship story and its downstream outputs.

Tasks:

1. Add the schema and runtime validation to `packages/shared`.
2. Extend existing blog preview and publishing scripts instead of introducing an unrelated CMS.
3. Add editorial validation for missing sources, missing evidence references, missing chart alt text, unknown names, invalid states, impossible year ranges, duplicate IDs, and published stories without publication dates.
4. Add output adapters for article rendering, metadata, newsletter excerpts, social copy, and video scene manifests.

Completion gate: A complete story is publishable from one manifest without manually retyping the core thesis, claims, names, dates, and sources into separate output systems.

### 4. Internal discovery

**Objective:** Increase the percentage of visitors who consume a second meaningful piece of content.

Tasks:

1. Generate transparent related-name relationships for a limited subset first.
2. Add related-name API/data access.
3. Add related-name modules to priority name pages.
4. Build editorial-to-name and name-to-editorial linking.
5. Create franchise hub pages such as `/stories/american-name-atlas`.

Completion gate: Recommendations have readable reasons, click events are tracked, second-content-view rate improves against baseline, and weak recommendations degrade gracefully.

### 5. Newsletter

**Objective:** Convert successful editorial traffic into a durable returning audience.

Positioning: One surprising pattern in American names each week.

Tasks:

1. Select a delivery provider using API access, unsubscribe support, sender reputation, template support, webhook support, early-stage pricing, and exportability as criteria.
2. Build `POST /api/newsletter/subscribe` with email normalization, validation, duplicate-safe responses, consent capture, source attribution, rate limiting, bot mitigation, and non-enumerating responses.
3. Add signup placements after core findings, at article ends, on franchise hubs, after high-engagement visualizations, on selected name pages, and in the footer.
4. Build immediate, auditable unsubscribe flow.
5. Build `/newsletter` and `/newsletter/:issue` archive routes.
6. Generate newsletter modules from story manifests.
7. Measure signup conversion, signup source, delivery, opens where privacy-appropriate, clicks, unsubscribes, return sessions, and newsletter-driven second-page views.

Completion gate: Signups are stored safely, consent source is captured, unsubscribe works, one campaign has been delivered, archive pages are live, newsletter traffic is attributable, and the workflow is documented and repeatable.

## Testing and quality strategy

### Unit tests

Add tests for story schema validation, content ID generation, event validation, related-name scoring, affinity eligibility rules, email normalization, and unsubscribe-token validation.

### Integration tests

Test story-package-to-article, story-package-to-content-database, signup endpoint to subscriber storage, related-name generation to name-page response, campaign archive rendering, and database migrations.

### Data-quality tests

Add checks for impossible state codes, years outside source coverage, negative counts, affinity ratios with zero denominators, story claims referencing missing evidence, relationship rows referencing nonexistent names, and duplicate published story IDs.

### Smoke tests

Expand production smoke tests to verify homepage, representative name page, representative state page, article page, franchise hub, newsletter archive, subscribe endpoint, related-name module, and visualization route.

### Accessibility and performance

New modules must preserve keyboard navigation, focus visibility, form labels, error announcements, color-independent chart interpretation, alt text, data alternatives, reduced-motion compatibility, page response time, chart asset size, related-content query time, newsletter form latency, and analytics JavaScript size.

## Phased schedule

| Phase | Dates | Release artifact | Exit criteria |
| --- | --- | --- | --- |
| 1. Measurement foundation | July 20–August 2, 2026 | Analytics-enabled production release | Priority routes emit verified events, no duplicate page views, baseline report is reproducible, analytics failures do not affect product behavior. |
| 2. Story-package foundation | August 3–August 16, 2026 | One story published from a structured manifest | Article is generated from one package, claims reference evidence, invalid packages fail before publication, content metadata reaches D1. |
| 3. American Name Atlas pilot | August 17–September 6, 2026 | Three-part pilot | Three stories published, methodology documented, results reproducible, at least one engagement metric exceeds baseline. |
| 4. Internal discovery | September 7–September 20, 2026 | Related-name and related-story modules | Readable reasons, acceptable query performance, click tracking verified, graceful empty states, improved second-content-view rate. |
| 5. Newsletter launch | September 21–October 4, 2026 | Live weekly newsletter with public archive | Subscriber storage, consent, unsubscribe, attribution, at least two issues, and repeatable campaign production work. |
| 6. Optimization and decision review | October 5–October 18, 2026 | 90-day validation report | KPIs and guardrails are reported, continue/revise/pause decision is documented. |

## Decision gates

### Continue aggressively

Continue investing when the franchise consistently beats baseline engagement, newsletter conversion demonstrates owned-audience demand, internal discovery produces materially deeper sessions, story production becomes repeatable, readers return through email or direct traffic, and data quality remains strong.

### Continue with revision

Reposition when stories attract traffic but do not convert, newsletter demand exists but internal discovery underperforms, one story type works but the franchise is too broad, social engagement is strong but site engagement is weak, or editorial production remains too expensive.

### Pause expansion

Pause the next growth cycle when no franchise outperforms baseline, newsletter signup remains negligible after meaningful traffic, related modules do not increase exploration, publication quality requires unsustainable manual effort, data validation repeatedly blocks releases, or audience demand is largely generic name lookup with no editorial retention.

## Definition of complete

The implementation cycle is complete when:

1. Priority content routes use stable content identities.
2. Analytics measures the full discovery and newsletter funnel.
3. One editorial franchise has published at least three validated installments.
4. Flagship stories are generated from a canonical structured package.
5. Story claims are connected to evidence.
6. Related-name and related-content modules are live on priority pages.
7. Recommendations are interpretable and versioned.
8. Newsletter signup, consent, unsubscribe, delivery, and archives function correctly.
9. At least two live newsletter issues have been sent.
10. Production smoke tests cover all new critical routes.
11. Performance and accessibility have not materially regressed.
12. The project has enough evidence to decide whether editorial audience growth deserves another 90-day investment cycle.
