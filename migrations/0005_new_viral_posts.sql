-- Insert three new Namecalling blog posts using 2025 SSA data.
-- Posts: Boomer name collapse, vintage all-time records, two Americas.
-- Apply: wrangler d1 migrations apply nobodynamed --remote --config apps/web/wrangler.toml

PRAGMA foreign_keys = ON;

INSERT INTO blog_posts(slug,title,description,body_html,status,author,og_image,published_at,updated_at)
VALUES
(
  'your-moms-name-is-endangered',
  'Your Mom''s Name Is Endangered',
  'In 1947, 99,692 babies were named Linda. In 2025: 294. The most dominant baby name in American history is now nearly extinct — and Linda is not alone.',
  '<p>In 1947, 99,692 babies were named Linda. One in fifteen girls born that year carried the name. Linda was not just popular — it was statistically inescapable, the most successful single name in 145 years of American records.</p>
<p>By 2025, the count was 294.</p>
<div class="blog-visual">
  <h3>Linda, 1930&#8211;2025</h3>
  <p>Annual births from the SSA national dataset. The biggest single-name peak in American naming history, now nearly invisible at the right edge.</p>
  <svg viewBox="0 0 680 280" role="img" aria-label="Linda births per year from 1930 to 2025, peaking at 99,692 in 1947 then falling to 294">
    <line x1="58" y1="30" x2="58" y2="250" stroke="var(--rule)"/>
    <line x1="58" y1="250" x2="650" y2="250" stroke="var(--rule)"/>
    <line x1="58" y1="80" x2="650" y2="80" stroke="var(--rule)" stroke-dasharray="3 5" stroke-opacity="0.4"/>
    <line x1="58" y1="130" x2="650" y2="130" stroke="var(--rule)" stroke-dasharray="3 5" stroke-opacity="0.4"/>
    <line x1="58" y1="180" x2="650" y2="180" stroke="var(--rule)" stroke-dasharray="3 5" stroke-opacity="0.4"/>
    <text x="50" y="34" text-anchor="end" class="axis-label">100k</text>
    <text x="50" y="84" text-anchor="end" class="axis-label">75k</text>
    <text x="50" y="134" text-anchor="end" class="axis-label">50k</text>
    <text x="50" y="184" text-anchor="end" class="axis-label">25k</text>
    <text x="50" y="254" text-anchor="end" class="axis-label">0</text>
    <text x="58" y="268" text-anchor="middle" class="axis-label">1930</text>
    <text x="164" y="268" text-anchor="middle" class="axis-label">1947</text>
    <text x="307" y="268" text-anchor="middle" class="axis-label">1970</text>
    <text x="463" y="268" text-anchor="middle" class="axis-label">1995</text>
    <text x="650" y="268" text-anchor="middle" class="axis-label">2025</text>
    <polygon points="58,250 58,224 70,202 83,166 95,127 108,92 120,70 133,48 145,39 164,31 183,52 195,70 214,100 232,136 251,166 276,197 307,219 338,231 370,238 400,243 432,246 463,247 494,248 525,249 556,249 587,250 618,250 650,250" fill="var(--accent)" fill-opacity="0.12" stroke="none"/>
    <polyline points="58,224 70,202 83,166 95,127 108,92 120,70 133,48 145,39 164,31 183,52 195,70 214,100 232,136 251,166 276,197 307,219 338,231 370,238 400,243 432,246 463,247 494,248 525,249 556,249 587,250 618,250 650,250" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/>
    <circle cx="164" cy="31" r="4" fill="var(--accent)"/>
    <text x="172" y="28" class="chart-label" style="font-size:11px">99,692 in 1947</text>
    <circle cx="650" cy="250" r="3" fill="var(--muted)"/>
    <text x="644" y="244" text-anchor="end" class="dot-label">294 in 2025</text>
  </svg>
</div>
<p>Linda didn&#39;t fade because it became unfashionable. It faded because it became a generation. When parents hear "Linda" today, they picture a woman in her seventies. That is the cruel bargain of the generational name: the more completely you own an era, the faster you become a timestamp.</p>
<div class="blog-visual">
  <h3>The Boomer name collapse: 2025 births as a fraction of each name&#39;s peak</h3>
  <p>Each bar shows how much of the peak count survived to 2025. At this scale, the fills are barely visible &#8212; that is the point.</p>
  <div class="blog-bars">
    <div class="blog-bar-row"><span class="blog-bar-name">Linda</span><span class="blog-bar-track"><span class="blog-bar-fill" style="width:0.3%"></span></span><span class="blog-bar-value">99,692 &#8594; 294</span></div>
    <div class="blog-bar-row"><span class="blog-bar-name">Deborah</span><span class="blog-bar-track"><span class="blog-bar-fill" style="width:0.6%"></span></span><span class="blog-bar-value">52,318 &#8594; 313</span></div>
    <div class="blog-bar-row"><span class="blog-bar-name">Patricia</span><span class="blog-bar-track"><span class="blog-bar-fill" style="width:0.3%"></span></span><span class="blog-bar-value">51,278 &#8594; 167</span></div>
    <div class="blog-bar-row"><span class="blog-bar-name">Karen</span><span class="blog-bar-track"><span class="blog-bar-fill" style="width:0.4%"></span></span><span class="blog-bar-value">40,591 &#8594; 175</span></div>
    <div class="blog-bar-row"><span class="blog-bar-name">Donna</span><span class="blog-bar-track"><span class="blog-bar-fill" style="width:0.3%"></span></span><span class="blog-bar-value">34,138 &#8594; 98</span></div>
    <div class="blog-bar-row"><span class="blog-bar-name">Gary</span><span class="blog-bar-track"><span class="blog-bar-fill" style="width:0.5%"></span></span><span class="blog-bar-value">36,967 &#8594; 201</span></div>
    <div class="blog-bar-row"><span class="blog-bar-name">Dennis</span><span class="blog-bar-track"><span class="blog-bar-fill" style="width:0.4%"></span></span><span class="blog-bar-value">34,368 &#8594; 127</span></div>
  </div>
</div>
<p>What will it look like from the other side in 2085? Today&#39;s Liam, Emma, Noah, and Olivia are the Linda and Gary of their generation. A name that defines an era is a gift and a liability. It will always sound exactly like its time.</p>
<p>Browse more at <a href="/endangered">Endangered names</a>, or follow the full arc of <a href="/name/Linda/">Linda</a>, <a href="/name/Deborah/">Deborah</a>, <a href="/name/Karen/">Karen</a>, and <a href="/name/Patricia/">Patricia</a>.</p>',
  'published',
  'NobodyNamed',
  '/api/og/default',
  '2026-05-22T09:00:00.000Z',
  datetime('now')
),
(
  'the-great-vintage-revival',
  'The Great Vintage Revival',
  'Theodore peaked in 1920 at 3,219 babies. In 2025: 13,355 — an all-time record, four times higher than anything the name achieved before. Leo, Nora, and Evelyn are doing the same thing.',
  '<p>The name Theodore peaked in 1920 at 3,219 births. That was the all-time record for 105 years. Then the name declined, spent decades in the background, and started climbing again around 2010.</p>
<p>In 2025, 13,355 babies were named Theodore. That is not a recovery &#8212; it&#39;s a new all-time record, more than four times larger than anything the name had ever achieved.</p>
<p>Theodore isn&#39;t coming back. It&#39;s rewriting its own history.</p>
<div class="blog-visual">
  <h3>Theodore, 1880&#8211;2025: a century of decline, then a new record</h3>
  <p>Annual births from the SSA national dataset. The 1920 bar was the old all-time high. The 2025 point breaks it by 4&#215;.</p>
  <svg viewBox="0 0 680 280" role="img" aria-label="Theodore births per year 1880 to 2025, with 1920 as old peak and 2025 as new all-time record">
    <line x1="58" y1="30" x2="58" y2="250" stroke="var(--rule)"/>
    <line x1="58" y1="250" x2="650" y2="250" stroke="var(--rule)"/>
    <line x1="58" y1="140" x2="650" y2="140" stroke="var(--rule)" stroke-dasharray="3 5" stroke-opacity="0.4"/>
    <text x="50" y="34" text-anchor="end" class="axis-label">14k</text>
    <text x="50" y="144" text-anchor="end" class="axis-label">7k</text>
    <text x="50" y="254" text-anchor="end" class="axis-label">0</text>
    <text x="58" y="268" text-anchor="middle" class="axis-label">1880</text>
    <text x="221" y="268" text-anchor="middle" class="axis-label">1920</text>
    <text x="466" y="268" text-anchor="middle" class="axis-label">1980</text>
    <text x="650" y="268" text-anchor="middle" class="axis-label">2025</text>
    <polygon points="58,250 58,246 140,236 180,222 221,199 262,212 303,222 344,230 385,236 425,241 466,245 507,244 548,241 568,231 589,203 609,148 630,77 650,40 650,250" fill="var(--accent)" fill-opacity="0.12" stroke="none"/>
    <polyline points="58,246 140,236 180,222 221,199 262,212 303,222 344,230 385,236 425,241 466,245 507,244 548,241 568,231 589,203 609,148 630,77 650,40" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/>
    <circle cx="221" cy="199" r="4" fill="var(--muted)"/>
    <text x="229" y="196" class="dot-label">3,219 in 1920 (old record)</text>
    <circle cx="650" cy="40" r="4" fill="var(--accent)"/>
    <text x="642" y="34" text-anchor="end" class="chart-label" style="font-size:11px">13,355 in 2025</text>
  </svg>
</div>
<p>The classic comeback name needs generational distance. A name from your parents&#39; era still sounds dated. A name from your grandparents&#39; or great-grandparents&#39; era starts to feel newly available &#8212; classic without being tired. Theodore, Leo, Nora, and Evelyn all have exactly that quality.</p>
<div class="blog-visual">
  <h3>Old peak vs. 2025: names breaking their own records</h3>
  <p>Historic all-time peak count vs. 2025 births from the SSA dataset.</p>
  <div class="metric-grid">
    <div class="metric-card"><strong>Theodore</strong><b>13,355</b><span>4&#215; the 1920 record of 3,219</span></div>
    <div class="metric-card"><strong>Leo</strong><b>8,173</b><span>2&#215; the 1919 record of 4,054</span></div>
    <div class="metric-card"><strong>Nora</strong><b>6,380</b><span>4.3&#215; the 1916 record of 1,477</span></div>
    <div class="metric-card"><strong>Evelyn</strong><b>11,985</b><span>1.7&#215; the 1920s peak of ~7,200</span></div>
    <div class="metric-card"><strong>Eleanor</strong><b>7,649</b><span>Near the 1930 record of 8,497</span></div>
    <div class="metric-card"><strong>Hazel</strong><b>5,836</b><span>Near the 1921 record of 7,615</span></div>
  </div>
</div>
<p>Eleanor and Hazel haven&#39;t quite broken their old records yet, but they&#39;re close and still climbing. These names aren&#39;t retro &#8212; they&#39;re ascendant.</p>
<p>Browse more at <a href="/comeback">Comeback names</a>, or check the full arcs of <a href="/name/Theodore/">Theodore</a>, <a href="/name/Leo/">Leo</a>, <a href="/name/Nora/">Nora</a>, and <a href="/name/Evelyn/">Evelyn</a>.</p>',
  'published',
  'NobodyNamed',
  '/api/og/default',
  '2026-05-22T10:00:00.000Z',
  datetime('now')
),
(
  'two-americas',
  'Two Americas, One Baby Name Book',
  'Mateo has grown 10× in 20 years. Thiago, 130×. At the same time, Maverick, Waylon, and Weston have each quintupled. The 2025 data captures two distinct cultural movements — and both are winning simultaneously.',
  '<p>The 2025 SSA data shows two completely different naming movements happening at the same time, each one large, each one accelerating.</p>
<p>One is driven by the Latino and global cultural mainstream. Names like Mateo, Thiago, Luna, Santiago, and Valentina have grown 6&#215; to 130&#215; since 2005. They no longer need any label &#8212; they&#39;re just American names now.</p>
<p>The other movement draws from country music, outdoor culture, and the American West. Maverick, Waylon, Weston, Brooks, and Willow have grown just as fast, from the same starting point, toward an entirely different sound.</p>
<div class="blog-visual">
  <h3>The global wave: Latino and international names in 2025</h3>
  <p>Births in 2025, scaled to Mateo. Growth multiple since 2005 in parentheses.</p>
  <div class="blog-bars">
    <div class="blog-bar-row"><span class="blog-bar-name">Mateo</span><span class="blog-bar-track"><span class="blog-bar-fill"></span></span><span class="blog-bar-value">11,045 (10&#215;)</span></div>
    <div class="blog-bar-row"><span class="blog-bar-name">Santiago</span><span class="blog-bar-track"><span class="blog-bar-fill" style="width:68%"></span></span><span class="blog-bar-value">7,554 (6&#215;)</span></div>
    <div class="blog-bar-row"><span class="blog-bar-name">Aurora</span><span class="blog-bar-track"><span class="blog-bar-fill" style="width:64%"></span></span><span class="blog-bar-value">7,065 (7&#215;)</span></div>
    <div class="blog-bar-row"><span class="blog-bar-name">Luna</span><span class="blog-bar-track"><span class="blog-bar-fill" style="width:55%"></span></span><span class="blog-bar-value">6,076 (13&#215;)</span></div>
    <div class="blog-bar-row"><span class="blog-bar-name">Thiago</span><span class="blog-bar-track"><span class="blog-bar-fill" style="width:53%"></span></span><span class="blog-bar-value">5,835 (130&#215;)</span></div>
    <div class="blog-bar-row"><span class="blog-bar-name">Valentina</span><span class="blog-bar-track"><span class="blog-bar-fill" style="width:49%"></span></span><span class="blog-bar-value">5,354 (8&#215;)</span></div>
  </div>
</div>
<div class="blog-visual">
  <h3>The frontier wave: country, nature, and Western names in 2025</h3>
  <p>Births in 2025 on the same scale. A different cultural source, equally strong momentum.</p>
  <div class="blog-bars">
    <div class="blog-bar-row"><span class="blog-bar-name">Violet</span><span class="blog-bar-track"><span class="blog-bar-fill" style="width:68%"></span></span><span class="blog-bar-value">7,546 (all-time record)</span></div>
    <div class="blog-bar-row"><span class="blog-bar-name">Maverick</span><span class="blog-bar-track"><span class="blog-bar-fill" style="width:53%"></span></span><span class="blog-bar-value">5,894 (18&#215;)</span></div>
    <div class="blog-bar-row"><span class="blog-bar-name">Weston</span><span class="blog-bar-track"><span class="blog-bar-fill" style="width:50%"></span></span><span class="blog-bar-value">5,482 (7&#215;)</span></div>
    <div class="blog-bar-row"><span class="blog-bar-name">Waylon</span><span class="blog-bar-track"><span class="blog-bar-fill" style="width:49%"></span></span><span class="blog-bar-value">5,408 (15&#215;)</span></div>
    <div class="blog-bar-row"><span class="blog-bar-name">Brooks</span><span class="blog-bar-track"><span class="blog-bar-fill" style="width:44%"></span></span><span class="blog-bar-value">4,877 (14&#215;)</span></div>
    <div class="blog-bar-row"><span class="blog-bar-name">Willow</span><span class="blog-bar-track"><span class="blog-bar-fill" style="width:43%"></span></span><span class="blog-bar-value">4,763 (9&#215;)</span></div>
  </div>
</div>
<div class="blog-visual">
  <h3>The standout growth stories</h3>
  <div class="metric-grid">
    <div class="metric-card"><strong>Thiago</strong><b>130&#215;</b><span>44 births in 2005; 5,835 in 2025. The fastest-growing name in the dataset over 20 years.</span></div>
    <div class="metric-card"><strong>Maverick</strong><b>18&#215;</b><span>331 births in 2005; 5,894 in 2025. From Top Gun to kindergarten.</span></div>
    <div class="metric-card"><strong>Luna</strong><b>13&#215;</b><span>477 births in 2005; 6,076 in 2025. The night sky arrives in the classroom.</span></div>
  </div>
</div>
<p>What makes this remarkable is not either wave alone. It&#39;s that both are winning at the same time, each reflecting genuinely different communities with genuinely different values &#8212; and both are becoming a larger part of what an American baby name sounds like.</p>
<p>Explore the names: <a href="/name/Mateo/">Mateo</a>, <a href="/name/Thiago/">Thiago</a>, <a href="/name/Maverick/">Maverick</a>, <a href="/name/Waylon/">Waylon</a>, <a href="/name/Luna/">Luna</a>, <a href="/name/Violet/">Violet</a>.</p>',
  'published',
  'NobodyNamed',
  '/api/og/default',
  '2026-05-22T11:00:00.000Z',
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
