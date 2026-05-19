-- Insert "The Kehlani Effect" blog post with embedded visualizations
-- Run via: wrangler d1 migrations apply nobodynamed --remote --config apps/web/wrangler.toml

INSERT INTO blog_posts (slug, title, description, body_html, status, author, published_at, updated_at)
VALUES (
  'the-kehlani-effect',
  'The Kehlani Effect',
  'How a singer''s name became a permanent part of American naming culture — and what the 2025 SSA data reveals about celebrity names that stick.',
  '<h2>Kehlani: It''s Happening Right Now</h2>

<p>In 2015, the Oakland R&amp;B artist Kehlani released her breakthrough mixtape <em>You Should Be Here</em>. That year, 50 babies were named Kehlani — the name''s first appearance in 145 years of national records.</p>

<p>The following year, 325. Then 598. Then 914. By 2019 it crossed a thousand. And in 2025, the number the Social Security Administration just published: <em>1,981 babies were named Kehlani</em>. Her all-time record. The name is still climbing.</p>

<style>
.nn-chart { margin: 2.5rem 0; font-family: var(--sans); }
.nn-chart svg { width: 100%; height: auto; display: block; }
.nn-chart .axis text { fill: var(--muted); font-family: var(--mono); font-size: 11px; }
.nn-chart .axis path, .nn-chart .axis line { stroke: var(--rule); }
.nn-chart .grid line { stroke: var(--rule); stroke-dasharray: 2,4; stroke-opacity: 0.5; }
.nn-chart .pt { cursor: pointer; }
.nn-chart .pt:hover { r: 6; }
.nn-chart .line { fill: none; stroke-width: 2.5; stroke-linecap: round; }
.nn-chart .area { stroke: none; }
.nn-chart .lbl { font-family: var(--sans); font-size: 11px; font-weight: 600; }
.nn-chart .anno { font-family: var(--sans); font-size: 10px; fill: var(--muted); }
.nn-chart .bar { rx: 3; }
#nn-tip {
  position: absolute; background: var(--ink); color: var(--paper); border-radius: var(--radius);
  padding: 0.4rem 0.7rem; font-family: var(--mono); font-size: 0.75rem;
  pointer-events: none; opacity: 0; transition: opacity 0.12s; box-shadow: var(--shadow); z-index: 10;
}
</style>

<div id="nn-tip"></div>

<div class="nn-chart">
  <p style="font-family:var(--sans);font-size:0.85rem;color:var(--muted);margin:0 0 0.5rem;">Kehlani — girls named per year · 2025 is the peak so far</p>
  <svg viewBox="0 0 720 300" preserveAspectRatio="xMidYMid meet">
    <defs><linearGradient id="gK" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#a6382a" stop-opacity="0.18"/><stop offset="100%" stop-color="#a6382a" stop-opacity="0.02"/></linearGradient></defs>
    <g transform="translate(55,12)">
      <g class="grid">
        <line x1="0" y1="48" x2="620" y2="48"/><line x1="0" y1="96" x2="620" y2="96"/><line x1="0" y1="144" x2="620" y2="144"/><line x1="0" y1="192" x2="620" y2="192"/><line x1="0" y1="240" x2="620" y2="240"/>
      </g>
      <g class="axis">
        <line x1="0" y1="0" x2="0" y2="264"/><line x1="0" y1="264" x2="620" y2="264"/>
        <text x="0" y="280" text-anchor="middle">2015</text><text x="62" y="280" text-anchor="middle">2016</text><text x="124" y="280" text-anchor="middle">2017</text>
        <text x="186" y="280" text-anchor="middle">2018</text><text x="248" y="280" text-anchor="middle">2019</text><text x="310" y="280" text-anchor="middle">2020</text>
        <text x="372" y="280" text-anchor="middle">2021</text><text x="434" y="280" text-anchor="middle">2022</text><text x="496" y="280" text-anchor="middle">2023</text>
        <text x="558" y="280" text-anchor="middle">2024</text><text x="620" y="280" text-anchor="middle">2025</text>
        <text x="-8" y="252" text-anchor="end">500</text><text x="-8" y="204" text-anchor="end">1000</text>
        <text x="-8" y="156" text-anchor="end">1500</text><text x="-8" y="108" text-anchor="end">2000</text><text x="-8" y="60" text-anchor="end">2500</text>
      </g>
      <polygon class="area" fill="url(#gK)" points="0,262.8 62,224.4 124,191.76 186,155.52 248,106.56 310,62.64 372,45.96 434,46.2 496,47.28 558,36.36 620,35.64 620,264 0,264"/>
      <polyline class="line" stroke="#a6382a" points="0,262.8 62,224.4 124,191.76 186,155.52 248,106.56 310,62.64 372,45.96 434,46.2 496,47.28 558,36.36 620,35.64"/>
      <circle cx="0" cy="262.8" r="4.5" fill="var(--surface)" stroke="#a6382a" stroke-width="2" class="pt" data-y="2015" data-c="50" data-n="Kehlani"/><circle cx="62" cy="224.4" r="4.5" fill="var(--surface)" stroke="#a6382a" stroke-width="2" class="pt" data-y="2016" data-c="325" data-n="Kehlani"/><circle cx="124" cy="191.76" r="4.5" fill="var(--surface)" stroke="#a6382a" stroke-width="2" class="pt" data-y="2017" data-c="598" data-n="Kehlani"/><circle cx="186" cy="155.52" r="4.5" fill="var(--surface)" stroke="#a6382a" stroke-width="2" class="pt" data-y="2018" data-c="914" data-n="Kehlani"/><circle cx="248" cy="106.56" r="4.5" fill="var(--surface)" stroke="#a6382a" stroke-width="2" class="pt" data-y="2019" data-c="1,311" data-n="Kehlani"/><circle cx="310" cy="62.64" r="4.5" fill="var(--surface)" stroke="#a6382a" stroke-width="2" class="pt" data-y="2020" data-c="1,713" data-n="Kehlani"/><circle cx="372" cy="45.96" r="4.5" fill="var(--surface)" stroke="#a6382a" stroke-width="2" class="pt" data-y="2021" data-c="1,877" data-n="Kehlani"/><circle cx="434" cy="46.2" r="4.5" fill="var(--surface)" stroke="#a6382a" stroke-width="2" class="pt" data-y="2022" data-c="1,875" data-n="Kehlani"/><circle cx="496" cy="47.28" r="4.5" fill="var(--surface)" stroke="#a6382a" stroke-width="2" class="pt" data-y="2023" data-c="1,864" data-n="Kehlani"/><circle cx="558" cy="36.36" r="4.5" fill="var(--surface)" stroke="#a6382a" stroke-width="2" class="pt" data-y="2024" data-c="1,973" data-n="Kehlani"/><circle cx="620" cy="35.64" r="4.5" fill="var(--surface)" stroke="#a6382a" stroke-width="2" class="pt" data-y="2025" data-c="1,981" data-n="Kehlani"/>
      <text x="630" y="35.64" dy="0.35em" class="lbl" fill="#a6382a">1,981 in 2025</text>
    </g>
  </svg>
