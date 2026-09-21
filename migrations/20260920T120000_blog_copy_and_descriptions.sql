-- Namecalling copy audit follow-up.
--
-- 1. Rewrites the 12 blog descriptions that were cut mid-word by the old
--    truncateDescription() (fixed in scripts/blog-publish.ts in the same
--    change set); each replacement ends at a sentence boundary.
-- 2. Copy pass on flash-floods and one-hit-wonder-names via targeted
--    replace() edits: thins em dashes, retires metaphors that repeated
--    across posts ("receipt from American pop culture", "cultural oxygen",
--    "cultural timestamps"), drops a "not just statistics" negative
--    parallelism, and repairs a broken <a href> attribute that used curly
--    quotes. Every replace() pattern below was verified to match the
--    current body_html exactly once.
-- 3. Retitles flash-floods so it no longer collides with the earlier post
--    "The Names That Arrived All at Once". Slug is unchanged.
--
-- Apply with:
--   npm run blog:apply:local -- migrations/20260920T120000_blog_copy_and_descriptions.sql
--   npm run blog:apply:remote -- migrations/20260920T120000_blog_copy_and_descriptions.sql

PRAGMA foreign_keys = ON;

-- Descriptions: no more mid-word cuts on the /blog/ index cards.
UPDATE blog_posts SET description='175 names surged from nowhere to a peak and collapsed within five years. These are the flash floods of American naming.', updated_at=datetime('now') WHERE slug='flash-floods';
UPDATE blog_posts SET description='Every year has a baby name that appears from nowhere with the largest first-year count. Together they form a century of American media and migration.', updated_at=datetime('now') WHERE slug='the-names-that-arrived-all-at-once';
UPDATE blog_posts SET description='Forty years of video games leaked onto real American birth certificates, often the exact year a game shipped.', updated_at=datetime('now') WHERE slug='press-start-to-name';
UPDATE blog_posts SET description='We abandoned our most popular names, quietly converged on a few sounds, then manufactured uniqueness by respelling them.', updated_at=datetime('now') WHERE slug='how-america-stopped-sharing-names';
UPDATE blog_posts SET description='In 1947, 99,692 babies were named Linda: one in fifteen American girls, the most successful name in 145 years of records. In 2025, the count was 294.', updated_at=datetime('now') WHERE slug='your-moms-name-is-endangered';
UPDATE blog_posts SET description='The name Theodore peaked in 1920 at 3,219 births, a record that held for 105 years. In 2025, 13,355 babies broke it.', updated_at=datetime('now') WHERE slug='the-great-vintage-revival';
UPDATE blog_posts SET description='Two trends in the 2025 SSA data look like opposites: Mateo, Thiago, Luna, and Valentina on one side, Maverick and its kin on the other.', updated_at=datetime('now') WHERE slug='mateo-and-maverick';
UPDATE blog_posts SET description='Most pop-culture names show up loud and disappear before kindergarten. Kehlani is in a different category.', updated_at=datetime('now') WHERE slug='the-kehlani-effect';
UPDATE blog_posts SET description='The most surprising data in the SSA archive isn''t the unusual names. It''s how fast a normal name can disappear.', updated_at=datetime('now') WHERE slug='baby-names-that-vanished';
UPDATE blog_posts SET description='Your birth year has a sound. Class rosters carried it before you knew it was there.', updated_at=datetime('now') WHERE slug='what-your-birth-year-name-says';
UPDATE blog_posts SET description='A comeback name has to be old enough that it isn''t still attached to someone''s parents, but not so old that it sounds like a museum label.', updated_at=datetime('now') WHERE slug='grandparent-names-coming-back';
UPDATE blog_posts SET description='Kunta in 1977. Arsenio in 1989. Moesha in 1996. Names that appeared out of nowhere, peaked, and vanished — the one-hit wonders of 145 years of SSA data.', updated_at=datetime('now') WHERE slug='one-hit-wonder-names';

-- flash-floods: retitle + copy pass.
UPDATE blog_posts SET title='The Flash Floods of American Naming', updated_at=datetime('now') WHERE slug='flash-floods';
UPDATE blog_posts SET body_html=replace(body_html, 'Each of these names is a receipt from American pop culture.', 'Nearly all of them trace to a specific moment in American pop culture.'), updated_at=datetime('now') WHERE slug='flash-floods';
UPDATE blog_posts SET body_html=replace(body_html, 'ABC aired <em>Roots</em> — an eight-night miniseries about Kunta Kinte.', 'ABC aired <em>Roots</em>, an eight-night miniseries about Kunta Kinte.'), updated_at=datetime('now') WHERE slug='flash-floods';
UPDATE blog_posts SET body_html=replace(body_html, 'after Kunta Kinte''s daughter — the flood''s only other survivor of note.', 'after Kunta Kinte''s daughter, the flood''s only other survivor of note.'), updated_at=datetime('now') WHERE slug='flash-floods';
UPDATE blog_posts SET body_html=replace(body_html, '426 girls were named Moesha — a name that had essentially never existed in SSA records before.', '426 girls were named Moesha, a name that had essentially never existed in SSA records before.'), updated_at=datetime('now') WHERE slug='flash-floods';
UPDATE blog_posts SET body_html=replace(body_html, 'but there is no obvious cause — no film, no show, no famous Bethzy in any record we can find.', 'but there is no obvious cause: no film, no show, no famous Bethzy in any record we can find.'), updated_at=datetime('now') WHERE slug='flash-floods';
UPDATE blog_posts SET body_html=replace(body_html, 'Neymar peaked at 499 boys in 2014 — the World Cup year — but a lasting career produces a lasting name:', 'Neymar peaked at 499 boys in 2014, the World Cup year, but a lasting career produces a lasting name:'), updated_at=datetime('now') WHERE slug='flash-floods';
UPDATE blog_posts SET body_html=replace(body_html, 'And Aaden — one of the sextuplets from <em>Jon &amp; Kate Plus 8</em> — spiked to 1269', 'And Aaden, one of the sextuplets from <em>Jon &amp; Kate Plus 8</em>, spiked to 1269'), updated_at=datetime('now') WHERE slug='flash-floods';
UPDATE blog_posts SET body_html=replace(body_html, 'The flash floods are the names whose cultural oxygen disappeared; these survivors found genuine affection instead.', 'The flash floods are the names that lost their moment; the survivors found genuine affection instead.'), updated_at=datetime('now') WHERE slug='flash-floods';

