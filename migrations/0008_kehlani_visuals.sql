-- Add D3 visualizations to the Kehlani blog post and correct 2025 numbers from D1.

UPDATE blog_posts
SET
  body_html = '<div data-kehlani-visuals>
<p>Most pop-culture names show up loud and disappear before kindergarten. <a href="https://nobodynamed.com/name/Kehlani/">Kehlani</a> is in a different category. The name went from barely visible in SSA records to a recognizable signal in a few years, and ten years after the climb started, it is still going up.</p>
<h3>The full trajectory through 2025</h3>
<p>Birth counts in the SSA dataset. <a href="https://nobodynamed.com/name/Khaleesi/">Khaleesi</a> rose with its fandom, peaked in 2018, and has slowly declined since. <a href="https://nobodynamed.com/name/Nevaeh/">Nevaeh</a> peaked in 2010 and has been falling for over a decade.</p>
<div class="blog-visual">
  <div data-kehlani-line style="min-height:330px"></div>
  <noscript><p>Kehlani rose from 50 girls in 2015 to 1,981 in 2025.</p></noscript>
</div>
<p>Kehlani went from 50 births in 2015 to 598 in 2017 to 1,981 in 2025. That is roughly 40x growth over a decade with no crash phase. Most celebrity-named babies see a sharp spike followed by a sharp drop. Kehlani did not.</p>
<p>The pattern under that growth: parents do not copy a famous person directly. They pick up a sound and a spelling style that already fits where naming is headed. Kehlani worked because it landed in territory parents were already willing to use. <a href="https://nobodynamed.com/name/Leilani/">Leilani</a> and <a href="https://nobodynamed.com/name/Kailani/">Kailani</a> had both been trending before Kehlani entered the chart.</p>
<h3>The sound family Kehlani arrived into</h3>
<p>Vowel-heavy names with soft endings sit near Kehlani in the SSA data. <a href="https://nobodynamed.com/name/Aaliyah/">Aaliyah</a> gives the group an older anchor. Most were well-established before Kehlani''s spike, which is part of why the name survived where pure novelty names crash.</p>
<div class="blog-visual">
  <div data-kehlani-bars style="min-height:220px"></div>
  <noscript><p>2025 births: Leilani 3,792; Aaliyah 2,607; Kehlani 1,981; Kailani 1,215; Kalani 800.</p></noscript>
</div>
<p>Celebrity-name stories usually mislead. The famous person lights the match, but the name still has to survive ordinary parent taste once the coverage stops. Khaleesi got the biggest signal of any name in this group but carries a fictional title that some parents will not commit to. It peaked at 565 births in 2018 and has settled at 410 by 2025, still a real name but past its high. Nevaeh started as &quot;heaven&quot; spelled backwards in the early 2000s and got far enough out of that origin to read as a normal name. It peaked at 6,446 in 2010 and has been declining since.</p>
<p>Kehlani''s growth came from being recognizable as a chosen name without being a fandom flag. That is the middle position the other two miss.</p>
<h3>Three outcomes, one cycle</h3>
<p>Same era, three different outcomes for similar-sized cultural signals.</p>
<div class="blog-visual">
  <div data-kehlani-compare style="min-height:360px"></div>
  <noscript><p>Kehlani reached 1,981 births in 2025. Khaleesi reached 410. Nevaeh reached 1,828.</p></noscript>
</div>
<div class="blog-visual">
  <div class="metric-grid">
    <div class="metric-card"><strong>Kehlani</strong><b>1,981</b><span>2025 births. 40x growth since 2015. Still climbing.</span></div>
    <div class="metric-card"><strong>Khaleesi</strong><b>410</b><span>2025 births. Peaked at 565 in 2018. Slowly declining.</span></div>
    <div class="metric-card"><strong>Nevaeh</strong><b>1,828</b><span>2025 births. Peaked at 6,446 in 2010. Declining for 15 years.</span></div>
  </div>
</div>
<p>Explore the companion chart at <a href="https://nobodynamed.com/viz/kehlani-effect">The Kehlani Effect visualization</a>, or compare the individual name pages for Kehlani, Khaleesi, Nevaeh, and Leilani.</p>
</div>
<script src="https://d3js.org/d3.v7.min.js" data-cfasync="false" defer></script>
<script src="/assets/blog-kehlani.js" data-cfasync="false" defer></script>',
  updated_at = datetime('now')
WHERE slug = 'the-kehlani-effect';