</div>

<p>We are watching the Kehlani Effect happen in real time. Whatever she does next will show up in the 2026 data. The name hasn''t peaked yet.</p>

<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1.5rem;margin:2rem 0;text-align:center;">
  <div><div style="font-family:var(--serif);font-size:2rem;font-weight:600;color:var(--ink);">1,981</div><div style="font-family:var(--sans);font-size:0.85rem;color:var(--muted);">babies named Kehlani in 2025</div></div>
  <div><div style="font-family:var(--serif);font-size:2rem;font-weight:600;color:var(--ink);">14,481</div><div style="font-family:var(--sans);font-size:0.85rem;color:var(--muted);">total since debut in 2015</div></div>
  <div><div style="font-family:var(--serif);font-size:2rem;font-weight:600;color:var(--ink);">2025</div><div style="font-family:var(--sans);font-size:0.85rem;color:var(--muted);">her peak year — so far</div></div>
</div>

<blockquote style="margin:2rem 0;padding:1rem 1.5rem;border-left:3px solid var(--rule);color:var(--muted);font-style:italic;font-family:var(--serif);">Whatever she does next will show up in the 2026 data.</blockquote>

<p>Every year, the Social Security Administration quietly publishes one of the most fascinating datasets in existence: the names of every baby born in America. Not just a list — a full time series, year by year, going back to 1880.</p>

<p>When you plot that data, something extraordinary emerges. Buried inside 145 years of naming trends is a complete record of American pop culture. Not what people said they loved — what they loved enough to make permanent.</p>

<p>The 2025 data just dropped. Kehlani leads it. Here''s what else it found.</p>

<h2>The Pattern</h2>

<p>Celebrity names follow a predictable arc. A star breaks through. Parents take notice. Within one to three years, the name appears in the data — first dozens, then hundreds of babies. It peaks somewhere between two and seven years after the cultural moment. Then it fades, roughly in proportion to how the star themselves fades.</p>

<p>The shape is almost always the same: slow climb, sharp spike, long tail.</p>

<p>But the details are where it gets interesting.</p>

<h2>Rihanna: The Textbook Case</h2>

<p>Rihanna barely registered as a baby name before 2005. Then <em>Pon de Replay</em>, then <em>Umbrella</em>, then the most-played song of the year in 2008 — and that year, 1,075 baby girls were named Rihanna.</p>

<p>That''s the spike. But look at what comes after. Each year, a few hundred fewer. The music kept coming, but the naming moment had passed. By 2025, only 87 babies were named Rihanna. The SSA classifies her as endangered.</p>

