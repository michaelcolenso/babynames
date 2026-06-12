/* Interactive charts for the post "How America Stopped Sharing Names".
 * Self-initializing: renders into any of #nv-conformity, #nv-sounds,
 * #nv-spelling, #nv-eighwall that exist on the page. Used by both the
 * production blog post and the standalone preview, so all data + styling
 * lives here (the blog pipeline's linkify would corrupt inline scripts).
 * Requires d3 v7 to be loaded first. */
(function () {
  "use strict";
  if (typeof d3 === "undefined") { console.error("blog-sharing-names: d3 not loaded"); return; }

  // ── Data (SSA national data, 1880–2025; pulled from production D1) ──────────
  var Y0 = 1880, STEP = 5;
  var byStep = function (vals) { return vals.map(function (v, i) { return [Y0 + i * STEP, v]; }); };

  // Act 1 — top-10 names' share of all births (%), conformity
  var CONF = {
    F: byStep([24.6,22.7,20.7,20.3,19.5,19.9,21.1,23.2,23.2,23,22.3,24.7,23.1,23.8,24.1,22.3,17,16,16.3,17.4,17.1,18,16,11.9,10.2,9,8.9,8.4,7.9,7]),
    M: byStep([44.2,40.7,38.4,35.7,34.2,32.1,31.2,30.4,31.6,32.9,33.7,33.3,33.5,34.3,33.8,32.1,29.1,28.4,26.8,25.7,23.6,22.8,19.5,16.1,13.4,10.7,9,8.3,7.9,8])
  };
  // Act 2 — share of births whose name ends in the single most common ending letter (%)
  var SND = {
    F: byStep([36.7,37.3,37.3,35.9,35.7,34.5,33.7,31.3,30.4,29.2,27.1,26.1,29.1,30.6,33.7,34.3,34.2,36.3,35.9,36.9,37.8,36.3,37.9,37.4,37.2,39.5,38.1,37.1,38.2,38]),
    M: byStep([16.7,15.2,14.6,14.3,15.1,15.2,14.8,15.2,15.1,14.9,16.7,17.6,16.9,16,14.7,15.6,16.1,17.1,19.5,23.5,24.4,24.9,25.4,28.5,31.3,34.4,36.2,34.6,31.5,28])
  };
  // Act 3 — distinct spellings (>=25 births/yr) of one sound, by family
  var SPELL = {
    caitlin: { label: "“Caitlin”", col: "#6a8aaa", peak: [1998,17], pts: [[1963,1],[1965,1],[1966,1],[1967,1],[1968,1],[1969,1],[1970,1],[1971,1],[1972,1],[1973,1],[1974,1],[1975,1],[1976,1],[1977,1],[1978,3],[1979,4],[1980,5],[1981,6],[1982,6],[1983,8],[1984,8],[1985,8],[1986,10],[1987,13],[1988,14],[1989,15],[1990,15],[1991,16],[1992,16],[1993,16],[1994,16],[1995,16],[1996,16],[1997,16],[1998,17],[1999,16],[2000,16],[2001,16],[2002,17],[2003,15],[2004,14],[2005,15],[2006,14],[2007,14],[2008,14],[2009,13],[2010,13],[2011,12],[2012,12],[2013,13],[2014,11],[2015,11],[2016,10],[2017,9],[2018,9],[2019,8],[2020,8],[2021,7],[2022,6],[2023,7],[2024,7],[2025,7]] },
    aden: { label: "“-aden”", col: "#c9922a", peak: [2012,81], pts: [[1960,2],[1965,3],[1970,3],[1975,3],[1978,4],[1979,4],[1980,5],[1981,4],[1982,4],[1983,4],[1984,5],[1985,7],[1986,6],[1987,8],[1988,7],[1989,10],[1990,12],[1991,15],[1992,16],[1993,18],[1994,21],[1995,20],[1996,23],[1997,25],[1998,30],[1999,38],[2000,43],[2001,46],[2002,50],[2003,58],[2004,59],[2005,64],[2006,68],[2007,76],[2008,74],[2009,77],[2010,79],[2011,79],[2012,81],[2013,78],[2014,74],[2015,70],[2016,72],[2017,65],[2018,64],[2019,61],[2020,60],[2021,57],[2022,53],[2023,46],[2024,46],[2025,43]] },
    eigh: { label: "“-eigh”", col: "#c4786e", peak: [2017,93], pts: [[1960,2],[1965,2],[1970,2],[1975,3],[1980,3],[1984,3],[1985,6],[1986,10],[1987,9],[1988,10],[1989,12],[1990,10],[1991,13],[1992,18],[1993,18],[1994,21],[1995,24],[1996,23],[1997,25],[1998,26],[1999,27],[2000,30],[2001,32],[2002,37],[2003,43],[2004,41],[2005,43],[2006,50],[2007,55],[2008,60],[2009,67],[2010,70],[2011,79],[2012,81],[2013,82],[2014,89],[2015,86],[2016,87],[2017,93],[2018,86],[2019,88],[2020,81],[2021,83],[2022,82],[2023,74],[2024,73],[2025,71]] }
  };
  var EIGH_ROSTER = [["Everleigh",1858],["Ryleigh",1040],["Oakleigh",471],["Kayleigh",386],["Charleigh",369],["Brynleigh",352],["Wrenleigh",321],["Marleigh",291],["Kyleigh",232],["Hadleigh",214],["Paisleigh",183],["Rayleigh",153],["Harleigh",147],["Kinsleigh",145],["Blakeleigh",131],["Bryleigh",119],["Emberleigh",117],["Novaleigh",113],["Raleigh",167],["Annaleigh",100],["Brynnleigh",91],["Bayleigh",89],["Huntleigh",89],["Raeleigh",82],["Adaleigh",79],["Brayleigh",79],["Presleigh",76],["Carleigh",67],["Caleigh",64],["Kaleigh",62],["Renleigh",62],["Zayleigh",61],["Avaleigh",59],["Kenleigh",58],["Rosaleigh",57],["Adleigh",52],["Karleigh",52],["Baileigh",50],["Kensleigh",50],["Kenzleigh",48],["Maeleigh",48],["Mayleigh",48],["Kinleigh",47],["Kynleigh",47],["Leigh",46],["Myleigh",46],["Analeigh",44],["Hayleigh",43],["Brinleigh",40],["Aubreigh",39],["Rynleigh",38],["Berkleigh",37],["Finleigh",37],["Jayleigh",35],["Brenleigh",34],["Haleigh",34],["Lynleigh",34],["Ansleigh",31],["Bexleigh",31],["Haisleigh",31],["Rileigh",31],["Elleigh",30],["Hazeleigh",30],["Joleigh",30],["Lynnleigh",30],["Cayleigh",29],["Emmaleigh",29],["Ashleigh",28],["Arleigh",27],["Kynsleigh",27],["Tyleigh",27],["Calleigh",25],["Riverleigh",25]];

  var ROSE = "#c4786e", BLUE = "#6a8aaa", AMBER = "#c9922a", MUTED = "#6b7280", TEXT = "#e8e6e3";
  var GRID = "rgba(255,255,255,0.06)", RULE = "rgba(255,255,255,0.14)";
  var MONO = "'Space Mono',ui-monospace,monospace";

  // ── One-time style + tooltip injection (theme-agnostic dark viz cards) ──────
  function ensureChrome() {
    if (!document.getElementById("nv-sn-style")) {
      var st = document.createElement("style");
      st.id = "nv-sn-style";
      st.textContent =
        ".nv-fig{margin:2rem 0;}" +
        ".nv-fig figcaption{font-family:" + MONO + ";font-size:.72rem;letter-spacing:.04em;color:" + MUTED + ";margin:.5rem 2px 0;}" +
        ".nv-card{background:#0d0d13;border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:1rem .75rem .5rem;}" +
        ".nv-card svg{display:block;width:100%;overflow:visible;}" +
        ".nv-legend{display:flex;flex-wrap:wrap;gap:1rem;margin:.6rem 2px 0;align-items:center;}" +
        ".nv-legend i{display:inline-flex;align-items:center;gap:.4rem;font-family:" + MONO + ";font-size:.66rem;color:#cfcdc8;font-style:normal;}" +
        ".nv-legend i b{width:20px;height:3px;border-radius:2px;display:inline-block;}" +
        ".nv-wall{display:flex;flex-wrap:wrap;gap:.3rem .65rem;align-items:baseline;background:#0d0d13;border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:1.1rem;line-height:1.5;}" +
        ".nv-wall span{color:" + ROSE + ";font-weight:600;cursor:default;white-space:nowrap;}" +
        ".nv-wall span:hover{color:#f0d9a0;}" +
        ".nv-tip{position:fixed;pointer-events:none;background:rgba(10,10,15,.97);border:1px solid rgba(201,146,42,.4);border-radius:8px;padding:8px 12px;z-index:9999;opacity:0;transition:opacity .1s;font-family:'Space Grotesk',system-ui,sans-serif;box-shadow:0 8px 40px rgba(0,0,0,.6);}" +
        ".nv-tip .y{font-family:" + MONO + ";font-size:.7rem;color:" + MUTED + ";margin-bottom:4px;}" +
        ".nv-tip .r{font-size:.88rem;line-height:1.5;}";
      document.head.appendChild(st);
    }
    var tip = document.getElementById("nv-sn-tip");
    if (!tip) { tip = document.createElement("div"); tip.id = "nv-sn-tip"; tip.className = "nv-tip"; document.body.appendChild(tip); }
    return tip;
  }

  function axStyle(ax) {
    ax.select(".domain").attr("stroke", RULE);
    ax.selectAll("line").attr("stroke", RULE);
    ax.selectAll("text").attr("fill", MUTED).attr("font-family", MONO).attr("font-size", 10);
  }
  function size(sel) {
    var box = sel.node().getBoundingClientRect();
    return Math.max(300, box.width - 24);
  }

  // ── Generic multi-line chart ────────────────────────────────────────────────
  function lineChart(sel, lines, opts) {
    var tip = ensureChrome();
    var host = d3.select(sel); host.selectAll("*").remove();
    var W = size(host), H = opts.h || 360;
    var m = { top: 22, right: 18, bottom: 38, left: 42 }, iw = W - m.left - m.right, ih = H - m.top - m.bottom;
    var svg = host.append("svg").attr("viewBox", "0 0 " + W + " " + H).attr("height", H);
    var g = svg.append("g").attr("transform", "translate(" + m.left + "," + m.top + ")");
    var x = d3.scaleLinear().domain(opts.xd).range([0, iw]);
    var y = d3.scaleLinear().domain([0, opts.ymax]).range([ih, 0]);
    g.selectAll(".yg").data(y.ticks(opts.yticks || 4)).join("line").attr("x1", 0).attr("x2", iw).attr("y1", function (d) { return y(d); }).attr("y2", function (d) { return y(d); }).attr("stroke", GRID);
    g.append("g").attr("transform", "translate(0," + ih + ")").call(d3.axisBottom(x).tickValues(opts.xticks).tickFormat(d3.format("d")).tickSize(4)).call(axStyle);
    g.append("g").call(d3.axisLeft(y).ticks(opts.yticks || 4).tickFormat(function (d) { return d + (opts.pct ? "%" : ""); }).tickSize(4)).call(axStyle);
    if (opts.ylabel) g.append("text").attr("transform", "rotate(-90)").attr("x", -ih / 2).attr("y", -30).attr("text-anchor", "middle").attr("fill", MUTED).attr("font-family", MONO).attr("font-size", 9.5).attr("letter-spacing", ".08em").text(opts.ylabel);
    var line = d3.line().x(function (d) { return x(d[0]); }).y(function (d) { return y(d[1]); }).curve(d3.curveMonotoneX);
    lines.forEach(function (ln) {
      g.append("path").datum(ln.pts).attr("fill", "none").attr("stroke", ln.col).attr("stroke-width", 2.4).attr("stroke-dasharray", ln.dash || null).attr("d", line);
      if (ln.mark) { var p = ln.mark; g.append("circle").attr("cx", x(p[0])).attr("cy", y(p[1])).attr("r", 3.4).attr("fill", ln.col);
        g.append("text").attr("x", x(p[0])).attr("y", y(p[1]) - 8).attr("text-anchor", "middle").attr("fill", ln.col).attr("font-family", MONO).attr("font-size", 10).attr("font-weight", 700).text(ln.markLabel || ""); }
    });
    var guide = g.append("line").attr("y1", 0).attr("y2", ih).attr("stroke", "rgba(255,255,255,0.22)").attr("opacity", 0);
    svg.append("rect").attr("x", m.left).attr("y", m.top).attr("width", iw).attr("height", ih).attr("fill", "transparent")
      .on("mousemove", function (e) {
        var mx = d3.pointer(e, g.node())[0], yr = Math.round(x.invert(mx) / (opts.snap || 1)) * (opts.snap || 1);
        guide.attr("x1", x(yr)).attr("x2", x(yr)).attr("opacity", 1);
        var rows = lines.map(function (ln) { var p = ln.pts.find(function (q) { return q[0] === yr; }); return p ? '<div class="r" style="color:' + ln.col + '">' + ln.label + ": <b>" + p[1] + (opts.pct ? "%" : "") + "</b></div>" : ""; }).join("");
        if (!rows) { tip.style.opacity = 0; return; }
        tip.innerHTML = '<div class="y">' + yr + "</div>" + rows;
        tip.style.opacity = 1; tip.style.left = Math.min(e.clientX + 15, window.innerWidth - 180) + "px"; tip.style.top = Math.max(e.clientY - 60, 8) + "px";
      })
      .on("mouseleave", function () { guide.attr("opacity", 0); tip.style.opacity = 0; });
  }

  function renderConformity(sel) {
    lineChart(sel, [
      { label: "Boys", col: BLUE, pts: CONF.M }, { label: "Girls", col: ROSE, pts: CONF.F }
    ], { xd: [1880, 2025], xticks: [1880,1920,1960,2000], ymax: 50, yticks: 5, pct: true, snap: 5, ylabel: "TOP-10 SHARE OF BIRTHS" });
  }
  function renderSounds(sel) {
    lineChart(sel, [
      { label: "Boys", col: BLUE, pts: SND.M, mark: [2010, 36.2], markLabel: "36% end in N" }, { label: "Girls", col: ROSE, pts: SND.F }
    ], { xd: [1880, 2025], xticks: [1880,1920,1960,2000], ymax: 45, yticks: 3, pct: true, snap: 5, ylabel: "TOP ENDING-LETTER SHARE" });
  }
  function renderSpelling(sel) {
    var L = Object.keys(SPELL).map(function (k) { var s = SPELL[k]; return { label: s.label, col: s.col, pts: s.pts, mark: s.peak, markLabel: s.label + " · " + s.peak[1] }; });
    lineChart(sel, L, { xd: [1960, 2026], xticks: [1960,1980,2000,2020], ymax: 98, yticks: 4, ylabel: "DISTINCT SPELLINGS / SOUND" });
  }
  function renderEighWall(sel) {
    ensureChrome();
    var host = d3.select(sel); host.selectAll("*").remove();
    host.classed("nv-wall", true);
    var fs = d3.scaleSqrt().domain([25, 1858]).range([12, 40]);
    var op = d3.scaleSqrt().domain([25, 1858]).range([0.5, 1]);
    EIGH_ROSTER.forEach(function (d) {
      host.append("span").text(d[0]).attr("title", d[1].toLocaleString() + " girls, 2024")
        .style("font-size", fs(d[1]).toFixed(1) + "px").style("opacity", op(d[1]).toFixed(2));
    });
  }

  var SPECS = [["#nv-conformity", renderConformity], ["#nv-sounds", renderSounds], ["#nv-spelling", renderSpelling], ["#nv-eighwall", renderEighWall]];
  function boot() {
    ensureChrome();
    SPECS.forEach(function (s) { if (document.querySelector(s[0])) { try { s[1](s[0]); } catch (e) { console.error("nv chart", s[0], e); } } });
  }
  var rt; window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(boot, 160); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
