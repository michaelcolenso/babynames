/* Interactive almanac for the post "Debut of the Year".
 * Self-initializing: renders the full Boys/Girls ledger widget into #nv-debut.
 * Data + styling live here (external script) so the blog pipeline's
 * request-time linkify can't corrupt them. No external dependencies. */
(function () {
  "use strict";
  var MOUNT = "nv-debut";

  // [year, name, debut count, note ("" = obscure), kind ("" | "art")]
  var DM = [
[1910,"Halley",12,"Halley's Comet swept past Earth that spring.",""],[1911,"Colie",16,"",""],[1912,"Woodroe",25,"Woodrow Wilson elected president (phonetic spelling).",""],[1913,"Vilas",24,"",""],[1914,"Torao",17,"",""],[1915,"Audra",18,"",""],[1916,"Verdun",14,"The WWI battle, fought that year.",""],[1917,"Delwyn",14,"",""],[1918,"Foch",58,"Marshal Ferdinand Foch, the victorious Allied commander.",""],[1919,"Juaquin",11,"",""],[1920,"Steele",11,"",""],[1921,"Norberto",14,"",""],[1922,"Daren",35,"",""],[1923,"Clinard",9,"",""],[1924,"Melquiades",13,"",""],[1925,"Wayburn",11,"",""],[1926,"Bibb",14,"",""],[1927,"Bidwell",14,"",""],[1928,"Alfread",9,"",""],[1929,"Donnald",8,"",""],[1930,"Shogo",11,"",""],[1931,"Rockne",17,"Knute Rockne, the Notre Dame coach, died in a plane crash that March.",""],[1932,"Alvyn",7,"",""],[1933,"Skippy",10,"The Skippy comic strip and Jackie Cooper film era.",""],[1934,"Franchot",9,"Franchot Tone, the MGM leading man.",""],[1935,"Haile",11,"Haile Selassie, Time's Man of the Year.",""],[1936,"Renny",9,"",""],[1937,"Gaynell",11,"",""],[1938,"Daivd",9,"A misspelling of David, oddly the year's biggest debut.",""],[1939,"Brenda",19,"",""],[1940,"Willkie",13,"Wendell Willkie, that year's Republican nominee.",""],[1941,"Saford",11,"",""],[1942,"Mcarther",23,"Gen. Douglas MacArthur, written by ear.",""],[1943,"Howie",10,"",""],[1944,"Kipp",9,"",""],[1945,"Vickie",10,"",""],[1946,"Sung",8,"",""],[1947,"Eliezer",11,"",""],[1948,"Ridge",11,"",""],[1949,"Ezzard",21,"Ezzard Charles, the new heavyweight champion.",""],[1950,"Broderick",30,"Broderick Crawford won the Best Actor Oscar that spring.",""],[1951,"Cedrick",9,"",""],[1952,"Faron",12,"Faron Young, the breakout country star.",""],[1953,"Caster",21,"",""],[1954,"Durk",17,"",""],[1955,"Anothony",10,"",""],[1956,"Dondi",19,"The Dondi comic strip, then at its height.",""],[1957,"Maverick",33,"The TV western premiered that September (it also gave us Bret).",""],[1958,"Hoby",30,"Hoby Gilman, hero of the western Trackdown.",""],[1959,"Rowdy",22,"Rowdy Yates — Clint Eastwood's role on Rawhide.",""],[1960,"Cully",31,"",""],[1961,"Jefre",21,"",""],[1962,"Thadd",10,"",""],[1963,"Medgar",25,"Medgar Evers, the civil-rights leader assassinated that June.",""],[1964,"Janssen",16,"David Janssen, star of The Fugitive.",""],[1965,"Illya",35,"Illya Kuryakin, the teen-idol spy of The Man from U.N.C.L.E.",""],[1966,"Jarred",17,"",""],[1967,"Clayt",13,"",""],[1968,"Jemal",47,"",""],[1969,"Tige",28,"",""],[1970,"Toriano",62,"Toriano 'Tito' Jackson — Jackson 5 mania.",""],[1971,"Diallo",54,"",""],[1972,"Jabbar",76,"Kareem Abdul-Jabbar.",""],[1973,"Toma",44,"The cop drama Toma, premiered that year.",""],[1974,"Nakia",613,"The ABC series Nakia — the biggest boy debut on record.",""],[1975,"Viet",23,"The fall of Saigon and the first wave of Vietnamese refugees.",""],[1976,"Delvecchio",27,"The detective series Delvecchio.",""],[1977,"Levar",523,"LeVar Burton — the year Roots aired.",""],[1978,"Mychal",59,"",""],[1979,"Jorel",22,"Jor-El, Superman's father, from the 1978 film.",""],[1980,"Tou",33,"",""],[1981,"Taurean",91,"Taurean Blacque of Hill Street Blues.",""],[1982,"Eder",48,"",""],[1983,"Jonerik",20,"",""],[1984,"Eldra",17,"",""],[1985,"Rishawn",25,"",""],[1986,"Cordero",173,"",""],[1987,"Teyon",25,"",""],[1988,"Kadeem",52,"Kadeem Hardison of A Different World.",""],[1989,"Christop",1082,"Not a real name — Christopher truncated to 8 characters, a 1989 data glitch so large it wins the year.","art"],[1990,"Dajour",26,"",""],[1991,"Quayshaun",93,"",""],[1992,"Devanta",41,"",""],[1993,"Deyonta",37,"",""],[1994,"Shyheim",168,"Shyheim, the teenage Wu-Tang-affiliated rapper.",""],[1995,"Alize",30,"",""],[1996,"Quindon",67,"Quindon Tarver, the boy singer from Romeo + Juliet.",""],[1997,"Cross",43,"",""],[1998,"Zyshonne",26,"",""],[1999,"Cauy",32,"",""],[2000,"Rithik",22,"Hrithik Roshan's Bollywood breakout.",""],[2001,"Jahiem",155,"The R&B singer Jaheim.",""],[2002,"Omarian",31,"Omarion of the group B2K.",""],[2003,"Pharrell",67,"Pharrell Williams, everywhere that year.",""],[2004,"Jkwon",100,"J-Kwon, whose 'Tipsy' was inescapable.",""],[2005,"Jayceon",49,"Jayceon Taylor — the rapper The Game.",""],[2006,"Balian",24,"Balian, hero of Kingdom of Heaven.",""],[2007,"Yurem",206,"Yurem, the Mexican child star — a telenovela debut.",""],[2008,"Yosgart",72,"Another telenovela name crossing over.",""],[2009,"Jeremih",88,"The R&B singer Jeremih.",""],[2010,"Vadhir",55,"Vadhir Derbez, the telenovela actor.",""],[2011,"Jionni",63,"Jionni LaValle — Snooki's boyfriend on Jersey Shore.",""],[2012,"Naksh",28,"",""],[2013,"Jaceyon",89,"A respelling riding The Game's Jayceon.",""],[2014,"Llewyn",38,"The Coen Brothers' Inside Llewyn Davis.",""],[2015,"Gotham",48,"The Batman-prequel TV series.",""],[2016,"Yuvin",34,"",""],[2017,"Asahd",59,"Asahd Khaled — DJ Khaled's toddler-turned-brand.",""],[2018,"Jahseh",65,"Jahseh Onfroy — XXXTentacion's real name, the year he died.",""],[2019,"Armias",55,"",""],[2020,"Aarnik",14,"",""],[2021,"Azaire",25,"",""],[2022,"Maziyon",83,"",""],[2023,"Kaiyr",41,"",""],[2024,"Lahiam",154,"",""],[2025,"Akyris",74,"",""]
  ];
  var DF = [
[1930,"Laquita",68,"",""],[1931,"Joanie",12,"",""],[1932,"Carolann",11,"",""],[1933,"Gayleen",23,"",""],[1934,"Carollee",12,"",""],[1935,"Treasure",16,"",""],[1936,"Shelva",89,"",""],[1937,"Deeann",18,"",""],[1938,"Sonjia",19,"",""],[1939,"Thanna",17,"",""],[1940,"Sierra",32,"",""],[1941,"Jerilynn",56,"",""],[1942,"Dwala",15,"",""],[1943,"Sharelle",28,"",""],[1944,"Deatra",29,"",""],[1945,"Sherida",26,"",""],[1946,"Suzzette",17,"",""],[1947,"Rory",41,"",""],[1948,"Vickii",30,"",""],[1949,"Rainelle",46,"",""],[1950,"Monalisa",35,"Nat King Cole's 'Mona Lisa' topped the charts that year.",""],[1951,"Debralee",19,"",""],[1952,"Terria",17,"",""],[1953,"Trenace",32,"",""],[1954,"Corby",39,"",""],[1955,"Shevawn",36,"",""],[1956,"Siobhan",58,"The Irish actress Siobhán McKenna's American moment.",""],[1957,"Tierney",46,"",""],[1958,"Tamre",64,"",""],[1959,"Torey",103,"",""],[1960,"Leshia",76,"",""],[1961,"Lavoris",37,"",""],[1962,"Lafondra",30,"",""],[1963,"Phaedra",70,"The Sophia Loren film Phaedra.",""],[1964,"Djuna",198,"",""],[1965,"Latrenda",90,"",""],[1966,"Indira",43,"Indira Gandhi became India's prime minister that January.",""],[1967,"Cinnamon",41,"Cinnamon Carter, the glamorous agent on Mission: Impossible.",""],[1968,"Laryssa",67,"",""],[1969,"Omayra",42,"",""],[1970,"Shilo",38,"Neil Diamond's 'Shilo.'",""],[1971,"Ayanna",194,"",""],[1972,"Cotina",109,"",""],[1973,"Yajaira",55,"",""],[1974,"Shalawn",70,"",""],[1975,"Azure",121,"",""],[1976,"Tynisa",79,"",""],[1977,"Kizzy",1117,"Kizzy from Roots — the single biggest baby-name debut on record.",""],[1978,"Enjoli",35,"The Enjoli perfume and its '8-hour' TV jingle.",""],[1979,"Chimere",78,"",""],[1980,"Lerin",35,"",""],[1981,"Fallon",232,"Fallon Carrington of Dynasty, which premiered that January.",""],[1982,"Tyechia",71,"",""],[1983,"Mallori",35,"",""],[1984,"Nastassja",40,"The actress Nastassja Kinski.",""],[1985,"Sade",393,"The singer Sade, mid-'Smooth Operator' breakout.",""],[1986,"Myleka",38,"",""],[1987,"Jaleesa",116,"Jaleesa of A Different World.",""],[1988,"Jalesa",77,"A respelling of the same Different World character.",""],[1989,"Alexandr",301,"Not a real name — Alexandra truncated to 8 characters, the same 1989 data glitch.","art"],[1990,"Isamar",447,"The Venezuelan telenovela Isamar.",""],[1991,"Emilce",30,"",""],[1992,"Akeiba",49,"",""],[1993,"Rosangelica",91,"",""],[1994,"Ajee",185,"",""],[1995,"Yamilex",130,"",""],[1996,"Moesha",426,"The sitcom Moesha, starring Brandy.",""],[1997,"Erykah",279,"Erykah Badu's debut year.",""],[1998,"Naidelyn",78,"",""],[1999,"Verania",62,"",""],[2000,"Kelis",108,"The singer Kelis.",""],[2001,"Yaire",184,"",""],[2002,"Kaydence",70,"The Cadence/Kadence spelling wave.",""],[2003,"Trenyce",88,"Trenyce of American Idol season two.",""],[2004,"Eshal",38,"",""],[2005,"Yarisbel",30,"",""],[2006,"Lizania",35,"",""],[2007,"Leilene",81,"",""],[2008,"Aideliz",91,"",""],[2009,"Greidys",187,"",""],[2010,"Tynlee",42,"",""],[2011,"Magaby",50,"",""],[2012,"Kimbella",52,"",""],[2013,"Vanellope",63,"Vanellope von Schweetz of Wreck-It Ralph.",""],[2014,"Dalary",218,"A Latina coinage of the regional-Mexican era.",""],[2015,"Kehlani",50,"The singer Kehlani.",""],[2016,"Rey",63,"Rey, the heroine of Star Wars: The Force Awakens.",""],[2017,"Camreigh",91,"A pure '-eigh' coinage — the spelling frontier.",""],[2018,"Zhavia",307,"Zhavia Ward, breakout of the show The Four.",""],[2019,"Sekani",67,"",""],[2020,"Dalett",96,"",""],[2021,"Namaari",44,"Namaari of Disney's Raya and the Last Dragon.",""],[2022,"Jazaiyah",46,"",""],[2023,"Rumani",89,"",""],[2024,"Yashna",170,"",""],[2025,"Elanith",81,"",""]
  ];

  var AM = "#c9922a", HIT = "#e7c071", ROSE = "#e08ab0", RED = "#e0707a", MUT = "#71768a", TX = "#e8e6e3", RULE = "rgba(255,255,255,0.08)";
  var MONO = "'Space Mono',ui-monospace,monospace";
  var sex = "M", mode = "all", root;

  function injectStyle() {
    if (document.getElementById("nvd-style")) return;
    var s = document.createElement("style"); s.id = "nvd-style";
    s.textContent =
      "#" + MOUNT + "{background:#0c0c14;border:1px solid " + RULE + ";border-radius:12px;padding:1rem 1.1rem 1.3rem;color:" + TX + ";font-family:'Space Grotesk',system-ui,sans-serif;}" +
      ".nvd-bar{position:sticky;top:0;background:#0c0c14;padding:.5rem 0 .7rem;display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;z-index:2;border-bottom:1px solid " + RULE + ";}" +
      ".nvd-seg{display:inline-flex;border:1px solid " + RULE + ";border-radius:20px;overflow:hidden;}" +
      ".nvd-seg button,.nvd-chip{font-family:" + MONO + ";font-size:.7rem;padding:.34rem .85rem;background:transparent;color:" + MUT + ";border:none;cursor:pointer;}" +
      ".nvd-chip{border:1px solid " + RULE + ";border-radius:20px;}" +
      ".nvd-seg button.on{background:" + HIT + ";color:#241a06;font-weight:700;}" +
      ".nvd-seg.f button.on{background:" + ROSE + ";color:#2a0c1c;}" +
      ".nvd-chip.on{background:" + HIT + ";border-color:" + HIT + ";color:#241a06;font-weight:700;}" +
      ".nvd-cn{font-family:" + MONO + ";font-size:.66rem;color:" + MUT + ";margin-left:auto;}" +
      ".nvd-dec{display:flex;flex-wrap:wrap;gap:.35rem;margin:.6rem 0 .2rem;}" +
      ".nvd-dec a{font-family:" + MONO + ";font-size:.62rem;color:" + MUT + ";border:1px solid " + RULE + ";border-radius:6px;padding:.15rem .45rem;text-decoration:none;}" +
      ".nvd-dec a:hover{color:" + TX + ";border-color:" + HIT + ";}" +
      ".nvd-row{display:grid;grid-template-columns:48px 1fr;gap:.9rem;padding:.5rem 0;border-bottom:1px solid " + RULE + ";align-items:baseline;}" +
      ".nvd-row.dim{opacity:.4;} .nvd-row.hit{background:linear-gradient(90deg,rgba(201,146,42,.06),transparent);}" +
      "#" + MOUNT + ".fmode .nvd-row.hit{background:linear-gradient(90deg,rgba(224,138,176,.07),transparent);}" +
      ".nvd-yr{font-family:" + MONO + ";font-size:.76rem;color:" + MUT + ";padding-top:.3rem;}" +
      ".nvd-row.hit .nvd-yr{color:" + HIT + ";} #" + MOUNT + ".fmode .nvd-row.hit .nvd-yr{color:" + ROSE + ";}" +
      ".nvd-nm{display:flex;flex-wrap:wrap;align-items:baseline;gap:.5rem;}" +
      ".nvd-nm a{font-weight:700;letter-spacing:-.02em;line-height:1.05;color:" + TX + ";text-decoration:none;}" +
      ".nvd-row.hit .nvd-nm a{color:" + HIT + ";} #" + MOUNT + ".fmode .nvd-row.hit .nvd-nm a{color:" + ROSE + ";}" +
      ".nvd-row.art .nvd-nm a{color:" + RED + ";} .nvd-row.art .nvd-note{color:" + RED + ";}" +
      ".nvd-ct{font-family:" + MONO + ";font-size:.7rem;color:" + MUT + ";}" +
      ".nvd-note{display:block;font-size:.95rem;color:#cfccc6;margin-top:.1rem;}";
    document.head.appendChild(s);
  }

  function data() { return sex === "M" ? DM : DF; }
  function fsize(c) { var mx = Math.max.apply(null, data().map(function (d) { return d[2]; })); return (1.0 + 1.3 * (Math.sqrt(c) / Math.sqrt(mx))).toFixed(2) + "rem"; }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  function renderRows() {
    root.classList.toggle("fmode", sex === "F");
    var D = data();
    var list = mode === "hits" ? D.filter(function (d) { return d[3] || d[4] === "art"; }) : D;
    var html = list.map(function (d) {
      var hit = d[3] !== "", art = d[4] === "art";
      var cls = "nvd-row " + (art ? "art" : (hit ? "hit" : "dim"));
      var anchor = (d[0] % 10 === 0) ? (' id="nvd-y' + (Math.floor(d[0] / 10) * 10) + '"') : "";
      var note = d[3] ? '<span class="nvd-note">' + esc(d[3]) + "</span>" : "";
      return '<div class="' + cls + '"' + anchor + '><div class="nvd-yr">' + d[0] + "</div>" +
        '<div class="nvd-nm"><a href="https://nobodynamed.com/name/' + encodeURIComponent(d[1]) + '/" target="_blank" rel="noopener" style="font-size:' + fsize(d[2]) + '">' + esc(d[1]) + "</a>" +
        '<span class="nvd-ct">&times;' + d[2].toLocaleString() + "</span>" + note + "</div></div>";
    }).join("");
    root.querySelector(".nvd-ledger").innerHTML = html;
    root.querySelector(".nvd-cn").textContent = list.length + " of " + D.length + " years";
  }

  function build() {
    root = document.getElementById(MOUNT);
    if (!root) return;
    injectStyle();
    var decs = [1910, 1920, 1930, 1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];
    root.innerHTML =
      '<div class="nvd-bar">' +
      '<span class="nvd-seg" id="nvd-sex"><button data-s="M" class="on">Boys</button><button data-s="F">Girls</button></span>' +
      '<button class="nvd-chip on" data-f="all">Every year</button>' +
      '<button class="nvd-chip" data-f="hits">Cultural hits only</button>' +
      '<span class="nvd-cn"></span></div>' +
      '<div class="nvd-dec">' + decs.map(function (x) { return '<a href="#nvd-y' + x + '">' + x + "s</a>"; }).join("") + "</div>" +
      '<div class="nvd-ledger"></div>';

    var seg = root.querySelector("#nvd-sex");
    Array.prototype.forEach.call(seg.querySelectorAll("button"), function (b) {
      b.onclick = function () { sex = b.getAttribute("data-s"); Array.prototype.forEach.call(seg.querySelectorAll("button"), function (x) { x.classList.remove("on"); }); b.classList.add("on"); seg.classList.toggle("f", sex === "F"); renderRows(); };
    });
    Array.prototype.forEach.call(root.querySelectorAll(".nvd-chip"), function (b) {
      b.onclick = function () { mode = b.getAttribute("data-f"); Array.prototype.forEach.call(root.querySelectorAll(".nvd-chip"), function (x) { x.classList.remove("on"); }); b.classList.add("on"); renderRows(); };
    });
    renderRows();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build); else build();
})();