<div class="nn-chart">
  <p style="font-family:var(--sans);font-size:0.85rem;color:var(--muted);margin:0 0 0.5rem;">Rihanna — girls named per year</p>
  <svg viewBox="0 0 720 260" preserveAspectRatio="xMidYMid meet">
    <g transform="translate(55,12)">
      <g class="grid"><line x1="0" y1="52" x2="620" y2="52"/><line x1="0" y1="104" x2="620" y2="104"/><line x1="0" y1="156" x2="620" y2="156"/><line x1="0" y1="208" x2="620" y2="208"/></g>
      <g class="axis">
        <line x1="0" y1="0" x2="0" y2="234"/><line x1="0" y1="234" x2="620" y2="234"/>
        <text x="0" y="250" text-anchor="middle">2005</text><text x="124" y="250" text-anchor="middle">2008</text><text x="248" y="250" text-anchor="middle">2012</text><text x="372" y="250" text-anchor="middle">2016</text><text x="496" y="250" text-anchor="middle">2020</text><text x="620" y="250" text-anchor="middle">2025</text>
        <text x="-8" y="234" text-anchor="end">0</text><text x="-8" y="182" text-anchor="end">250</text><text x="-8" y="130" text-anchor="end">500</text><text x="-8" y="78" text-anchor="end">750</text><text x="-8" y="26" text-anchor="end">1k</text>
      </g>
      <polyline class="line" stroke="#465d75" points="0,222.3 62,12 124,99 186,124.8 248,139.2 310,139.2 372,145.8 434,138.6 496,148.5 558,151.2 620,211.65"/>
      <text x="630" y="211.65" dy="0.35em" class="lbl" fill="#465d75">Rihanna</text>
      <circle cx="62" cy="12" r="4" fill="var(--surface)" stroke="#465d75" stroke-width="1.5"/>
      <text x="62" y="-4" text-anchor="middle" class="anno">Pon de Replay</text>
    </g>
  </svg>
</div>

<p>The Rihanna curve is almost too clean. The 2023 Super Bowl halftime show — her first major performance in years — produced a small but visible uptick in 2023–24. Parents noticed. Then 2025 dropped back to 87.</p>

<h2>Khloe: The Kardashian Spike</h2>

<p>If Rihanna is the textbook case, Khloe is the case study in what happens when a reality TV show becomes a cultural institution overnight.</p>

<p>In 2007 — the year before <em>Keeping Up with the Kardashians</em> premiered — 447 babies were named Khloe. By 2008, that number had nearly quadrupled to 1,715. By 2010, it peaked at 5,412 — a name that had never broken 300 in its entire history suddenly became one of the most common girls'' names in America.</p>

<div class="nn-chart">
  <p style="font-family:var(--sans);font-size:0.85rem;color:var(--muted);margin:0 0 0.5rem;">Khloe — girls named per year · KUWTK premiered Nov 2007</p>
  <svg viewBox="0 0 720 280" preserveAspectRatio="xMidYMid meet">
    <g transform="translate(55,12)">
      <g class="grid"><line x1="0" y1="48" x2="620" y2="48"/><line x1="0" y1="96" x2="620" y2="96"/><line x1="0" y1="144" x2="620" y2="144"/><line x1="0" y1="192" x2="620" y2="192"/></g>
      <g class="axis">
        <line x1="0" y1="0" x2="0" y2="240"/><line x1="0" y1="240" x2="620" y2="240"/>
        <text x="0" y="256" text-anchor="middle">2005</text><text x="124" y="256" text-anchor="middle">2008</text><text x="248" y="256" text-anchor="middle">2012</text><text x="372" y="256" text-anchor="middle">2016</text><text x="496" y="256" text-anchor="middle">2020</text><text x="620" y="256" text-anchor="middle">2025</text>
        <text x="-8" y="240" text-anchor="end">0</text><text x="-8" y="192" text-anchor="end">1k</text><text x="-8" y="144" text-anchor="end">2k</text><text x="-8" y="96" text-anchor="end">3k</text><text x="-8" y="48" text-anchor="end">4k</text><text x="-8" y="6" text-anchor="end">5k</text>
      </g>
      <polyline class="line" stroke="#a96720" points="0,237.6 62,192 124,12 248,105.6 372,163.2 496,187.2 620,218.4"/>
      <text x="630" y="218.4" dy="0.35em" class="lbl" fill="#a96720">Khloe</text>
      <circle cx="62" cy="192" r="4" fill="var(--surface)" stroke="#a96720" stroke-width="1.5"/>
      <text x="62" y="184" text-anchor="middle" class="anno">KUWTK</text>
    </g>
  </svg>
</div>

<p>The spike is vertical. There''s almost nothing like it in the dataset — a single television event creating a near-instant naming trend at scale. Khloe is still common today (1,149 in 2025), but the Kardashian effect has been slowly draining out of it for fifteen years.</p>

<h2>The Frozen Timestamp</h2>

<p>Elsa is 140 years old as a baby name. It has never been especially popular — a few hundred girls a year, consistently, from the 1880s through 2013.</p>

<p>Then <em>Frozen</em> came out in November 2013. And in 2014, 1,140 girls were named Elsa.</p>

