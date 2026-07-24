// nobodynamed — client-side analytics beacon.
//
// Fires typed events (see packages/shared/src/analytics.ts for the vocabulary)
// to /api/analytics/event via sendBeacon. Never throws, never blocks
// rendering — analytics is best-effort only. Local dev (`localhost` /
// `127.0.0.1`) logs to the console instead of hitting the network so it
// doesn't pollute production data.

(function () {
  function isLocalDev() {
    return location.hostname === "localhost" || location.hostname === "127.0.0.1";
  }

  function getSessionId() {
    try {
      var existing = localStorage.getItem("nv_sid");
      if (existing) return existing;
      var id;
      try {
        id = crypto.randomUUID();
      } catch (e) {
        id = "sid-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      }
      localStorage.setItem("nv_sid", id);
      return id;
    } catch (e) {
      // localStorage unavailable (private browsing, etc.) — fall back to an
      // ephemeral per-call id rather than throwing.
      return "sid-" + Math.random().toString(36).slice(2);
    }
  }

  function send(event) {
    try {
      if (isLocalDev()) {
        console.debug("[nv analytics]", event);
        return;
      }
      var url = "/api/analytics/event";
      var body = JSON.stringify(event);
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
      } else if (window.fetch) {
        fetch(url, {
          method: "POST",
          body: body,
          headers: { "Content-Type": "application/json" },
          keepalive: true,
        }).catch(function () {});
      }
    } catch (e) {
      // Analytics must never break the page.
    }
  }

  function nvTrack(name, opts) {
    try {
      var event = Object.assign({ name: name, sessionId: getSessionId() }, opts || {});
      send(event);
    } catch (e) {
      // no-op
    }
  }
  window.nvTrack = nvTrack;

  function getPageIdentity() {
    var identity = {};
    try {
      var el = document.querySelector("[data-content-id]");
      if (el) {
        if (el.dataset.contentId) identity.contentId = el.dataset.contentId;
        if (el.dataset.contentType) identity.contentType = el.dataset.contentType;
        if (el.dataset.franchiseId) identity.franchiseId = el.dataset.franchiseId;
      }
    } catch (e) {
      // no-op — identity stays empty.
    }
    return identity;
  }

  var MEANINGFUL_CONTENT_TYPES = ["name-page", "article", "visualization"];

  function trackPageView() {
    try {
      var pageIdentity = getPageIdentity();

      nvTrack("landing", pageIdentity);

      if (MEANINGFUL_CONTENT_TYPES.indexOf(pageIdentity.contentType) !== -1) {
        nvTrack("meaningful_content_view", pageIdentity);
      }

      try {
        var count = Number(sessionStorage.getItem("nv_view_count") || "0") + 1;
        sessionStorage.setItem("nv_view_count", String(count));
        if (count === 2) {
          nvTrack("second_content_view", pageIdentity);
        }
      } catch (e) {
        // sessionStorage unavailable — skip the view-count milestone.
      }

      try {
        if (localStorage.getItem("nv_seen")) {
          nvTrack("return_visit", pageIdentity);
        }
        localStorage.setItem("nv_seen", "1");
      } catch (e) {
        // localStorage unavailable — skip return-visit tracking.
      }

      if (location.search.indexOf("subscribed=1") !== -1) {
        var sourcePlacement = "unknown";
        try {
          sourcePlacement = sessionStorage.getItem("nv_newsletter_placement") || "unknown";
          sessionStorage.removeItem("nv_newsletter_placement");
        } catch (e) {
          // sessionStorage unavailable — fall back to "unknown".
        }
        nvTrack("newsletter_signup_complete", { sourcePlacement: sourcePlacement });
      }
    } catch (e) {
      // no-op
    }
  }

  function initListeners() {
    var pageIdentity = getPageIdentity();

    document.addEventListener("click", function (event) {
      try {
        var el = event.target.closest && event.target.closest("[data-track-target-id]");
        if (!el) return;
        var placementEl = el.closest("[data-source-placement]");
        nvTrack(
          "internal_discovery_click",
          Object.assign({}, pageIdentity, {
            targetContentId: el.dataset.trackTargetId,
            targetContentType: el.dataset.trackTargetType,
            sourcePlacement: el.dataset.trackSourcePlacement || (placementEl && placementEl.dataset.sourcePlacement),
          }),
        );
      } catch (e) {
        // no-op
      }
    });

    document.addEventListener("submit", function (event) {
      try {
        var form = event.target.closest && event.target.closest(".newsletter-signup form");
        if (!form) return;
        var container = form.closest(".newsletter-signup");
        var sourcePlacement = (container && container.dataset.sourcePlacement) || "unknown";
        var sourceContentId = container && container.dataset.sourceContentId;

        try {
          sessionStorage.setItem("nv_newsletter_placement", sourcePlacement);
        } catch (e) {
          // sessionStorage unavailable — placement won't survive to the
          // post-redirect completion event, but the start event still fires.
        }

        // send()'s beacon path already fires synchronously (no deferral),
        // which is what lets this survive the page unload caused by the
        // form's normal (non-prevented) navigation.
        nvTrack("newsletter_signup_start", { sourcePlacement: sourcePlacement, contentId: sourceContentId });
      } catch (e) {
        // no-op
      }
    });
  }

  function init() {
    trackPageView();
    initListeners();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