-- one-hit-wonder-names: copy pass + broken href repair.
UPDATE blog_posts SET body_html=replace(body_html, 'certain names arrived with a bang and left just as fast — perfect cultural timestamps, crystallized in a single year’s birth records.', 'certain names arrived with a bang and left just as fast. Each one pins a cultural moment to a single year of birth records.'), updated_at=datetime('now') WHERE slug='one-hit-wonder-names';
UPDATE blog_posts SET body_html=replace(body_html, 'They’re not just statistics. Each one is a receipt from American pop culture.', 'Each one is a receipt from American pop culture.'), updated_at=datetime('now') WHERE slug='one-hit-wonder-names';
UPDATE blog_posts SET body_html=replace(body_html, 'ABC aired <em>Roots</em> — an eight-night miniseries about Kunta Kinte, an African man sold into slavery in America.', 'ABC aired <em>Roots</em>, an eight-night miniseries about Kunta Kinte, an African man sold into slavery in America.'), updated_at=datetime('now') WHERE slug='one-hit-wonder-names';
UPDATE blog_posts SET body_html=replace(body_html, 'Arsenio Hall had been a recognizable name in comedy circles for years — which is why a small but steady trickle of Arsenios existed', 'Arsenio Hall had been a recognizable name in comedy circles for years, so a small but steady trickle of Arsenios existed'), updated_at=datetime('now') WHERE slug='one-hit-wonder-names';
UPDATE blog_posts SET body_html=replace(body_html, 'Within two years it had fallen to 46 — 11.6% of its peak.', 'Within two years it had fallen to 46, 11.6% of its peak.'), updated_at=datetime('now') WHERE slug='one-hit-wonder-names';
UPDATE blog_posts SET body_html=replace(body_html, '426 girls were named Moesha — a name that had essentially never existed before in SSA records.', '426 girls were named Moesha, a name that had essentially never existed before in SSA records.'), updated_at=datetime('now') WHERE slug='one-hit-wonder-names';
UPDATE blog_posts SET body_html=replace(body_html, 'J-Kwon’s “Tipsy” was the breakout track of early 2004 — an 18-year-old rapper from St. Louis who hit #2 on the Billboard Hot 100 before most people knew his name.', 'J-Kwon’s “Tipsy” was the breakout track of early 2004. An 18-year-old rapper from St. Louis, he hit #2 on the Billboard Hot 100 before most people knew his name.'), updated_at=datetime('now') WHERE slug='one-hit-wonder-names';
UPDATE blog_posts SET body_html=replace(body_html, 'The spike is as sharp as any in this post — sharper than Jkwon, nearly as steep as Kunta — but there is no obvious cause.', 'The spike is as sharp as any in this post, sharper than Jkwon and nearly as steep as Kunta, but there is no obvious cause.'), updated_at=datetime('now') WHERE slug='one-hit-wonder-names';
UPDATE blog_posts SET body_html=replace(body_html, '<a href=”/about”>reach out</a>', '<a href="/about">reach out</a>'), updated_at=datetime('now') WHERE slug='one-hit-wonder-names';
UPDATE blog_posts SET body_html=replace(body_html, 'before peaking at 499 in 2014 — the year Brazil hosted the World Cup.', 'before peaking at 499 in 2014, the year Brazil hosted the World Cup.'), updated_at=datetime('now') WHERE slug='one-hit-wonder-names';
UPDATE blog_posts SET body_html=replace(body_html, 'A miniseries finale, a talk show cancellation, a rapper’s one hit — the cultural oxygen disappears, and the name goes with it.', 'A miniseries finale, a talk show cancellation, a rapper’s one hit: when the moment passes, the name goes with it.'), updated_at=datetime('now') WHERE slug='one-hit-wonder-names';
UPDATE blog_posts SET body_html=replace(body_html, 'Khaleesi — from <em>Game of Thrones</em> — peaked in 2018', 'Khaleesi, from <em>Game of Thrones</em>, peaked in 2018'), updated_at=datetime('now') WHERE slug='one-hit-wonder-names';