<div class="nn-chart">
  <p style="font-family:var(--sans);font-size:0.85rem;color:var(--muted);margin:0 0 0.5rem;">Elsa — 1990–2025 · Frozen released Nov 2013</p>
  <svg viewBox="0 0 720 260" preserveAspectRatio="xMidYMid meet">
    <g transform="translate(55,12)">
      <g class="grid"><line x1="0" y1="52" x2="620" y2="52"/><line x1="0" y1="104" x2="620" y2="104"/><line x1="0" y1="156" x2="620" y2="156"/><line x1="0" y1="208" x2="620" y2="208"/></g>
      <g class="axis">
        <line x1="0" y1="0" x2="0" y2="234"/><line x1="0" y1="234" x2="620" y2="234"/>
        <text x="0" y="250" text-anchor="middle">1995</text><text x="155" y="250" text-anchor="middle">2005</text><text x="310" y="250" text-anchor="middle">2013</text><text x="465" y="250" text-anchor="middle">2019</text><text x="620" y="250" text-anchor="middle">2025</text>
        <text x="-8" y="234" text-anchor="end">0</text><text x="-8" y="182" text-anchor="end">300</text><text x="-8" y="130" text-anchor="end">600</text><text x="-8" y="78" text-anchor="end">900</text><text x="-8" y="26" text-anchor="end">1.2k</text>
      </g>
      <polyline class="line" stroke="#22745d" points="0,210.6 31,208.8 62,205.2 93,198 124,195.6 155,184.8 186,181.8 217,179.4 248,174.6 279,173.4 310,12 341,109.2 372,138.6 403,157.8 434,154.8 465,166.2 496,169.2 527,170.4 558,163.2 589,156 620,168"/>
      <text x="630" y="168" dy="0.35em" class="lbl" fill="#22745d">Elsa</text>
      <circle cx="310" cy="12" r="4" fill="var(--surface)" stroke="#22745d" stroke-width="1.5"/>
      <text x="310" y="-4" text-anchor="middle" class="anno">Frozen</text>
    </g>
  </svg>
</div>

<p>The spike is a perfect timestamp. You could date the release of a Disney film from this data alone without knowing anything else about it. The name has since settled back to its pre-Frozen baseline — but that one-year spike is now permanently recorded in the national record.</p>

<h2>Game of Thrones: Death Didn''t Stop Them</h2>

<p>In 2011, HBO premiered <em>Game of Thrones</em>. That same year, 28 babies were named Khaleesi. By 2018 — the final (and divisive) season — that number had reached 565.</p>

<p>Here''s the thing: the show had a famously terrible ending. Daenerys — the character Khaleesi refers to — burned an entire city of civilians and was killed by her own lover. Conventional wisdom said the names would collapse after 2019.</p>

<p>They didn''t.</p>

<div class="nn-chart">
  <p style="font-family:var(--sans);font-size:0.85rem;color:var(--muted);margin:0 0 0.5rem;">Arya · Khaleesi · Daenerys — girls named per year</p>
  <svg viewBox="0 0 720 300" preserveAspectRatio="xMidYMid meet">
    <g transform="translate(55,12)">
      <g class="grid"><line x1="0" y1="52.8" x2="620" y2="52.8"/><line x1="0" y1="105.6" x2="620" y2="105.6"/><line x1="0" y1="158.4" x2="620" y2="158.4"/><line x1="0" y1="211.2" x2="620" y2="211.2"/></g>
      <g class="axis">
        <line x1="0" y1="0" x2="0" y2="264"/><line x1="0" y1="264" x2="620" y2="264"/>
        <text x="0" y="280" text-anchor="middle">2011</text><text x="124" y="280" text-anchor="middle">2014</text><text x="248" y="280" text-anchor="middle">2017</text><text x="372" y="280" text-anchor="middle">2020</text><text x="496" y="280" text-anchor="middle">2023</text><text x="620" y="280" text-anchor="middle">2025</text>
        <text x="-8" y="264" text-anchor="end">0</text><text x="-8" y="211.2" text-anchor="end">1k</text><text x="-8" y="158.4" text-anchor="end">2k</text><text x="-8" y="105.6" text-anchor="end">3k</text>
      </g>
      <polyline class="line" stroke="#a6382a" points="0,261.6 62,221.76 124,171.36 186,126.72 248,90.48 310,62.64 372,79.2 434,81.84 496,118.56 558,135.84 620,136.56"/>
      <text x="630" y="136.56" dy="0.35em" class="lbl" fill="#a6382a">Arya</text>
      <polyline class="line" stroke="#465d75" points="0,262.32 62,231.48 124,223.56 186,213.72 248,203.16 310,209.04 372,228.36 434,222.12 496,224.28 558,219.24 620,223.56"/>
      <text x="630" y="223.56" dy="0.35em" class="lbl" fill="#465d75">Khaleesi</text>
      <polyline class="line" stroke="#a96720" points="62,261.84 124,257.04 186,254.88 248,253.92 310,251.28 372,247.68 434,257.04 496,256.56 558,254.88 620,257.04"/>
      <text x="630" y="257.04" dy="0.35em" class="lbl" fill="#a96720">Daenerys</text>
    </g>
  </svg>
