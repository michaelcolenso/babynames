# Classic Names CTR Improvement Implementation Plan

> **For Hermes:** Implement this plan task-by-task using strict TDD.

**Goal:** Improve `/classic-names` search CTR with concise metadata and substantive crawlable editorial content.

**Architecture:** Extend the existing root editorial route configuration with optional structured sections, then render those sections beneath the existing overview and cards. Keep the change isolated to the current route module.

**Tech Stack:** TypeScript, Cloudflare Pages Functions, Node test runner via `tsx --test`.

---

### Task 1: Define SEO and content behavior with a failing test

**Files:**
- Create: `scripts/editorial-pages.test.ts`
- Modify: `apps/web/functions/[slug].ts`

1. Export a read-only editorial page config accessor for testing.
2. Write a test asserting title/description bounds, clean H1, three sections, internal links, and 300–500 editorial words.
3. Run `npx tsx --test scripts/editorial-pages.test.ts` and verify it fails because the current config does not meet the contract.

### Task 2: Implement structured classic-name editorial content

**Files:**
- Modify: `apps/web/functions/[slug].ts`

1. Add the optional section type and renderer.
2. Replace classic-page metadata with the approved concise variants.
3. Add three data-grounded editorial sections with internal links.
4. Run the focused test and verify it passes.

### Task 3: Verify and deliver

1. Run `npm run typecheck`.
2. Run `npm run build`.
3. Review `git diff --check` and the complete diff.
4. Commit, push, and open a PR against `master`.
