/* Interactive "character select" roster for the post "Press Start to Name".
 * Self-initializing: renders the video-game-name roster into #nv-pressstart.
 * Data + render + styles live here (external script) so the blog pipeline's
 * request-time linkify can't corrupt them. No external dependencies. */
(function () {
  "use strict";
  var MOUNT = "nv-pressstart";

  // [name, sex, franchise-key, game, year, bearers, tier]
  var NAMES = [
    ["Zelda","F","zelda","Breath of the Wild",2017,16734,"rehab"],
    ["Raiden","M","mk","Mortal Kombat / Metal Gear",1995,12681,"rehab"],
    ["Kairi","F","kh","Kingdom Hearts",2002,6256,"rehab"],
    ["Atreus","M","other","God of War",2018,3534,"coinage"],
    ["Yuna","F","ff","Final Fantasy X",2001,3063,"rehab"],
    ["Link","M","zelda","The Legend of Zelda",2017,2689,"rehab"],
    ["Mileena","F","mk","Mortal Kombat",1994,2098,"coinage"],
    ["Aeris","F","ff","Final Fantasy VII",1998,1861,"coinage"],
    ["Sora","F","kh","Kingdom Hearts",2002,1799,"rehab"],
    ["Kitana","F","mk","Mortal Kombat",1994,1669,"coinage"],
    ["Ezio","M","ac","Assassin's Creed II",2009,1552,"rehab"],
    ["Tidus","M","ff","Final Fantasy X",2002,926,"coinage"],
    ["Aerith","F","ff","FF VII Remake",2020,781,"coinage"],
    ["Auron","M","ff","Final Fantasy X",2002,697,"coinage"],
    ["Rinoa","F","ff","Final Fantasy VIII",2000,560,"coinage"],
    ["Riku","M","kh","Kingdom Hearts",2002,483,"rehab"],
    ["Ahri","F","lol","League of Legends",2012,482,"coinage"],
    ["Roxas","M","kh","Kingdom Hearts II",2008,372,"coinage"],
    ["Ganon","M","zelda","The Legend of Zelda",1999,271,"coinage"],
    ["Altair","M","ac","Assassin's Creed",2008,245,"coinage"],
    ["Ezreal","M","lol","League of Legends",2010,221,"coinage"],
    ["Namine","F","kh","Kingdom Hearts II",2006,202,"coinage"],
    ["Cortana","F","other","Halo",2008,198,"coinage"],
    ["Kratos","M","other","God of War",2008,191,"coinage"],
    ["Daxter","M","other","Jak and Daxter",2006,153,"coinage"],
    ["Noctis","M","ff","Final Fantasy XV",2017,153,"coinage"],
    ["Geralt","M","other","The Witcher",2018,114,"coinage"],
    ["Tifa","F","ff","Final Fantasy VII",2006,100,"coinage"],
    ["Sephiroth","M","ff","Final Fantasy VII",2004,99,"coinage"],
    ["Samus","F","other","Metroid",2014,57,"coinage"],
    ["Eivor","M","ac","AC Valhalla",2021,56,"coinage"],
    ["Yennefer","F","other","The Witcher (Netflix)",2020,51,"coinage"],
    ["Midna","F","zelda","Twilight Princess",2016,46,"coinage"],
    ["Akali","F","lol","League of Legends",2016,29,"coinage"],
    ["Vaan","M","ff","Final Fantasy XII",2024,13,"coinage"],
    ["Bayek","M","ac","AC Origins",2018,7,"coinage"],
    ["Lumine","F","other","Genshin Impact",2024,5,"coinage"]
  ];
  var IMP = [
    ["Mario","M","Italian classic — peaked 1980",1980,151310],
    ["Sonya","F","Human name — peaked 1967",1967,65772],
    ["Dante","M","Dante's Inferno, not Devil May Cry",1998,51587],
    ["Kassandra","F","Cassandra variant — not AC Odyssey",1993,33512],
    ["Lara","F","Doctor Zhivago — not Tomb Raider",1969,30168],
    ["Mercy","F","Puritan virtue name — not Overwatch",1881,10632],
    ["Zidane","M","Zinedine Zidane, '98 World Cup",1998,700],
    ["Klee","F","Surname; predates Genshin",1998,380],
    ["Jinx","F","Word-name — peaked 1950, not Arcane",1950,204]
  ];
  var FILTERS = [["all","All"],["ff","Final Fantasy"],["kh","Kingdom Hearts"],["zelda","Zelda"],["ac","Assassin's Creed"],["mk","Mortal Kombat"],["lol","League"],["other","Other"]];

  var NEON = "#39d7c6", GREEN = "#7fe08a", AMBER = "#f0b84a", RED = "#e0707a", MUT = "#7b8196", TX = "#e8e6e3", ROSE = "#e08ab0", BLUE = "#6aa6e0", RULE = "rgba(255,255,255,0.09)";
  var MONO = "'Space Mono',ui-monospace,monospace";
  var active = "all", root;

  function injectStyle() {
    if (document.getElementById("nps-style")) return;
    var s = document.createElement("style"); s.id = "nps-style";
    s.textContent =
      "@import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Space+Mono:wght@400;700&display=swap');" +
      "#" + MOUNT + "{background:#080810;border:1px solid " + RULE + ";border-radius:12px;padding:1.1rem;color:" + TX + ";font-family:'Space Grotesk',system-ui,sans-serif;}" +
      ".nps-bar{display:flex;flex-wrap:wrap;gap:.45rem;align-items:center;margin-bottom:.6rem;}" +
      ".nps-chip{font-family:" + MONO + ";font-size:.7rem;padding:.36rem .75rem;border:1px solid " + RULE + ";border-radius:20px;background:transparent;color:" + MUT + ";cursor:pointer;transition:all .14s;}" +
      ".nps-chip:hover{border-color:" + NEON + ";color:" + TX + ";} .nps-chip.on{background:" + NEON + ";border-color:" + NEON + ";color:#06231f;font-weight:700;}" +
      ".nps-legend{display:flex;flex-wrap:wrap;gap:1rem;margin:.2rem 0 1rem;font-family:" + MONO + ";font-size:.64rem;color:" + MUT + ";}" +
      ".nps-legend i{display:inline-flex;align-items:center;gap:.4rem;font-style:normal;} .nps-legend b{width:20px;height:3px;border-radius:2px;display:inline-block;}" +
      ".nps-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:.7rem;}" +
      ".nps-card{position:relative;display:block;background:#11111c;border:1px solid " + RULE + ";border-top-width:3px;border-radius:10px;padding:.85rem .85rem 1rem;cursor:pointer;text-decoration:none;color:" + TX + ";transition:transform .12s,box-shadow .12s,border-color .12s;}" +
      ".nps-card:hover{transform:translateY(-3px);box-shadow:0 10px 26px rgba(0,0,0,.5);}" +
      ".nps-card.coinage{border-top-color:" + GREEN + ";} .nps-card.coinage:hover{border-color:" + GREEN + ";}" +
      ".nps-card.rehab{border-top-color:" + AMBER + ";} .nps-card.rehab:hover{border-color:" + AMBER + ";}" +
      ".nps-card.impostor{border-top-color:" + RED + ";opacity:.62;}" +
      ".nps-nm{font-size:1.35rem;font-weight:700;letter-spacing:-.02em;display:flex;align-items:center;gap:.4rem;}" +
      ".nps-sx{font-size:.8rem;} .nps-sx.f{color:" + ROSE + ";} .nps-sx.m{color:" + BLUE + ";}" +
      ".nps-game{font-family:" + MONO + ";font-size:.67rem;color:" + NEON + ";margin:.35rem 0 .1rem;line-height:1.35;min-height:1.8em;}" +
      ".nps-card.impostor .nps-game{color:" + RED + ";}" +
      ".nps-meta{display:flex;justify-content:space-between;align-items:baseline;margin-top:.5rem;font-family:" + MONO + ";font-size:.65rem;color:" + MUT + ";}" +
      ".nps-n{color:" + TX + ";font-weight:700;font-size:.8rem;}" +
      ".nps-badge{position:absolute;top:.55rem;right:.55rem;font-family:" + MONO + ";font-size:.52rem;letter-spacing:.05em;padding:.1rem .38rem;border-radius:4px;text-transform:uppercase;}" +
      ".nps-card.coinage .nps-badge{background:rgba(127,224,138,.16);color:" + GREEN + ";}" +
      ".nps-card.rehab .nps-badge{background:rgba(240,184,74,.16);color:" + AMBER + ";}" +
      ".nps-card.impostor .nps-badge{background:rgba(224,112,122,.16);color:" + RED + ";}" +
      ".nps-h{font-family:" + MONO + ";font-size:.74rem;letter-spacing:.1em;text-transform:uppercase;color:" + MUT + ";margin:1.8rem 0 .3rem;border-top:1px solid " + RULE + ";padding-top:1.1rem;}" +
      ".nps-reveal{font-family:" + MONO + ";font-size:.72rem;padding:.45rem .9rem;border:1px solid " + RED + ";border-radius:8px;background:transparent;color:" + RED + ";cursor:pointer;margin-top:.6rem;}" +
      ".nps-reveal:hover{background:rgba(224,112,122,.12);}";
    document.head.appendChild(s);
  }

  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function fmt(n) { return n.toLocaleString(); }
  function card(d) {
    var sx = d[1] === "F" ? '<span class="nps-sx f">&#9792;</span>' : '<span class="nps-sx m">&#9794;</span>';
    var badge = d[6] === "coinage" ? "Original" : "Revived";
    return '<a class="nps-card ' + d[6] + '" href="https://nobodynamed.com/name/' + encodeURIComponent(d[0]) + '/" target="_blank" rel="noopener">' +
      '<span class="nps-badge">' + badge + '</span>' +
      '<div class="nps-nm">' + esc(d[0]) + " " + sx + "</div>" +
      '<div class="nps-game">' + esc(d[3]) + "</div>" +
      '<div class="nps-meta"><span>EST. ' + d[4] + '</span><span class="nps-n">' + fmt(d[5]) + "</span></div></a>";
  }
  function impCard(d) {
    return '<a class="nps-card impostor" href="https://nobodynamed.com/name/' + encodeURIComponent(d[0]) + '/" target="_blank" rel="noopener">' +
      '<span class="nps-badge">&#10007; Rejected</span>' +
      '<div class="nps-nm">' + esc(d[0]) + "</div>" +
      '<div class="nps-game">' + esc(d[2]) + "</div>" +
      '<div class="nps-meta"><span>peak ' + d[3] + '</span><span class="nps-n">' + fmt(d[4]) + "</span></div></a>";
  }
  function renderChips() {
    root.querySelector(".nps-bar").innerHTML = FILTERS.map(function (f) {
      var n = f[0] === "all" ? NAMES.length : NAMES.filter(function (d) { return d[2] === f[0]; }).length;
      return '<button class="nps-chip' + (active === f[0] ? " on" : "") + '" data-f="' + f[0] + '">' + f[1] + " (" + n + ")</button>";
    }).join("");
    Array.prototype.forEach.call(root.querySelectorAll(".nps-chip"), function (b) {
      b.onclick = function () { active = b.getAttribute("data-f"); renderChips(); renderGrid(); };
    });
  }
  function renderGrid() {
    var list = NAMES.filter(function (d) { return active === "all" || d[2] === active; }).sort(function (a, b) { return b[5] - a[5]; });
    root.querySelector(".nps-grid").innerHTML = list.map(card).join("");
  }
  function build() {
    root = document.getElementById(MOUNT);
    if (!root) return;
    injectStyle();
    root.innerHTML =
      '<div class="nps-bar"></div>' +
      '<div class="nps-legend"><i><b style="background:' + GREEN + '"></b>Original — coined by the game</i>' +
      '<i><b style="background:' + AMBER + '"></b>Revived — a name a game brought back</i><i>Tap a card &rarr; its dossier</i></div>' +
      '<div class="nps-grid"></div>' +
      '<p class="nps-h">Rejected entries</p>' +
      '<p style="color:' + MUT + ';font-size:.92rem;margin:.2rem 0">Names that look like a gamer’s pick but aren’t — they predate their game or have a bigger non-game source.</p>' +
      '<button class="nps-reveal">&#9654; Reveal 9 false flags</button>' +
      '<div class="nps-grid" id="nps-imp" style="display:none;margin-top:1rem"></div>';
    renderChips(); renderGrid();
    root.querySelector(".nps-reveal").onclick = function () {
      var g = root.querySelector("#nps-imp");
      g.innerHTML = IMP.slice().sort(function (a, b) { return b[4] - a[4]; }).map(impCard).join("");
      g.style.display = "grid"; this.style.display = "none";
    };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build); else build();
})();