</div>

<p>Arya peaked at 3,051 in 2019 and still had 1,858 in 2025. Khaleesi is holding steady around 400. Even Daenerys — the villain at the end — had 115 babies in 2025. Name attachment, it turns out, doesn''t follow the plot.</p>

<h2>The Encanto Sweep</h2>

<p>On November 24, 2021, Disney released <em>Encanto</em>. The film featured three prominent female characters: Mirabel, Luisa, and Isabela. Plus one Bruno, who we do not talk about.</p>

<p>Except we clearly did talk about Bruno. The song "We Don''t Talk About Bruno" became the first Disney song to hit #1 on the Billboard Hot 100 since "A Whole New World" in 1993. And in 2022, Bruno, Luisa, and Mirabel all peaked simultaneously.</p>

<div class="nn-chart">
  <p style="font-family:var(--sans);font-size:0.85rem;color:var(--muted);margin:0 0 0.5rem;">Bruno · Luisa · Mirabel — Encanto released Nov 2021</p>
  <svg viewBox="0 0 720 260" preserveAspectRatio="xMidYMid meet">
    <g transform="translate(55,12)">
      <g class="grid"><line x1="0" y1="48" x2="620" y2="48"/><line x1="0" y1="96" x2="620" y2="96"/><line x1="0" y1="144" x2="620" y2="144"/><line x1="0" y1="192" x2="620" y2="192"/></g>
      <g class="axis">
        <line x1="0" y1="0" x2="0" y2="216"/><line x1="0" y1="216" x2="620" y2="216"/>
        <text x="0" y="232" text-anchor="middle">2015</text><text x="124" y="232" text-anchor="middle">2017</text><text x="248" y="232" text-anchor="middle">2019</text><text x="372" y="232" text-anchor="middle">2021</text><text x="496" y="232" text-anchor="middle">2023</text><text x="620" y="232" text-anchor="middle">2025</text>
        <text x="-8" y="216" text-anchor="end">0</text><text x="-8" y="144" text-anchor="end">150</text><text x="-8" y="72" text-anchor="end">300</text><text x="-8" y="6" text-anchor="end">450</text>
      </g>
      <polyline class="line" stroke="#465d75" points="0,183.6 124,163.2 248,155.04 372,144.48 496,121.44 620,130.32"/>
      <text x="630" y="130.32" dy="0.35em" class="lbl" fill="#465d75">Bruno</text>
      <polyline class="line" stroke="#22745d" points="0,192.24 124,189.36 248,182.16 372,181.44 496,191.52 620,195.12"/>
      <text x="630" y="195.12" dy="0.35em" class="lbl" fill="#22745d">Luisa</text>
      <polyline class="line" stroke="#a6382a" points="0,212.16 124,209.76 248,211.2 372,212.88 496,162.24 620,186.48"/>
      <text x="630" y="186.48" dy="0.35em" class="lbl" fill="#a6382a">Mirabel</text>
    </g>
  </svg>
</div>

<p>The synchronized spike is extraordinary. Three different names, three different characters, all climbing the same hill at the same time because of one movie. Luisa — a name with a long Latin American history in the data — got a second life. Bruno became the rare male Disney character to move the needle on baby names.</p>

<h2>The Dark Side Is Winning</h2>

<p>Anakin first appeared in the baby name data in 1995 — the year after the original Star Wars was rereleased and three years before <em>The Phantom Menace</em>. The villain origin story didn''t slow parents down. It''s been climbing ever since, hitting 541 in 2023 and holding at 427 in 2025.</p>

<p>But the real story is Kylo Ren. The character debuted in <em>The Force Awakens</em> in 2015. By 2016, 238 boys were named Kylo. Unlike most celebrity-adjacent names, it never stopped climbing — 870 in 2024, 797 in 2025, still classified as rising.</p>

<div class="nn-chart">
  <p style="font-family:var(--sans);font-size:0.85rem;color:var(--muted);margin:0 0 0.5rem;">Kylo · Anakin — boys named per year · both rising</p>
  <svg viewBox="0 0 720 280" preserveAspectRatio="xMidYMid meet">
    <g transform="translate(55,12)">
      <g class="grid"><line x1="0" y1="48" x2="620" y2="48"/><line x1="0" y1="96" x2="620" y2="96"/><line x1="0" y1="144" x2="620" y2="144"/><line x1="0" y1="192" x2="620" y2="192"/></g>
      <g class="axis">
        <line x1="0" y1="0" x2="0" y2="240"/><line x1="0" y1="240" x2="620" y2="240"/>
        <text x="0" y="256" text-anchor="middle">2000</text><text x="124" y="256" text-anchor="middle">2005</text><text x="248" y="256" text-anchor="middle">2010</text><text x="372" y="256" text-anchor="middle">2015</text><text x="496" y="256" text-anchor="middle">2020</text><text x="620" y="256" text-anchor="middle">2025</text>
        <text x="-8" y="240" text-anchor="end">0</text><text x="-8" y="192" text-anchor="end">200</text><text x="-8" y="144" text-anchor="end">400</text><text x="-8" y="96" text-anchor="end">600</text><text x="-8" y="48" text-anchor="end">800</text><text x="-8" y="6" text-anchor="end">1k</text>
      </g>
      <polyline class="line" stroke="#465d75" points="0,228.48 62,218.88 124,230.4 186,229.92 248,211.2 310,205.92 372,181.44 434,155.04 496,110.88 558,132.96 620,137.76"/>
      <text x="630" y="137.76" dy="0.35em" class="lbl" fill="#465d75">Anakin</text>
      <polyline class="line" stroke="#a6382a" points="372,252 434,182.88 496,56.64 558,45.6 620,48.72"/>
      <text x="630" y="48.72" dy="0.35em" class="lbl" fill="#a6382a">Kylo</text>
    </g>
  </svg>
