// Compact site-header search. Loaded on every page that uses the shared
// pageShell() (name pages, decade hubs, blog, year pages, editorial hubs) so
// visitors can search a new name without navigating back to "/" first — the
// homepage's search box is otherwise the only place on the site to do this.
// Self-contained: does not depend on app.js/NameVitals, since not every
// pageShell page loads app.js.
(function () {
  function titleCase(s) {
    return s.replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
  }

  function init() {
    const input = document.getElementById("header-q");
    const suggestions = document.getElementById("header-suggestions");
    const submit = document.getElementById("header-go");
    if (!input || !suggestions || !submit) return;

    let current = [];
    let activeIdx = -1;
    let debounceTimer;

    const hide = () => {
      suggestions.classList.add("hidden");
      input.setAttribute("aria-expanded", "false");
      activeIdx = -1;
    };
    const render = () => {
      if (!current.length) { hide(); return; }
      suggestions.classList.remove("hidden");
      input.setAttribute("aria-expanded", "true");
      suggestions.innerHTML = current
        .map((s, i) => `<div role="option" aria-selected="${i === activeIdx}" data-i="${i}" class="${i === activeIdx ? "active" : ""}"><span>${s.name}</span><span class="meta">${s.sex === "M" ? "masculine" : "feminine"}</span></div>`)
        .join("");
      suggestions.querySelectorAll("[role=option]").forEach((el) => {
        el.addEventListener("mousedown", (e) => {
          e.preventDefault();
          pick(current[Number(el.getAttribute("data-i"))]);
        });
      });
    };
    const go = (name) => {
      const n = titleCase((name || input.value).trim());
      if (!n) return;
      location.href = `/name/${encodeURIComponent(n)}/`;
    };
    const pick = (s) => go(s.name);

    input.addEventListener("input", () => {
      const q = input.value.trim();
      if (q.length < 2) { hide(); return; }
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        try {
          const r = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=8`);
          const { results } = r.ok ? await r.json() : { results: [] };
          current = results || [];
          activeIdx = -1;
          render();
        } catch (e) {
          hide();
        }
      }, 180);
    });

    input.addEventListener("keydown", (e) => {
      if (!suggestions.classList.contains("hidden")) {
        if (e.key === "ArrowDown") { activeIdx = Math.min(current.length - 1, activeIdx + 1); render(); e.preventDefault(); }
        else if (e.key === "ArrowUp") { activeIdx = Math.max(0, activeIdx - 1); render(); e.preventDefault(); }
        else if (e.key === "Enter" && activeIdx >= 0) { pick(current[activeIdx]); e.preventDefault(); return; }
        else if (e.key === "Escape") { hide(); }
      }
      if (e.key === "Enter" && activeIdx < 0) go();
    });
    input.addEventListener("blur", () => setTimeout(hide, 120));
    submit.addEventListener("click", () => go());
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
