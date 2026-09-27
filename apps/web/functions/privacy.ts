// GET /privacy — what NobodyNamed collects and why. Keep in sync with
// assets/analytics.js, functions/api/analytics/event.ts, the newsletter
// endpoints and assets/theme.js: every statement here describes their code.

import { pageShell } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

const BODY = `
  <p class="eyebrow">Privacy</p>
  <h1>What we collect</h1>
  <p class="lede">No accounts, no ads, no cookies, and no third-party or cross-site trackers. Here is everything the site does record.</p>

  <section class="section editorial-section">
    <h2>Page analytics</h2>
    <p>Our own script records a small set of events: which page was viewed, which internal link or control was clicked, how far you scrolled on some long pages, and whether a newsletter signup finished. Each event carries a random ID kept in your browser's session storage. It is erased when you close the tab, so it never links one visit to the next. We do not store your IP address, browser fingerprint or location with these events, and they are never shared or sold.</p>
  </section>

  <section class="section editorial-section">
    <h2>Newsletter</h2>
    <p>If you subscribe, we store your email address, the page you signed up from and the time you consented. Confirmation and newsletter emails are sent through our email provider, Resend. To stop abuse of the signup form, we count recent attempts against a keyed hash of your IP address and of the email address; those counters expire within a day and never store the address itself. An address that is never confirmed is deleted when its confirmation link expires. Every email includes a one-click unsubscribe link.</p>
  </section>

  <section class="section editorial-section">
    <h2>Stored in your browser</h2>
    <p>If you switch between light and dark mode, that choice is saved in your browser's local storage so the next page loads in the same theme. It never leaves your device.</p>
  </section>

  <section class="section editorial-section">
    <h2>Hosting</h2>
    <p>The site runs on Cloudflare, which processes every request to deliver and protect it and gives us aggregate traffic statistics.</p>
  </section>

  <section class="section editorial-section">
    <h2>The data on this site</h2>
    <p>Name statistics come from the Social Security Administration's public baby-name files, which contain no personal information: only first names, sexes, years and counts, and only names given to at least five babies in a year.</p>
  </section>
`;

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const html = pageShell({
    title: "Privacy — NobodyNamed",
    description: "What NobodyNamed collects: session-only page analytics, newsletter addresses you give us, and nothing else. No accounts, ads, cookies or cross-site trackers.",
    canonical: `${url.origin}/privacy`,
    currentPath: "/privacy",
    body: BODY,
  });
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
};