</div>

<p>For comparison: Leia peaked in 2023 at 1,424. Luke has been a standard name for 80 years and peaks at ~14,000. The dark side is not winning the numbers game — but it is winning the trend line.</p>

<h2>Hermione''s Second Act</h2>

<p>The first Harry Potter book was published in 1997. By 2002, Hermione appeared in the SSA data. But it never took off — at most 74 babies in any given year through the 2000s and 2010s.</p>

<p>Then something shifted. Starting around 2019, the numbers began climbing quietly. In 2024, Hermione hit a new all-time record of 122. In 2025: 95, still rising by trend.</p>

<div class="nn-chart">
  <p style="font-family:var(--sans);font-size:0.85rem;color:var(--muted);margin:0 0 0.5rem;">Hermione — girls named per year · still rising 20 years later</p>
  <svg viewBox="0 0 720 240" preserveAspectRatio="xMidYMid meet">
    <g transform="translate(55,12)">
      <g class="grid"><line x1="0" y1="48" x2="620" y2="48"/><line x1="0" y1="96" x2="620" y2="96"/><line x1="0" y1="144" x2="620" y2="144"/></g>
      <g class="axis">
        <line x1="0" y1="0" x2="0" y2="180"/><line x1="0" y1="180" x2="620" y2="180"/>
        <text x="0" y="196" text-anchor="middle">2005</text><text x="124" y="196" text-anchor="middle">2010</text><text x="248" y="196" text-anchor="middle">2014</text><text x="372" y="196" text-anchor="middle">2018</text><text x="496" y="196" text-anchor="middle">2022</text><text x="620" y="196" text-anchor="middle">2025</text>
        <text x="-8" y="180" text-anchor="end">0</text><text x="-8" y="132" text-anchor="end">40</text><text x="-8" y="84" text-anchor="end">80</text><text x="-8" y="36" text-anchor="end">120</text>
      </g>
      <polyline class="line" stroke="#a6382a" points="0,109.44 62,152.64 124,152.64 186,139.68 248,115.2 310,110.88 372,89.28 434,72 496,49.68 558,72 620,86.4"/>
      <text x="630" y="86.4" dy="0.35em" class="lbl" fill="#a6382a">Hermione</text>
    </g>
  </svg>
</div>

<p>The explanation: the kids who grew up with Harry Potter are now in their late 20s and early 30s — peak baby-naming years. Hermione isn''t a celebrity effect. It''s a generational inheritance. The books that shaped them are now shaping what they name their children.</p>

<p>This is a different kind of cultural timestamp — not the spike of a hit song, but the slow bloom of a childhood.</p>

<h2>Billie: The Resurrection</h2>

<p>Billie peaked as a girls'' name in 1930 at 3,241. It spent the next 80 years in slow, steady decline — around 100–200 babies per year, occasionally less. By 2010, it was down to 73.</p>

<p>Billie Eilish released "Ocean Eyes" in 2016. She was 14. By 2018, Billie had started climbing again. By 2025: 409 girls — the highest since the 1970s, classified as rising.</p>

<div class="nn-chart">
  <p style="font-family:var(--sans);font-size:0.85rem;color:var(--muted);margin:0 0 0.5rem;">Billie — girls named per year · a 90-year-old name revived</p>
  <svg viewBox="0 0 720 280" preserveAspectRatio="xMidYMid meet">
    <g transform="translate(55,12)">
      <g class="grid"><line x1="0" y1="48" x2="620" y2="48"/><line x1="0" y1="96" x2="620" y2="96"/><line x1="0" y1="144" x2="620" y2="144"/><line x1="0" y1="192" x2="620" y2="192"/></g>
      <g class="axis">
        <line x1="0" y1="0" x2="0" y2="240"/><line x1="0" y1="240" x2="620" y2="240"/>
        <text x="0" y="256" text-anchor="middle">1995</text><text x="124" y="256" text-anchor="middle">2005</text><text x="248" y="256" text-anchor="middle">2010</text><text x="372" y="256" text-anchor="middle">2016</text><text x="496" y="256" text-anchor="middle">2021</text><text x="620" y="256" text-anchor="middle">2025</text>
        <text x="-8" y="240" text-anchor="end">0</text><text x="-8" y="192" text-anchor="end">100</text><text x="-8" y="144" text-anchor="end">200</text><text x="-8" y="96" text-anchor="end">300</text><text x="-8" y="48" text-anchor="end">400</text><text x="-8" y="6" text-anchor="end">500</text>
      </g>
      <polyline class="line" stroke="#a6382a" points="0,126.72 62,180 124,199.2 186,196.8 248,189.6 310,196.8 372,190.56 434,168 496,120 558,87.84 620,86.4"/>
      <text x="630" y="86.4" dy="0.35em" class="lbl" fill="#a6382a">Billie</text>
    </g>
  </svg>
