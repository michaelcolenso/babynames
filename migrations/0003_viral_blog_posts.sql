-- Seed visual, search-indexable editorial posts for the NobodyNamed blog.
-- Body content is intentionally self-contained HTML so Pages Functions can render
-- it from D1 without a build-time content pipeline.

PRAGMA foreign_keys = ON;

INSERT INTO blog_posts(slug, title, description, body_html, status, author, og_image, published_at, updated_at)
VALUES
(
  'the-kehlani-effect',
  'The Kehlani Effect',
  'How one celebrity name became a real American baby-name signal, and why most pop-culture names do not last.',
  '<p>Some pop-culture names arrive like fireworks. They flare, screenshot well, and fade before kindergarten. Kehlani is different. In the local SSA dataset, the name went from barely visible to a top modern culture signal in only a few years.</p>
<div class="blog-visual">
  <h3>Four culture-name patterns, one chart</h3>
  <p>Birth counts in the local SSA dataset through 2017. Kehlani rose late and fast; Khaleesi rose with fandom; Nevaeh had already become a broader naming style; Leilani shows the sound family around it.</p>
  <svg viewBox="0 0 680 360" role="img" aria-label="Line chart comparing Kehlani, Khaleesi, Nevaeh, and Leilani birth counts from 2000 to 2017">
    <line x1="58" y1="284" x2="632" y2="284" stroke="var(--rule)"/>
    <line x1="58" y1="52" x2="58" y2="284" stroke="var(--rule)"/>
    <line x1="58" y1="168" x2="632" y2="168" stroke="var(--rule)" stroke-dasharray="3 5"/>
    <text x="58" y="310" class="axis-label">2000</text><text x="210" y="310" class="axis-label">2005</text><text x="382" y="310" class="axis-label">2010</text><text x="610" y="310" class="axis-label">2017</text>
    <text x="12" y="58" class="axis-label">6.8k</text><text x="18" y="173" class="axis-label">3.4k</text><text x="20" y="288" class="axis-label">0</text>
    <path d="M58 284 L227 284 L396 284 L463 284 L531 284 L564 282 L598 273 L632 264" fill="none" stroke="#a6382a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M58 284 L227 284 L396 284 L463 279 L531 271 L564 272 L598 271 L632 268" fill="none" stroke="#465d75" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M58 281 L227 129 L396 65 L463 100 L531 140 L564 148 L598 155 L632 163" fill="none" stroke="#a96720" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M58 267 L227 251 L396 242 L463 236 L531 232 L564 223 L598 217 L632 207" fill="none" stroke="#22745d" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="632" cy="264" r="4" fill="#a6382a"/><circle cx="632" cy="268" r="4" fill="#465d75"/><circle cx="632" cy="163" r="4" fill="#a96720"/><circle cx="632" cy="207" r="4" fill="#22745d"/>
    <text x="445" y="253" class="chart-label">Kehlani</text><text x="470" y="221" class="chart-label">Leilani</text><text x="330" y="76" class="chart-label">Nevaeh</text><text x="448" y="289" class="chart-label">Khaleesi</text>
  </svg>
</div>
<p>The viral part is easy to see: parents do not just copy a famous person. They copy a sound, a spelling style, and a feeling that already fits the moment. Kehlani worked because it sits near names parents were already willing to use: Leilani, Kailani, Aaliyah, and other vowel-rich names with a soft ending.</p>
<div class="blog-visual">
  <h3>The sound family was already warm</h3>
  <p>Latest recorded girl births for nearby vowel-rich names. Kehlani did not arrive in an empty market; it joined a naming sound parents already recognized.</p>
  <div class="blog-bars">
    <div class="blog-bar-row"><span class="blog-bar-name">Aaliyah</span><span class="blog-bar-track"><span class="blog-bar-fill" style="width:100%; background:#9270a7"></span></span><span class="blog-bar-value">4,160</span></div>
    <div class="blog-bar-row"><span class="blog-bar-name">Leilani</span><span class="blog-bar-track"><span class="blog-bar-fill" style="width:54.4%; background:#22745d"></span></span><span class="blog-bar-value">2,264</span></div>
    <div class="blog-bar-row"><span class="blog-bar-name">Kehlani</span><span class="blog-bar-track"><span class="blog-bar-fill" style="width:14.3%; background:#a6382a"></span></span><span class="blog-bar-value">596</span></div>
    <div class="blog-bar-row"><span class="blog-bar-name">Kailani</span><span class="blog-bar-track"><span class="blog-bar-fill" style="width:11.5%; background:#6fa58e"></span></span><span class="blog-bar-value">479</span></div>
  </div>
</div>
<p>That is why celebrity-name stories can mislead. The famous person may light the match, but the name still has to survive ordinary parent taste. Khaleesi had a massive signal, but it carries a fictional title. Nevaeh started as a clever reversal and became a normal name. Kehlani sits in the middle: culturally specific enough to feel fresh, but name-like enough to keep traveling.</p>
<div class="blog-visual">
  <h3>Three ways a viral name survives or stalls</h3>
  <p>The article compares three mechanisms: celebrity identity, fandom identity, and a meme-name that became ordinary naming vocabulary.</p>
  <div class="metric-grid">
    <div class="metric-card"><strong>Kehlani</strong><b>12.4x</b><span>2015 to 2017 growth, from 48 to 596 births.</span></div>
    <div class="metric-card"><strong>Khaleesi</strong><b>466</b><span>2017 births, a fandom name with a narrower everyday use case.</span></div>
    <div class="metric-card"><strong>Nevaeh</strong><b>6,420</b><span>2010 peak, after the name had moved beyond the original backwards-heaven hook.</span></div>
  </div>
</div>
<p>Explore the companion chart at <a href="/viz/kehlani-effect.html">The Kehlani Effect visualization</a>, or compare the individual name pages for <a href="/name/Kehlani/">Kehlani</a>, <a href="/name/Khaleesi/">Khaleesi</a>, <a href="/name/Nevaeh/">Nevaeh</a>, and <a href="/name/Leilani/">Leilani</a>.</p>',
  'published',
  'NobodyNamed',
  '/api/og/default',
  '2026-05-19T09:00:00.000Z',
  datetime('now')
),
(
  'baby-names-that-vanished',
  'Baby Names That Vanished From America',
  'A visual tour of once-common American baby names that collapsed from thousands of births to almost nobody.',
  '<p>The strangest baby-name stories are not always the new names. Sometimes the shock is how fast a completely normal name becomes a time capsule. A name can peak with tens of thousands of births, then become rare enough that meeting a baby with that name feels surprising.</p>
<div class="blog-visual">
  <h3>From thousands of babies to almost nobody</h3>
  <p>Selected endangered names from the local SSA dataset. Bars show the latest recorded births as a share of the peak year.</p>
  <div class="blog-bars">
    <div class="blog-bar-row"><span class="blog-bar-name">Debbie</span><span class="blog-bar-track"><span class="blog-bar-fill" style="width:0.12%"></span></span><span class="blog-bar-value">19,537 to 24</span></div>
    <div class="blog-bar-row"><span class="blog-bar-name">Todd</span><span class="blog-bar-track"><span class="blog-bar-fill" style="width:1.04%"></span></span><span class="blog-bar-value">15,354 to 160</span></div>
    <div class="blog-bar-row"><span class="blog-bar-name">Rhonda</span><span class="blog-bar-track"><span class="blog-bar-fill" style="width:0.17%"></span></span><span class="blog-bar-value">10,950 to 19</span></div>
    <div class="blog-bar-row"><span class="blog-bar-name">Craig</span><span class="blog-bar-track"><span class="blog-bar-fill" style="width:1.93%"></span></span><span class="blog-bar-value">10,718 to 207</span></div>
    <div class="blog-bar-row"><span class="blog-bar-name">Peggy</span><span class="blog-bar-track"><span class="blog-bar-fill" style="width:0.23%"></span></span><span class="blog-bar-value">10,070 to 23</span></div>
    <div class="blog-bar-row"><span class="blog-bar-name">Carole</span><span class="blog-bar-track"><span class="blog-bar-fill" style="width:0.10%"></span></span><span class="blog-bar-value">8,409 to 8</span></div>
  </div>
</div>
<p>These names did not vanish because they were strange. They vanished because they became too successful at representing one adult generation. Debbie sounds mid-century because it really was mid-century. Todd, Craig, Peggy, Rhonda, and Carole carry a timestamp that parents can hear instantly.</p>
<p>That is the cruel loop of popularity. A name gets common enough to feel safe, then too common to feel fresh, then old enough to feel like someone from work, then old enough to feel like a grandparent, then sometimes fresh again. Not every name completes the loop.</p>
<p>Browse more at <a href="/endangered">Endangered names</a>, <a href="/extinct">Extinct names</a>, or inspect the individual paths for <a href="/name/Debbie/">Debbie</a>, <a href="/name/Todd/">Todd</a>, <a href="/name/Rhonda/">Rhonda</a>, and <a href="/name/Carole/">Carole</a>.</p>',
  'published',
  'NobodyNamed',
  '/api/og/default',
  '2026-05-19T09:10:00.000Z',
  datetime('now')
),
(
  'what-your-birth-year-name-says',
  'What Your Birth Year Name Says About You',
  'The top baby names of each era are a cultural timestamp. Here is the chart version.',
  '<p>Your birth year has a sound. It is not only the music, the movies, or the cars in family photos. It is the names repeated on class rosters. A top name is a cultural timestamp: Mary and John, Linda and James, Jennifer and Michael, Emily and Jacob, Emma and Liam.</p>
<div class="blog-visual">
  <h3>The sound of six American birth years</h3>
  <p>The most common girl and boy name in selected years from the local SSA dataset.</p>
  <svg viewBox="0 0 680 360" role="img" aria-label="Timeline showing top girl and boy names in 1900, 1925, 1950, 1975, 2000, and 2017">
    <line x1="70" y1="180" x2="620" y2="180" stroke="var(--rule)" stroke-width="2"/>
    <g>
      <circle cx="70" cy="180" r="6" fill="#a85d5d"/><text x="70" y="150" text-anchor="middle" class="chart-label">Mary</text><text x="70" y="212" text-anchor="middle" class="chart-label">John</text><text x="70" y="240" text-anchor="middle" class="axis-label">1900</text>
      <circle cx="180" cy="180" r="6" fill="#a85d5d"/><text x="180" y="150" text-anchor="middle" class="chart-label">Mary</text><text x="180" y="212" text-anchor="middle" class="chart-label">Robert</text><text x="180" y="240" text-anchor="middle" class="axis-label">1925</text>
      <circle cx="290" cy="180" r="6" fill="#a85d5d"/><text x="290" y="150" text-anchor="middle" class="chart-label">Linda</text><text x="290" y="212" text-anchor="middle" class="chart-label">James</text><text x="290" y="240" text-anchor="middle" class="axis-label">1950</text>
      <circle cx="400" cy="180" r="6" fill="#a85d5d"/><text x="400" y="150" text-anchor="middle" class="chart-label">Jennifer</text><text x="400" y="212" text-anchor="middle" class="chart-label">Michael</text><text x="400" y="240" text-anchor="middle" class="axis-label">1975</text>
      <circle cx="510" cy="180" r="6" fill="#a85d5d"/><text x="510" y="150" text-anchor="middle" class="chart-label">Emily</text><text x="510" y="212" text-anchor="middle" class="chart-label">Jacob</text><text x="510" y="240" text-anchor="middle" class="axis-label">2000</text>
      <circle cx="620" cy="180" r="6" fill="#a85d5d"/><text x="620" y="150" text-anchor="middle" class="chart-label">Emma</text><text x="620" y="212" text-anchor="middle" class="chart-label">Liam</text><text x="620" y="240" text-anchor="middle" class="axis-label">2017</text>
    </g>
    <text x="24" y="152" class="chart-note">girls</text><text x="24" y="214" class="chart-note">boys</text>
  </svg>
</div>
<p>Look at 1950 and 1975. Linda and Jennifer are not just names; they are entire cohorts. Michael held on longer, which is why it feels less pinned to a single decade. Mary and John were so dominant in early records that they read less like trends and more like infrastructure.</p>
<p>The fun version is personal: search your birth year, then compare your own name to the names around it. Were your parents joining the wave, avoiding it, or accidentally picking the next one?</p>
<p>Start with the <a href="/year">Birth year explorer</a>, then try a few era pages such as <a href="/era/1950/">1950</a>, <a href="/era/1975/">1975</a>, <a href="/era/2000/">2000</a>, and <a href="/era/2017/">2017</a>.</p>',
  'published',
  'NobodyNamed',
  '/api/og/default',
  '2026-05-19T09:20:00.000Z',
  datetime('now')
),
(
  'grandparent-names-coming-back',
  'Grandparent Names Are Coming Back',
  'Hazel, Eleanor, Theodore, Arthur, and other older names show how baby-name fashion loops back around.',
  '<p>The comeback name has a specific emotional trick. It has to be old enough to escape parent-age awkwardness, but not so old that it feels sealed in a museum. When it works, the name stops sounding dated and starts sounding sturdy.</p>
<div class="blog-visual">
  <h3>Old names with new momentum</h3>
  <p>Latest recorded counts versus historic peaks in the local SSA dataset.</p>
  <div class="mini-grid">
    <div class="mini-card"><strong>Henry</strong><svg viewBox="0 0 220 70" role="img" aria-label="Henry comeback sparkline"><path d="M8 20 C50 12 80 16 110 24 C145 36 175 26 212 18" fill="none" stroke="#465d75" stroke-width="4"/></svg><span>11,412 peak; 10,406 latest</span></div>
    <div class="mini-card"><strong>Eleanor</strong><svg viewBox="0 0 220 70" role="img" aria-label="Eleanor comeback sparkline"><path d="M8 18 C55 10 92 48 120 58 C150 66 178 34 212 28" fill="none" stroke="#a85d5d" stroke-width="4"/></svg><span>8,498 peak; 5,519 latest</span></div>
    <div class="mini-card"><strong>Hazel</strong><svg viewBox="0 0 220 70" role="img" aria-label="Hazel comeback sparkline"><path d="M8 22 C45 12 78 50 112 60 C150 68 180 38 212 32" fill="none" stroke="#a85d5d" stroke-width="4"/></svg><span>7,615 peak; 5,004 latest</span></div>
    <div class="mini-card"><strong>Theodore</strong><svg viewBox="0 0 220 70" role="img" aria-label="Theodore comeback sparkline"><path d="M8 42 C50 34 90 50 124 56 C154 62 180 24 212 14" fill="none" stroke="#465d75" stroke-width="4"/></svg><span>5,911 latest high</span></div>
    <div class="mini-card"><strong>Josephine</strong><svg viewBox="0 0 220 70" role="img" aria-label="Josephine comeback sparkline"><path d="M8 18 C44 12 80 36 112 56 C150 66 178 48 212 42" fill="none" stroke="#a85d5d" stroke-width="4"/></svg><span>8,683 peak; 2,791 latest</span></div>
    <div class="mini-card"><strong>Arthur</strong><svg viewBox="0 0 220 70" role="img" aria-label="Arthur comeback sparkline"><path d="M8 15 C45 12 86 30 120 46 C154 60 182 56 212 50" fill="none" stroke="#465d75" stroke-width="4"/></svg><span>10,527 peak; 1,503 latest</span></div>
  </div>
</div>
<p>These are not all the same kind of comeback. Henry barely disappeared. Eleanor and Hazel made the full loop from antique to fashionable. Theodore feels like a new peak. Arthur and Josephine are still quieter, which may be exactly why they appeal to parents who want familiar but not saturated.</p>
<p>The rule of thumb: a comeback name needs distance. Names from the parent generation often feel too close. Names from the grandparent or great-grandparent generation can feel newly available.</p>
<p>Browse more on the <a href="/comeback">Comebacks</a> page, or inspect <a href="/name/Hazel/">Hazel</a>, <a href="/name/Eleanor/">Eleanor</a>, <a href="/name/Theodore/">Theodore</a>, <a href="/name/Arthur/">Arthur</a>, and <a href="/name/Josephine/">Josephine</a>.</p>',
  'published',
  'NobodyNamed',
  '/api/og/default',
  '2026-05-19T09:30:00.000Z',
  datetime('now')
)
ON CONFLICT(slug) DO UPDATE SET
  title=excluded.title,
  description=excluded.description,
  body_html=excluded.body_html,
  status=excluded.status,
  author=excluded.author,
  og_image=excluded.og_image,
  published_at=excluded.published_at,
  updated_at=datetime('now');
