// nobodynamed — 1980s decade hub enhancement layer.
//
// Everything here is an enhancement: all primary content is server-rendered,
// and every feature degrades gracefully when this file never loads (tabs stay
// anchored sections, tables stay in their SSR order, share controls stay
// hidden) or when window.nvTrack is absent (analytics no-op; UI still works).
//
// Analytics contract (SPEC §10): events ride the closed vocabulary in
// packages/shared/src/analytics.ts onto the analytics_events D1 columns.
// content_id/content_type come from the page wrapper's data-content-*
// attributes; per-event targets and source_placement are set at each call
// site below. Every beacon is fire-once per page view where noted.

(function () {
  function track(name, opts) {
    try {
      if (typeof window.nvTrack === "function") window.nvTrack(name, opts || {});
    } catch (e) {
      // analytics must never break the page
    }
  }

  var fired = {};
  function once(key) {
    if (fired[key]) return false;
    fired[key] = true;
    return true;
  }

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  function pageIdentity() {
    var el = document.querySelector("[data-content-id]");
    if (!el) return {};
    return { contentId: el.getAttribute("data-content-id"), contentType: el.getAttribute("data-content-type") };
  }

  function routePath() {
    var el = document.querySelector("[data-dh-route]");
    return el ? el.getAttribute("data-dh-route") : location.pathname;
  }

  // ── Page view beacon (explicit, in addition to the auto landing event) ──
  function initView() {
    track("decade_hub_view", { sourcePlacement: routePath() });
  }

  // ── Ownership tabs ───────────────────────────────────────────────────────
  // SSR emits a nav of anchors plus all panels visible; upgrade to an
  // aria-complete tablist. With JS disabled the anchors simply scroll.
  function initTabs() {
    var container = document.querySelector("[data-dh-tabs]");
    if (!container) return;
    var nav = container.querySelector(".dh-tabs");
    var tabs = Array.prototype.slice.call(container.querySelectorAll("[data-dh-tab]"));
    var panels = Array.prototype.slice.call(container.querySelectorAll("[data-dh-panel]"));
    if (!nav || !tabs.length || !panels.length) return;

    nav.setAttribute("role", "tablist");

    function panelFor(tab) {
      var id = tab.getAttribute("data-dh-tab");
      for (var i = 0; i < panels.length; i++) {
        if (panels[i].getAttribute("data-dh-panel") === id) return panels[i];
      }
      return null;
    }

    function activate(tab, focus) {
      tabs.forEach(function (t) {
        var selected = t === tab;
        t.setAttribute("aria-selected", selected ? "true" : "false");
        t.setAttribute("tabindex", selected ? "0" : "-1");
        var panel = panelFor(t);
        if (panel) {
          if (selected) {
            panel.removeAttribute("hidden");
          } else {
            panel.setAttribute("hidden", "");
          }
        }
      });
      if (focus) tab.focus();
    }

    tabs.forEach(function (tab, index) {
      var panel = panelFor(tab);
      tab.setAttribute("role", "tab");
      tab.id = tab.id || "dh-tab-" + tab.getAttribute("data-dh-tab");
      if (panel) {
        panel.setAttribute("role", "tabpanel");
        panel.setAttribute("aria-labelledby", tab.id);
      }
      tab.addEventListener("click", function (event) {
        event.preventDefault();
        var wasSelected = tab.getAttribute("aria-selected") === "true";
        activate(tab, false);
        if (!wasSelected) {
          track("ownership_tab_changed", Object.assign(pageIdentity(), { sourcePlacement: tab.getAttribute("data-dh-tab") }));
        }
      });
      tab.addEventListener("keydown", function (event) {
        var next = null;
        if (event.key === "ArrowRight") next = tabs[(index + 1) % tabs.length];
        else if (event.key === "ArrowLeft") next = tabs[(index - 1 + tabs.length) % tabs.length];
        else if (event.key === "Home") next = tabs[0];
        else if (event.key === "End") next = tabs[tabs.length - 1];
        if (next) {
          event.preventDefault();
          activate(next, true);
        }
      });
    });

    // Default view: the tab marked data-dh-default (Girls), or the first.
    var initial = container.querySelector("[data-dh-default]") || tabs[0];
    activate(initial, false);
  }

  // ── Ownership table sorting ──────────────────────────────────────────────
  // Adds a button inside each sortable header cell; re-orders existing rows
  // only (no data fetch, no DOM rebuild beyond row order).
  function initSorting() {
    var tables = document.querySelectorAll("[data-dh-tabs] table");
    Array.prototype.forEach.call(tables, function (table) {
      var headCells = table.querySelectorAll("thead th");
      Array.prototype.forEach.call(headCells, function (th, colIndex) {
        if (!th.querySelector("button")) {
          var button = document.createElement("button");
          button.type = "button";
          button.textContent = th.textContent;
          th.textContent = "";
          th.setAttribute("data-dh-sort", "");
          th.appendChild(button);
        }
        th.querySelector("button").addEventListener("click", function () {
          var tbody = table.tBodies[0];
          if (!tbody) return;
          var rows = Array.prototype.slice.call(tbody.rows);
          var direction = th.getAttribute("aria-sort") === "ascending" ? "descending" : "ascending";
          var numeric = rows.some(function (row) {
            var cell = row.cells[colIndex];
            return cell && (cell.hasAttribute("data-dh-sort-value") || /^-?[\d,.]+$/.test(cell.textContent.trim()));
          });
          rows.sort(function (a, b) {
            var ca = a.cells[colIndex];
            var cb = b.cells[colIndex];
            var va = ca ? ca.getAttribute("data-dh-sort-value") || ca.textContent.trim() : "";
            var vb = cb ? cb.getAttribute("data-dh-sort-value") || cb.textContent.trim() : "";
            var cmp;
            if (numeric) {
              cmp = (parseFloat(String(va).replace(/[,%#]/g, "")) || 0) - (parseFloat(String(vb).replace(/[,%#]/g, "")) || 0);
            } else {
              cmp = String(va).localeCompare(String(vb));
            }
            return direction === "ascending" ? cmp : -cmp;
          });
          rows.forEach(function (row) { tbody.appendChild(row); });
          table.querySelectorAll("thead th").forEach(function (h) { h.removeAttribute("aria-sort"); });
          th.setAttribute("aria-sort", direction);
          track("ownership_sort_changed", Object.assign(pageIdentity(), {
            sourcePlacement: "column-" + colIndex + "-" + direction,
          }));
        });
      });
    });
  }

  // ── Share / copy ─────────────────────────────────────────────────────────
  function initShare() {
    var wrap = document.querySelector(".dh-share");
    if (!wrap) return;
    wrap.removeAttribute("hidden");
    var status = document.getElementById("dh-share-status");
    function announce(message) {
      if (!status) return;
      status.textContent = message;
      setTimeout(function () { status.textContent = ""; }, 4000);
    }
    function copyLink(sourceId) {
      var url = location.href;
      function done() {
        announce("Link copied.");
        track("decade_hub_copy_link", Object.assign(pageIdentity(), { sourcePlacement: sourceId }));
      }
      function fallback() {
        var input = document.createElement("textarea");
        input.value = url;
        document.body.appendChild(input);
        input.select();
        try { document.execCommand("copy"); done(); } catch (e) { announce("Copy failed — use the address bar."); }
        document.body.removeChild(input);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done, fallback);
      } else {
        fallback();
      }
    }
    var shareBtn = document.getElementById("dh-share");
    var copyBtn = document.getElementById("dh-copy-link");
    if (shareBtn) {
      if (!navigator.share) {
        shareBtn.setAttribute("hidden", "");
      } else {
        shareBtn.addEventListener("click", function () {
          navigator.share({ title: document.title, url: location.href }).then(function () {
            track("decade_hub_share", Object.assign(pageIdentity(), { sourcePlacement: "dh-share" }));
          }, function () { /* dismissed — not an event */ });
        });
      }
    }
    if (copyBtn) {
      copyBtn.addEventListener("click", function () { copyLink("dh-copy-link"); });
    }
  }

  // ── Scroll depth (25/50/75/100, fire-once each) ─────────────────────────
  function initScrollDepth() {
    var marks = [25, 50, 75, 100];
    function check() {
      var doc = document.documentElement;
      var max = doc.scrollHeight - window.innerHeight;
      if (max <= 0) return;
      var depth = Math.min(100, Math.round(((window.scrollY || doc.scrollTop) / max) * 100));
      marks.forEach(function (mark) {
        if (depth >= mark && once("depth:" + mark)) {
          track("decade_hub_scroll_depth", Object.assign(pageIdentity(), { sourcePlacement: String(mark) }));
        }
      });
    }
    var ticking = false;
    window.addEventListener("scroll", function () {
      if (ticking) return;
      ticking = true;
      setTimeout(function () { check(); ticking = false; }, 250);
    }, { passive: true });
    check();
  }

  // ── Engaged time (bucketed seconds, once, sendBeacon on pagehide) ───────
  function initEngagedTime() {
    var start = Date.now();
    function bucket(seconds) {
      if (seconds < 15) return "lt15s";
      if (seconds < 30) return "30s";
      if (seconds < 60) return "60s";
      if (seconds < 120) return "120s";
      if (seconds < 300) return "300s";
      return "300s+";
    }
    document.addEventListener("pagehide", function () {
      if (!once("engaged")) return;
      var seconds = Math.round((Date.now() - start) / 1000);
      track("decade_hub_engaged_time", Object.assign(pageIdentity(), { sourcePlacement: bucket(seconds) }));
    });
  }

  // ── Classroom observers ──────────────────────────────────────────────────
  // classroom_loaded: the roster grid has entered the viewport (once).
  // classroom_completed: the sentinel at the roster's end became visible
  // (once) — i.e. the visitor reached the bottom of the roster module.
  function initClassroom() {
    var roster = document.querySelector("[data-dh-roster]");
    var sentinel = document.querySelector('[data-dh-sentinel="classroom-bottom"]');
    if (typeof IntersectionObserver !== "function") return;
    if (roster) {
      var loaded = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && once("classroom:loaded")) {
            track("classroom_loaded", Object.assign(pageIdentity(), { sourcePlacement: routePath() }));
            loaded.disconnect();
          }
        });
      }, { threshold: 0.25 });
      loaded.observe(roster);
    }
    if (sentinel) {
      var completed = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && once("classroom:completed")) {
            track("classroom_completed", Object.assign(pageIdentity(), { sourcePlacement: routePath() }));
            completed.disconnect();
          }
        });
      }, { threshold: 0 });
      completed.observe(sentinel);
    }
  }

  // ── Spelling families ────────────────────────────────────────────────────
  function initFamilies() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-dh-family]"), function (details) {
      details.addEventListener("toggle", function () {
        var id = details.getAttribute("data-dh-family");
        if (details.open && once("family:" + id)) {
          track("spelling_family_expanded", Object.assign(pageIdentity(), { sourcePlacement: id }));
        }
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-dh-chart]"), function (chart) {
      var id = chart.getAttribute("data-dh-chart");
      function interact() {
        if (once("chart:" + id)) {
          track("spelling_family_chart_interacted", Object.assign(pageIdentity(), { sourcePlacement: id }));
        }
      }
      chart.addEventListener("pointerenter", interact, { once: true });
      chart.addEventListener("focusin", interact, { once: true });
    });
  }

  // ── Click delegation ─────────────────────────────────────────────────────
  // Name links carry data-dh-name (+ data-dh-seats in the classroom). The
  // enclosing data-dh-module decides which specific event fires; a name link
  // outside any module (the hero popularity champions) is not an ownership
  // event and falls through to the generic rule: hub anchors carrying
  // data-dh-target-id fire decade_hub_internal_click.
  function initClicks() {
    document.addEventListener("click", function (event) {
      var link = event.target && event.target.closest ? event.target.closest("a") : null;
      if (!link) return;

      var nameEl = link.hasAttribute("data-dh-name") ? link : null;
      if (nameEl) {
        var name = (nameEl.getAttribute("data-dh-name") || "").toLowerCase();
        if (!name) return;
        var module = nameEl.closest("[data-dh-module]");
        var moduleName = module ? module.getAttribute("data-dh-module") : "";
        var identity = pageIdentity();
        var target = { targetContentId: "name:" + name, targetContentType: "name-page" };
        if (moduleName === "classroom") {
          track("classroom_name_clicked", Object.assign(identity, target));
          var seats = parseInt(nameEl.getAttribute("data-dh-seats") || "1", 10);
          if (seats > 1) {
            track("classroom_duplicate_clicked", Object.assign(identity, target));
          }
          return;
        }
        if (moduleName === "spelling") {
          track("spelling_variant_clicked", Object.assign(identity, target));
          return;
        }
        if (moduleName) {
          track("ownership_name_clicked", Object.assign(identity, target));
          return;
        }
        // No enclosing data-dh-module (hero champions): fall through to the
        // data-dh-target-id internal-click delegation below.
      }

      var methodEl = link.hasAttribute("data-dh-methodology") ? link : null;
      if (methodEl) {
        var kind = methodEl.getAttribute("data-dh-methodology");
        track(kind === "spelling" ? "spelling_methodology_clicked" : "ownership_methodology_clicked",
          Object.assign(pageIdentity(), { sourcePlacement: kind }));
        return;
      }

      if (link.hasAttribute("data-dh-target-id")) {
        track("decade_hub_internal_click", Object.assign(pageIdentity(), {
          targetContentId: link.getAttribute("data-dh-target-id"),
          targetContentType: link.getAttribute("data-dh-target-type") || undefined,
          sourcePlacement: routePath(),
        }));
      }
    });
  }

  ready(function () {
    initView();
    initTabs();
    initSorting();
    initShare();
    initScrollDepth();
    initEngagedTime();
    initClassroom();
    initFamilies();
    initClicks();
  });
})();