</div>

<p>The reversal is one of the cleanest in modern data. A name declared dead, resurrected by a single artist, now climbing toward levels it hasn''t seen since the New Deal.</p>

<h2>What Debuted in 2025</h2>

<p>Every year, a handful of names appear for the very first time — names that never crossed the SSA''s minimum threshold of 5 births in any previous year. In 2025, 100 such names debuted. They are a portrait of the moment.</p>

<p><strong>Zohran</strong> (30 boys): Zohran Mamdani was elected mayor of New York City in 2025. Parents noticed within the year. This is how fast culture moves now.</p>

<p><strong>Kaizo</strong> (11 boys): Named after the genre of brutally difficult ROM hacks, popularized by streamers. A video game difficulty setting became a baby name.</p>

<p><strong>Jugaad</strong> (12 boys): A Hindi word meaning "improvised hack" or "ingenious workaround." The South Asian tech community uses it constantly. Now it''s a name.</p>

<p>And then there are the <em>-vik</em> names: Rudvik, Ishvik, Shanvik, Sharvik, Yashvik — all debuting simultaneously, all South Indian in origin, all crossing the threshold for the first time. A community large enough to show up in national data, naming their children in their own tradition.</p>

<div class="nn-chart">
  <p style="font-family:var(--sans);font-size:0.85rem;color:var(--muted);margin:0 0 0.5rem;">Names that debuted in 2025 — never appeared before in 145 years of data</p>
  <svg viewBox="0 0 720 360" preserveAspectRatio="xMidYMid meet">
    <g transform="translate(140,12)">
      <g class="axis">
        <line x1="0" y1="0" x2="0" y2="324"/><line x1="0" y1="324" x2="520" y2="324"/>
        <text x="0" y="340" text-anchor="middle">0</text><text x="130" y="340" text-anchor="middle">20</text>
        <text x="260" y="340" text-anchor="middle">40</text><text x="390" y="340" text-anchor="middle">60</text>
        <text x="520" y="340" text-anchor="middle">80</text>
      </g>
      <rect class="bar" x="0" y="4" width="507" height="16" fill="#a6382a" opacity="0.85"/>
      <text x="-8" y="14" text-anchor="end" class="anno">Elanith (F)</text>
      <text x="515" y="14" dy="0.35em" class="anno">81</text>
      <rect class="bar" x="0" y="28" width="463" height="16" fill="#a6382a" opacity="0.85"/>
      <text x="-8" y="38" text-anchor="end" class="anno">Akyris (M)</text>
      <text x="471" y="38" dy="0.35em" class="anno">74</text>
      <rect class="bar" x="0" y="52" width="441" height="16" fill="#a6382a" opacity="0.85"/>
      <text x="-8" y="62" text-anchor="end" class="anno">Simea (F)</text>
      <text x="449" y="62" dy="0.35em" class="anno">71</text>
      <rect class="bar" x="0" y="76" width="312" height="16" fill="#a6382a" opacity="0.7"/>
      <text x="-8" y="86" text-anchor="end" class="anno">Kyomie (F)</text>
      <text x="320" y="86" dy="0.35em" class="anno">50</text>
      <rect class="bar" x="0" y="100" width="280" height="16" fill="#a6382a" opacity="0.7"/>
      <text x="-8" y="110" text-anchor="end" class="anno">Kaelis (F)</text>
      <text x="288" y="110" dy="0.35em" class="anno">45</text>
      <rect class="bar" x="0" y="124" width="280" height="16" fill="#465d75" opacity="0.7"/>
      <text x="-8" y="134" text-anchor="end" class="anno">Kyssac (M)</text>
      <text x="288" y="134" dy="0.35em" class="anno">45</text>
      <rect class="bar" x="0" y="148" width="275" height="16" fill="#a6382a" opacity="0.7"/>
      <text x="-8" y="158" text-anchor="end" class="anno">Naelith (F)</text>
      <text x="283" y="158" dy="0.35em" class="anno">44</text>
      <rect class="bar" x="0" y="172" width="225" height="16" fill="#a6382a" opacity="0.6"/>
      <text x="-8" y="182" text-anchor="end" class="anno">Mirleth (F)</text>
      <text x="233" y="182" dy="0.35em" class="anno">36</text>
      <rect class="bar" x="0" y="196" width="225" height="16" fill="#465d75" opacity="0.6"/>
      <text x="-8" y="206" text-anchor="end" class="anno">Ezaia (M)</text>
      <text x="233" y="206" dy="0.35em" class="anno">36</text>
      <rect class="bar" x="0" y="220" width="207" height="16" fill="#a96720" opacity="0.6"/>
      <text x="-8" y="230" text-anchor="end" class="anno">Rudvik (M)</text>
      <text x="215" y="230" dy="0.35em" class="anno">33</text>
      <rect class="bar" x="0" y="244" width="195" height="16" fill="#a96720" opacity="0.6"/>
      <text x="-8" y="254" text-anchor="end" class="anno">Ishvik (M)</text>
      <text x="203" y="254" dy="0.35em" class="anno">31</text>
      <rect class="bar" x="0" y="268" width="188" height="16" fill="#a96720" opacity="0.6"/>
      <text x="-8" y="278" text-anchor="end" class="anno">Zohran (M)</text>
      <text x="196" y="278" dy="0.35em" class="anno">30</text>
      <rect class="bar" x="0" y="292" width="156" height="16" fill="#22745d" opacity="0.6"/>
      <text x="-8" y="302" text-anchor="end" class="anno">Kaizo (M)</text>
      <text x="164" y="302" dy="0.35em" class="anno">11</text>
    </g>
  </svg>
