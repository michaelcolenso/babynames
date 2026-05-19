-- Upgrade the live Kehlani article with the full set of referenced visuals.
-- This follows 0003 because production may already have recorded that seed.

UPDATE blog_posts
SET
  body_html = '<p>Some pop-culture names arrive like fireworks. They flare, screenshot well, and fade before kindergarten. Kehlani is different. In the local SSA dataset, the name went from barely visible to a top modern culture signal in only a few years.</p>
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
  updated_at = datetime('now')
WHERE slug = 'the-kehlani-effect';
