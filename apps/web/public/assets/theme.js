// Dark-mode toggle. The actual theme switch is CSS-only (data-theme attribute
// read by custom-property overrides in style.css) — this file only persists
// the user's explicit choice and keeps .theme-toggle buttons' a11y state in
// sync. The FOUC-preventing early read of the same storage key lives as an
// inline <script> in <head>, before this file loads — see pageShell() in
// render-shell.ts and the matching snippet in each static HTML page.
(function () {
  var STORAGE_KEY = "nv-theme";

  function getStored() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return null;
    }
  }

  function systemPrefersDark() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function currentEffective() {
    var stored = getStored();
    if (stored === "light" || stored === "dark") return stored;
    return systemPrefersDark() ? "dark" : "light";
  }

  function apply(theme) {
    if (theme === "light" || theme === "dark") {
      document.documentElement.setAttribute("data-theme", theme);
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }

  function updateButtons() {
    var pressed = currentEffective() === "dark";
    var buttons = document.querySelectorAll(".theme-toggle");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute("aria-pressed", String(pressed));
      buttons[i].setAttribute("aria-label", pressed ? "Switch to light theme" : "Switch to dark theme");
    }
  }

  function toggle() {
    var next = currentEffective() === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch (e) {
      // Storage unavailable (private mode, quota) — theme still applies for this page load.
    }
    apply(next);
    updateButtons();
  }

  document.addEventListener("DOMContentLoaded", function () {
    var buttons = document.querySelectorAll(".theme-toggle");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener("click", toggle);
    }
    updateButtons();
  });

  window.NameVitalsTheme = { toggle: toggle, apply: apply, currentEffective: currentEffective };
})();