</div>

<h2>What Went Extinct</h2>

<p>While new names debuted, others crossed into silence. These are names that had count &gt; 0 in 2024 and zero in 2025 — the last generation to carry them.</p>

<p>Jean had 458,350 total bearers over 145 years. It peaked at 12,512 in 1927. In 2024, a handful of parents still chose it. In 2025: none.</p>

<p>Then there are the ones that capture a specific cultural moment — and then nothing:</p>

<table class="table">
<thead><tr><th>Name</th><th>Sex</th><th>Last count (2024)</th></tr></thead>
<tbody>
<tr><td>Jean</td><td>F</td><td>Last recorded</td></tr>
<tr><td>Vicki</td><td>F</td><td>Last recorded</td></tr>
<tr><td>Vickie</td><td>F</td><td>Last recorded</td></tr>
<tr><td>Traci</td><td>F</td><td>Last recorded</td></tr>
<tr><td>Gayle</td><td>F</td><td>Last recorded</td></tr>
<tr><td>Myrna</td><td>F</td><td>Last recorded</td></tr>
<tr><td>Buffy</td><td>F</td><td>Last recorded</td></tr>
<tr><td>Cher</td><td>F</td><td>Last recorded</td></tr>
<tr><td>Coretta</td><td>F</td><td>Last recorded</td></tr>
<tr><td>Norbert</td><td>M</td><td>Last recorded</td></tr>
<tr><td>Infant</td><td>M</td><td>Last recorded</td></tr>
<tr><td>Infant</td><td>F</td><td>Last recorded</td></tr>
</tbody>
</table>

<p>That last one: for at least four decades, some babies in America were officially named Infant — likely clerical accidents where hospitals submitted birth records before parents decided. In 2025, it happened for the last time.</p>

<h2>What This All Means</h2>

<p>The SSA data is often treated as a curiosity — a fun way to see what names are trending. But it''s something more than that. It''s a continuous, unbroken record of what Americans loved enough to make permanent.</p>

<p>Every time a parent named their daughter Rihanna in 2008, they were doing something that would outlast the Billboard chart, the tour, the album cycle. The name would still exist in 2025 on an 18-year-old''s driver''s license, long after the song had faded to nostalgia.</p>

<p>And in 2025, right now, 1,981 babies named Kehlani are out there — in hospitals, in nurseries, in car seats. Whatever Kehlani does next, these kids carry it forward.</p>

<p>Names are the longest-lasting thing we make from the things we love.</p>

<script>
(function(){
  var tt = document.getElementById(''nn-tip'');
  if (!tt) return;
  document.querySelectorAll(''.pt'').forEach(function(pt){
    pt.addEventListener(''mousemove'', function(e){
      tt.innerHTML = ''<strong style="color:#a6382a">'' + (pt.dataset.n || ''Kehlani'') + ''</strong><br>'' + pt.dataset.y + '': '' + pt.dataset.c;
      tt.style.left = (e.pageX + 10) + ''px'';
      tt.style.top = (e.pageY - 10) + ''px'';
      tt.style.opacity = 1;
    });
    pt.addEventListener(''mouseleave'', function(){ tt.style.opacity = 0; });
  });
})();
</script>',
  'published',
  'M. Colenso',
  datetime('now'),
  datetime('now')
)
ON CONFLICT(slug) DO UPDATE SET
  title=excluded.title,
  description=excluded.description,
  body_html=excluded.body_html,
  status=excluded.status,
  author=excluded.author,
  published_at=excluded.published_at,
  updated_at=datetime('now');
