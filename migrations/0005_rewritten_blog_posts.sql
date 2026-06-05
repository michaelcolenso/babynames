-- Upsert rewritten NobodyNamed blog posts from the May 2026 editorial refresh.
-- Source files were provided as Markdown attachments and converted to body_html
-- for the existing D1-backed blog renderer.

PRAGMA foreign_keys = ON;

INSERT INTO blog_posts(slug, title, description, body_html, status, author, og_image, published_at, updated_at)
VALUES
('two-americas',
  'Two Americas, One Baby Name Book',
  'The 2025 SSA data shows two large naming movements happening at the same time. Both are accelerating, both have been compounding for two decades, and they dr...',
  '<p>The 2025 SSA data shows two large naming movements happening at the same time. Both are accelerating, both have been compounding for two decades, and they draw from completely different cultural sources.</p>
<p>One is driven by Latino and global naming traditions. <a href="https://nobodynamed.com/name/Mateo/">Mateo</a>, <a href="https://nobodynamed.com/name/Thiago/">Thiago</a>, <a href="https://nobodynamed.com/name/Luna/">Luna</a>, <a href="https://nobodynamed.com/name/Santiago/">Santiago</a>, and <a href="https://nobodynamed.com/name/Valentina/">Valentina</a> have all grown 6x to 130x since 2005. They no longer carry any qualifier in the data. They''re American names.</p>
<p>The other movement draws from country music, the outdoors, and the American <a href="https://nobodynamed.com/name/West/">West</a>. <a href="https://nobodynamed.com/name/Maverick/">Maverick</a>, <a href="https://nobodynamed.com/name/Waylon/">Waylon</a>, <a href="https://nobodynamed.com/name/Weston/">Weston</a>, <a href="https://nobodynamed.com/name/Brooks/">Brooks</a>, and <a href="https://nobodynamed.com/name/Willow/">Willow</a> have grown at similar rates from similar starting points, toward a sound that comes from somewhere else entirely.</p>
<h3>The global wave: Latino and international names in 2025</h3>
<p>Births in 2025, scaled to <a href="https://nobodynamed.com/name/Mateo/">Mateo</a>. Growth multiple since 2005 shown in parentheses.</p>
<p><a href="https://nobodynamed.com/name/Mateo/">Mateo</a> 11,045 (10x)</p>
<p><a href="https://nobodynamed.com/name/Santiago/">Santiago</a> 7,554 (6x)</p>
<p><a href="https://nobodynamed.com/name/Aurora/">Aurora</a> 7,065 (7x)</p>
<p><a href="https://nobodynamed.com/name/Luna/">Luna</a> 6,076 (13x)</p>
<p><a href="https://nobodynamed.com/name/Thiago/">Thiago</a> 5,835 (130x)</p>
<p><a href="https://nobodynamed.com/name/Valentina/">Valentina</a> 5,354 (8x)</p>
<h3>The frontier wave: country, nature, and Western names in 2025</h3>
<p>Births in 2025 on the same scale. Different cultural source, comparable momentum.</p>
<p><a href="https://nobodynamed.com/name/Violet/">Violet</a> 7,546 (all-time record)</p>
<p><a href="https://nobodynamed.com/name/Maverick/">Maverick</a> 5,894 (18x)</p>
<p><a href="https://nobodynamed.com/name/Weston/">Weston</a> 5,482 (7x)</p>
<p><a href="https://nobodynamed.com/name/Waylon/">Waylon</a> 5,408 (15x)</p>
<p><a href="https://nobodynamed.com/name/Brooks/">Brooks</a> 4,877 (14x)</p>
<p><a href="https://nobodynamed.com/name/Willow/">Willow</a> 4,763 (9x)</p>
<h3>The standout growth stories</h3>
<p><strong><a href="https://nobodynamed.com/name/Thiago/">Thiago</a> 130x.</strong> 44 births in 2005, 5,835 in 2025. The fastest-growing name in the SSA dataset over the last 20 years.</p>
<p><strong><a href="https://nobodynamed.com/name/Maverick/">Maverick</a> 18x.</strong> 331 births in 2005, 5,894 in 2025. The 1986 movie didn''t move the name. The 2022 sequel did, and so did two decades of country radio.</p>
<p><strong><a href="https://nobodynamed.com/name/Luna/">Luna</a> 13x.</strong> 477 births in 2005, 6,076 in 2025. Helped along by Chrissy Teigen and John Legend naming their first daughter Luna in 2016, and by the name''s existing presence in Spanish-speaking communities well before that.</p>
<p>Both waves are large, and both are still climbing. They draw from different communities and different sounds, but they show up in the same year''s data. An American baby name in 2025 is more likely than ever to come from one of these two pools.</p>
<p>Explore the names: <a href="https://nobodynamed.com/name/Mateo/">Mateo</a>, <a href="https://nobodynamed.com/name/Thiago/">Thiago</a>, <a href="https://nobodynamed.com/name/Maverick/">Maverick</a>, <a href="https://nobodynamed.com/name/Waylon/">Waylon</a>, <a href="https://nobodynamed.com/name/Luna/">Luna</a>, <a href="https://nobodynamed.com/name/Violet/">Violet</a>.</p>',
  'published',
  'NobodyNamed',
  '/api/og/default',
  '2026-05-22T09:00:00.000Z',
  datetime('now')),
('one-hit-wonder-names',
  'One-Hit Wonder Names',
  'The Social Security Administration has tracked American baby names since 1880. In 145 years of data, certain names show up out of nowhere and disappear withi...',
  '<p>The Social Security Administration has tracked American baby names since 1880. In 145 years of data, certain names show up out of nowhere and disappear within a few seasons of their debut year. Almost all of them trace back to a specific cultural moment.</p>
<h2>Kunta (1977)</h2>
<p>ABC aired <em>Roots</em> over eight consecutive nights starting January 23, 1977, adapting Alex Haley''s novel about an African man kidnapped and sold into slavery in colonial Virginia. LeVar Burton played the young Kunta Kinte. The finale drew a 51.1 Nielsen rating and a 71 share, and 85% of all American TV homes saw at least part of the broadcast.</p>
<p>That year, 215 baby boys were named Kunta. By 1979 the count was 16, and by 1981 the name had dropped out of SSA records entirely.</p>
<h2>Arsenio (1989)</h2>
<p>Arsenio Hall had worked steadily in comedy through the 1980s, including a supporting role in 1988''s <em>Coming to America</em>. That''s why a small but steady trickle of Arsenios shows up in SSA records through the decade. <em>The Arsenio Hall Show</em> launched on January 3, 1989, ran opposite Carson and Letterman, and quickly pulled a younger and more racially diverse audience than either.</p>
<p>397 boys received the name in 1989. By 1991 it was down to 46, and by the time the show was cancelled in 1994 the name was already on its way out of the record.</p>
<h2>Moesha (1996)</h2>
<p>UPN''s <em>Moesha</em> premiered in January 1996 with 17-year-old Brandy Norwood in the title role as a Black teenager in South Los Angeles. Brandy was a year out from her platinum-selling self-titled debut album, and the show became a tentpole for the new network. Before its premiere, the name was almost nonexistent in SSA records.</p>
<p>426 girls were named Moesha in 1996, falling to 61 by 1999. The reruns never generated a second wave.</p>
<h2>Jkwon (2004)</h2>
<p>J-Kwon''s "Tipsy" climbed to #2 on the Billboard Hot 100 in spring 2004, held off the top spot by Usher''s "Yeah!" featuring Lil Jon and Ludacris. The rapper was 18, from St. Louis, and the song was bigger than he was.</p>
<p>100 boys were named Jkwon in 2004, falling to 7 by 2008. None of his follow-up singles charted near "Tipsy."</p>
<h2>Bethzy (2006)</h2>
<p>11 girls were named Bethzy in 2005. 301 in 2006. 28 in 2007.</p>
<p>There''s no film, no television show, no athlete or musician in any database that explains 301 babies in one year. The phonetic structure is common in Latin American naming traditions, which suggests a regional or community-level event that national media never picked up. That''s a hypothesis, not an answer. The SSA data is clear, the cause is not. If you know what happened in 2006, <a href="/about">reach out</a>.</p>
<h2>Neymar</h2>
<p>Not every pop-culture name crashes. Neymar started appearing in SSA records in 2010, the year the young Brazilian forward broke into international play with Santos and started drawing comparisons to Pelé. The name peaked at 499 in 2014, when Brazil hosted the World Cup on home soil. A decade later, 53 boys were still being named Neymar in 2025. He''s still playing professionally, and the name has held.</p>
<hr>
<p>The names that vanish fastest are attached to single events with clear endings. The event finishes. The next year''s parents make different choices, and the name fades from the record a few years behind.</p>
<p>Browse the names: <a href="https://nobodynamed.com/name/Kunta">Kunta</a> · <a href="https://nobodynamed.com/name/Arsenio">Arsenio</a> · <a href="https://nobodynamed.com/name/Moesha">Moesha</a> · <a href="https://nobodynamed.com/name/Neymar">Neymar</a> · <a href="https://nobodynamed.com/name/Khaleesi">Khaleesi</a></p>',
  'published',
  'NobodyNamed',
  '/api/og/default',
  '2026-05-22T09:00:00.000Z',
  datetime('now')),
('mateo-and-maverick',
  'Mateo and Maverick Want the Same Thing',
  'Two trends in the 2025 SSA data look like opposites. One pool: Mateo, Thiago, Luna, Santiago, Valentina, all growing 6x to 130x in twenty years. The other: M...',
  '<p>Two trends in the 2025 SSA data look like opposites. One pool: <a href="https://nobodynamed.com/name/Mateo/">Mateo</a>, <a href="https://nobodynamed.com/name/Thiago/">Thiago</a>, <a href="https://nobodynamed.com/name/Luna/">Luna</a>, <a href="https://nobodynamed.com/name/Santiago/">Santiago</a>, <a href="https://nobodynamed.com/name/Valentina/">Valentina</a>, all growing 6x to 130x in twenty years. The other: <a href="https://nobodynamed.com/name/Maverick/">Maverick</a>, <a href="https://nobodynamed.com/name/Waylon/">Waylon</a>, <a href="https://nobodynamed.com/name/Weston/">Weston</a>, <a href="https://nobodynamed.com/name/Brooks/">Brooks</a>, <a href="https://nobodynamed.com/name/Willow/">Willow</a>, growing at similar rates from similar starting points.</p>
<p>The conventional read is that two Americas are pulling apart. Latino-coded names on one side, country-coded names on the other, both rising as their demographics grow. Identity sorting visible at the level of the birth certificate.</p>
<p>It''s a clean story. It doesn''t survive a close look at either pool.</p>
<h2>The Thiago question</h2>
<p>Thiago grew 130x in twenty years. That''s the single most extreme growth rate in the SSA dataset. "Latino names rising" doesn''t explain why this name specifically, when other Brazilian-Portuguese names like Lucas, Bruno, and Felipe grew far less in the same window. It also doesn''t explain why the spelling Thiago beat Tiago, when Tiago is a common Portuguese form too.</p>
<p>The name tracks two soccer careers. Thiago Silva was named captain of Brazil in 2012, started the 2014 World Cup as captain on home soil, then anchored PSG from 2012 to 2020 and Chelsea from 2020 to 2024. Thiago Alcântara won the Champions League with Bayern in 2020 (against PSG, where Silva was captain, so both Thiagos played in that final). Both spell their names with the Th. The American spelling that took off in the data is the spelling these two players use.</p>
<p>That''s not a Latino naming movement. That''s two soccer careers shaping which version of a name American parents heard most often.</p>
<h2>The Maverick question</h2>
<p>Maverick had a small move after the original Top Gun in 1986. The big climb came in the 2010s, with another spike after Top Gun: Maverick in 2022. The name tracks two movies and country radio. It doesn''t track a generalized turn toward frontier values.</p>
<p>The other names in that pool don''t all share a "country/Western" label either. Brooks isn''t a Western name. Weston isn''t either. Both are surnames used as first names, the same trend that produced Brody, Hudson, Carter, and Cooper across the 2000s and 2010s. Waylon is a country-music name (Waylon Jennings died in 2002, and the name began climbing later that decade as country revivalists named kids after him). Willow comes from Will Smith and Jada Pinkett-Smith naming their daughter Willow in 2000, not from any frontier aesthetic.</p>
<p>The pool is real. It''s a sound category and a media category, not a politics category.</p>
<h2>What both pools share</h2>
<p>Both lists do the same thing. They give parents a sound that isn''t already attached to someone''s mom or grandfather. They mark a deliberate choice without being aggressively unusual.</p>
<p>Look at what''s falling. <a href="https://nobodynamed.com/name/Linda/">Linda</a>, <a href="https://nobodynamed.com/name/Karen/">Karen</a>, <a href="https://nobodynamed.com/name/Patricia/">Patricia</a>, <a href="https://nobodynamed.com/name/Deborah/">Deborah</a>, <a href="https://nobodynamed.com/name/Gary/">Gary</a>, <a href="https://nobodynamed.com/name/Dennis/">Dennis</a>. The names dropping fastest are the ones that became so closely associated with one specific cohort that parents in 2026 can hear the age the moment the name is spoken. The names rising are the ones that escape that association. Some escape it by drawing from a different cultural pool (<a href="https://nobodynamed.com/name/Mateo/">Mateo</a>, <a href="https://nobodynamed.com/name/Luna/">Luna</a>). Some by reviving a name nobody has used in 80 years (<a href="https://nobodynamed.com/name/Theodore/">Theodore</a>, <a href="https://nobodynamed.com/name/Eleanor/">Eleanor</a>, <a href="https://nobodynamed.com/name/Hazel/">Hazel</a>). Some by picking up on a specific media moment (Maverick, Waylon, <a href="https://nobodynamed.com/name/Kehlani/">Kehlani</a>).</p>
<p>The shared impulse is the same: move away from the names that defined the boomer and Gen X years.</p>
<h2>What the data shows</h2>
<p>The "two Americas" frame predicts cultural sorting. It predicts that each demographic group should be choosing names that mark distance from the other group, with rising polarization visible in name choice. The SSA data doesn''t show that pattern. It shows parents across the country making the same kind of choice, drawing on different cultural reservoirs depending on background. The reservoirs differ. The reaching is the same.</p>
<p>That read is harder to summarize than "two Americas, both winning." It also fits the numbers better.</p>
<hr>
<p>Explore the names: <a href="https://nobodynamed.com/name/Thiago/">Thiago</a>, <a href="https://nobodynamed.com/name/Mateo/">Mateo</a>, <a href="https://nobodynamed.com/name/Maverick/">Maverick</a>, <a href="https://nobodynamed.com/name/Waylon/">Waylon</a>, <a href="https://nobodynamed.com/name/Brooks/">Brooks</a>, <a href="https://nobodynamed.com/name/Willow/">Willow</a>, <a href="https://nobodynamed.com/name/Luna/">Luna</a>.</p>',
  'published',
  'NobodyNamed',
  '/api/og/default',
  '2026-05-22T09:00:00.000Z',
  datetime('now')),
('grandparent-names-coming-back',
  'Grandparent Names Are Coming Back',
  'A comeback name has to be old enough that it isn''t still attached to someone''s parents, but not so old that it sounds like a museum label. There''s roughly a...',
  '<p>A comeback name has to be old enough that it isn''t still attached to someone''s parents, but not so old that it sounds like a museum label. There''s roughly a 70 to 100 year window where a name has aged out of recent association but hasn''t yet become unreadable. That''s where most current revivals are sitting.</p>
<h3>Old names with new momentum</h3>
<p>Latest recorded counts versus historic peaks in the SSA dataset.</p>
<p><strong><a href="https://nobodynamed.com/name/Henry/">Henry</a></strong> 11,412 peak, 10,406 latest</p>
<p><strong><a href="https://nobodynamed.com/name/Eleanor/">Eleanor</a></strong> 8,498 peak, 5,519 latest</p>
<p><strong><a href="https://nobodynamed.com/name/Hazel/">Hazel</a></strong> 7,615 peak, 5,004 latest</p>
<p><strong><a href="https://nobodynamed.com/name/Theodore/">Theodore</a></strong> 5,911 latest (a new high)</p>
<p><strong><a href="https://nobodynamed.com/name/Josephine/">Josephine</a></strong> 8,683 peak, 2,791 latest</p>
<p><strong><a href="https://nobodynamed.com/name/Arthur/">Arthur</a></strong> 10,527 peak, 1,503 latest</p>
<p>These aren''t all the same kind of comeback. Henry barely left, so its current numbers are continuity rather than revival. Eleanor and Hazel made the full loop from antique to fashionable. Theodore is past its old peak. Arthur and Josephine are quieter, which may be exactly why they appeal to parents who want a familiar name without picking one already saturated in their friend group.</p>
<p>The rule of thumb: a name needs about three generations of distance before it''s available again. A name from the parent generation feels too close. A name from the grandparent or great-grandparent generation can feel newly usable.</p>
<p>Browse more on the <a href="https://nobodynamed.com/comeback">Comebacks</a> page, or inspect <a href="https://nobodynamed.com/name/Hazel/">Hazel</a>, <a href="https://nobodynamed.com/name/Eleanor/">Eleanor</a>, <a href="https://nobodynamed.com/name/Theodore/">Theodore</a>, <a href="https://nobodynamed.com/name/Arthur/">Arthur</a>, and <a href="https://nobodynamed.com/name/Josephine/">Josephine</a>.</p>',
  'published',
  'NobodyNamed',
  '/api/og/default',
  '2026-05-19T09:00:00.000Z',
  datetime('now')),
('your-moms-name-is-endangered',
  'Your Mom''s Name Is Endangered',
  'In 1947, 99,692 babies were named Linda. One in fifteen American girls born that year carried the name. It was the most successful single name in 145 years o...',
  '<p>In 1947, 99,692 babies were named <a href="https://nobodynamed.com/name/Linda/">Linda</a>. One in fifteen American girls born that year carried the name. It was the most successful single name in 145 years of SSA records.</p>
<p>In 2025, the count was 294.</p>
<h3>Linda, 1930 to 2025</h3>
<p>Annual births from the SSA national dataset. The biggest single-name peak in American naming history, now nearly invisible at the right edge.</p>
<p>100k 75k 50k 25k 0 1930 1947 1970 1995 2025 99,692 in 1947 294 in 2025</p>
<p>Linda didn''t go out of fashion in the usual sense. It became a generation. When parents hear the name in 2026, they picture a woman in her seventies. Names that dominate a single era pick up a generational signature, and once that signature is set, the name becomes unusable for new parents until the cohort has cycled all the way out of mind.</p>
<h3>Boomer-era names: 2025 births as a fraction of each name''s peak</h3>
<p>Each row shows the peak count and the 2025 count. At full scale, the 2025 bars are barely visible.</p>
<p><a href="https://nobodynamed.com/name/Linda/">Linda</a> 99,692 to 294</p>
<p><a href="https://nobodynamed.com/name/Deborah/">Deborah</a> 52,318 to 313</p>
<p><a href="https://nobodynamed.com/name/Patricia/">Patricia</a> 51,278 to 167</p>
<p><a href="https://nobodynamed.com/name/Karen/">Karen</a> 40,591 to 175</p>
<p><a href="https://nobodynamed.com/name/Donna/">Donna</a> 34,138 to 98</p>
<p><a href="https://nobodynamed.com/name/Gary/">Gary</a> 36,967 to 201</p>
<p><a href="https://nobodynamed.com/name/Dennis/">Dennis</a> 34,368 to 127</p>
<p>Karen has the additional weight of becoming a meme during 2018 to 2021, which probably accelerated its drop. The others are just running the standard generational decline. By 2085, today''s <a href="https://nobodynamed.com/name/Liam/">Liam</a>, <a href="https://nobodynamed.com/name/Emma/">Emma</a>, <a href="https://nobodynamed.com/name/Noah/">Noah</a>, and <a href="https://nobodynamed.com/name/Olivia/">Olivia</a> will be in the same position. Whatever the equivalent of "Karen" is in the 2080s, it will be one of these.</p>
<p>Browse more at <a href="https://nobodynamed.com/endangered">Endangered names</a>, or follow the full arc of <a href="https://nobodynamed.com/name/Linda/">Linda</a>, <a href="https://nobodynamed.com/name/Deborah/">Deborah</a>, <a href="https://nobodynamed.com/name/Karen/">Karen</a>, and <a href="https://nobodynamed.com/name/Patricia/">Patricia</a>.</p>',
  'published',
  'NobodyNamed',
  '/api/og/default',
  '2026-05-22T09:00:00.000Z',
  datetime('now')),
('the-kehlani-effect',
  'The Kehlani Effect',
  'Most pop-culture names show up loud and disappear before kindergarten. Kehlani is in a different category. The name went from barely visible in SSA records t...',
  '<p>Most pop-culture names show up loud and disappear before kindergarten. <a href="https://nobodynamed.com/name/Kehlani/">Kehlani</a> is in a different category. The name went from barely visible in SSA records to a recognizable signal in only a few years, and ten years after the climb started, it''s still going up.</p>
<h3>The full trajectory through 2025</h3>
<p>Birth counts in the SSA dataset. Kehlani rose late and fast in the mid-2010s, then kept rising. <a href="https://nobodynamed.com/name/Khaleesi/">Khaleesi</a> rose with its fandom, peaked in 2018, and has slowly declined since. <a href="https://nobodynamed.com/name/Nevaeh/">Nevaeh</a> peaked in 2010 and has been falling for over a decade.</p>
<p>2010 2015 2020 2025 / 7k 3.5k 0 / Kehlani, Leilani, Nevaeh, Khaleesi</p>
<p>Kehlani went from 48 births in 2015 to 596 in 2017 to 1,863 in 2025. That''s roughly 39x growth over a decade with no crash phase. Most celebrity-named babies see a sharp spike followed by an equally sharp drop. Kehlani didn''t.</p>
<p>The pattern under that growth: parents don''t copy a famous person directly. They pick up a sound and a spelling style that already fits where naming is headed. Kehlani worked because it landed in territory parents were already willing to use. <a href="https://nobodynamed.com/name/Leilani/">Leilani</a>, <a href="https://nobodynamed.com/name/Kailani/">Kailani</a>, <a href="https://nobodynamed.com/name/Aaliyah/">Aaliyah</a>, and other vowel-rich names with soft endings had been trending for a decade before Kehlani entered the chart.</p>
<h3>The sound family Kehlani arrived into</h3>
<p>Vowel-heavy names with soft endings that Kehlani sits next to in the SSA data. Most were already well-established before Kehlani''s spike, which is part of why the name survived where pure novelty names crash.</p>
<p><a href="https://nobodynamed.com/name/Aaliyah/">Aaliyah</a>, <a href="https://nobodynamed.com/name/Leilani/">Leilani</a>, <a href="https://nobodynamed.com/name/Kailani/">Kailani</a>, <a href="https://nobodynamed.com/name/Kalani/">Kalani</a>, <a href="https://nobodynamed.com/name/Kehlani/">Kehlani</a></p>
<p>Celebrity-name stories usually mislead. The famous person lights the match, but the name still has to survive ordinary parent taste once the coverage stops. Khaleesi got the biggest signal of any name in this group but carries a fictional title that some parents won''t commit to. It peaked at 563 births in 2018 and has settled at 444 by 2025, still a real name but past its high. Nevaeh started as "heaven" spelled backwards in the early 2000s and got far enough out of that origin to read as a normal name. It peaked at 6,420 in 2010 and has been declining since.</p>
<p>Kehlani''s growth came from being recognizable as a chosen name without being a fandom flag. That''s the middle position the other two miss.</p>
<h3>Three outcomes, one cycle</h3>
<p>Same era, three different outcomes for similar-sized cultural signals.</p>
<p><strong>Kehlani.</strong> 48 births in 2015 to 1,863 in 2025. Still climbing.</p>
<p><strong>Khaleesi.</strong> 2018 peak at 563. 444 in 2025. Slowly declining.</p>
<p><strong>Nevaeh.</strong> 2010 peak at 6,420. Declining for over a decade.</p>
<p>Explore the companion chart at <a href="https://nobodynamed.com/viz/kehlani-effect.html">The Kehlani Effect visualization</a>, or compare the individual name pages for <a href="https://nobodynamed.com/name/Kehlani/">Kehlani</a>, <a href="https://nobodynamed.com/name/Khaleesi/">Khaleesi</a>, <a href="https://nobodynamed.com/name/Nevaeh/">Nevaeh</a>, and <a href="https://nobodynamed.com/name/Leilani/">Leilani</a>.</p>',
  'published',
  'NobodyNamed',
  '/api/og/default',
  '2026-05-19T09:00:00.000Z',
  datetime('now')),
('what-your-birth-year-name-says',
  'What Your Birth Year Name Says About You',
  'Your birth year has a sound. Class rosters carried it before you knew it was there. Mary and John in 1900. Linda and James in 1950. Jennifer and Michael in 1...',
  '<p>Your birth year has a sound. Class rosters carried it before you knew it was there. <a href="https://nobodynamed.com/name/Mary/">Mary</a> and <a href="https://nobodynamed.com/name/John/">John</a> in 1900. <a href="https://nobodynamed.com/name/Linda/">Linda</a> and <a href="https://nobodynamed.com/name/James/">James</a> in 1950. <a href="https://nobodynamed.com/name/Jennifer/">Jennifer</a> and <a href="https://nobodynamed.com/name/Michael/">Michael</a> in 1975. <a href="https://nobodynamed.com/name/Olivia/">Olivia</a> and <a href="https://nobodynamed.com/name/Liam/">Liam</a> in 2025. A top name from your birth year is a cultural timestamp you didn''t pick.</p>
<h3>The sound of six American birth years</h3>
<p>The most common girl and boy name in each year, from the SSA national dataset.</p>
<table><thead><tr><th>Year</th><th>Top girl</th><th>Top boy</th></tr></thead><tbody><tr><td>1900</td><td><a href="https://nobodynamed.com/name/Mary/">Mary</a></td><td><a href="https://nobodynamed.com/name/John/">John</a></td></tr><tr><td>1925</td><td><a href="https://nobodynamed.com/name/Mary/">Mary</a></td><td><a href="https://nobodynamed.com/name/Robert/">Robert</a></td></tr><tr><td>1950</td><td><a href="https://nobodynamed.com/name/Linda/">Linda</a></td><td><a href="https://nobodynamed.com/name/James/">James</a></td></tr><tr><td>1975</td><td><a href="https://nobodynamed.com/name/Jennifer/">Jennifer</a></td><td><a href="https://nobodynamed.com/name/Michael/">Michael</a></td></tr><tr><td>2000</td><td><a href="https://nobodynamed.com/name/Emily/">Emily</a></td><td><a href="https://nobodynamed.com/name/Jacob/">Jacob</a></td></tr><tr><td>2025</td><td><a href="https://nobodynamed.com/name/Olivia/">Olivia</a></td><td><a href="https://nobodynamed.com/name/Liam/">Liam</a></td></tr></tbody></table>
<p>Look at 1950 and 1975. Linda and Jennifer are so over-indexed to their decades that they read as cohort markers, not as names. Michael held the top boy spot for 38 consecutive years from 1961 to 1998, which is why it feels less pinned to any single decade than Jennifer does to the late 70s. Mary and John ruled the early SSA records by such a wide margin that they read less like trends and more like the baseline state of American naming.</p>
<p>The current era is unusual for a different reason. Liam has been the #1 boy name every year since 2017 (nine years and counting). Olivia has held the #1 girl spot since 2019. That''s the longest co-reign at #1 in modern SSA records. If you have a kid born anywhere from 2019 to 2025, the odds are good they share a class with another Liam and another Olivia.</p>
<p>The personal version: look up your own birth year, then compare your name to the top names around it. You''ll see whether your parents picked the wave, the year before it, or something the rest of the country wouldn''t catch onto for another decade.</p>
<p>Start with the <a href="https://nobodynamed.com/year">Birth year explorer</a>, then try a few era pages such as <a href="https://nobodynamed.com/era/1950/">1950</a>, <a href="https://nobodynamed.com/era/1975/">1975</a>, <a href="https://nobodynamed.com/era/2000/">2000</a>, and <a href="https://nobodynamed.com/era/2025/">2025</a>.</p>',
  'published',
  'NobodyNamed',
  '/api/og/default',
  '2026-05-19T09:00:00.000Z',
  datetime('now')),
('the-great-vintage-revival',
  'The Great Vintage Revival',
  'The name Theodore peaked in 1920 at 3,219 births. That number held as the all-time record for 105 years. Then the name declined, spent decades in the backgro...',
  '<p>The name <a href="https://nobodynamed.com/name/Theodore/">Theodore</a> peaked in 1920 at 3,219 births. That number held as the all-time record for 105 years. Then the name declined, spent decades in the background, and started climbing again around 2010.</p>
<p>In 2025, 13,355 babies were named Theodore. That''s a new all-time record, more than four times higher than the 1920 peak. The name didn''t recover. It broke through.</p>
<h3>Theodore, 1880 to 2025</h3>
<p>Annual births from the SSA national dataset. The 1920 annotation marks the previous all-time high. The 2025 point breaks it by 4x.</p>
<p>14k 7k 0 1880 1920 1980 2025 3,219 in 1920 (previous record) 13,355 in 2025</p>
<p>A classic comeback name needs generational distance. Names from a parent''s era still feel dated. Names from a grandparent''s or great-grandparent''s era can feel newly available, with enough remove that the prior generation''s associations have worn off. <a href="https://nobodynamed.com/name/Theodore/">Theodore</a>, <a href="https://nobodynamed.com/name/Leo/">Leo</a>, <a href="https://nobodynamed.com/name/Nora/">Nora</a>, and <a href="https://nobodynamed.com/name/Evelyn/">Evelyn</a> all sit in that window.</p>
<h3>Old peak vs. 2025: names breaking their own records</h3>
<p>Historic all-time peak count vs. 2025 births, from the SSA dataset.</p>
<p><strong><a href="https://nobodynamed.com/name/Theodore/">Theodore</a> 13,355.</strong> 4x the 1920 record of 3,219.</p>
<p><strong><a href="https://nobodynamed.com/name/Leo/">Leo</a> 8,173.</strong> 2x the 1919 record of 4,054.</p>
<p><strong><a href="https://nobodynamed.com/name/Nora/">Nora</a> 6,380.</strong> 4.3x the 1916 record of 1,477.</p>
<p><strong><a href="https://nobodynamed.com/name/Evelyn/">Evelyn</a> 11,985.</strong> 1.7x the 1920s peak around 7,200.</p>
<p><strong><a href="https://nobodynamed.com/name/Eleanor/">Eleanor</a> 7,649.</strong> Closing in on the 1930 record of 8,497.</p>
<p><strong><a href="https://nobodynamed.com/name/Hazel/">Hazel</a> 5,836.</strong> Approaching the 1921 record of 7,615.</p>
<p>Eleanor and Hazel haven''t quite cleared their old records, but they''re climbing. Theodore, Leo, and Nora already have. These aren''t names with a nostalgic following anymore. They''re at the top of the list.</p>
<p>Browse more at <a href="https://nobodynamed.com/comeback">Comeback names</a>, or check the full arcs of <a href="https://nobodynamed.com/name/Theodore/">Theodore</a>, <a href="https://nobodynamed.com/name/Leo/">Leo</a>, <a href="https://nobodynamed.com/name/Nora/">Nora</a>, and <a href="https://nobodynamed.com/name/Evelyn/">Evelyn</a>.</p>',
  'published',
  'NobodyNamed',
  '/api/og/default',
  '2026-05-22T09:00:00.000Z',
  datetime('now')),
('baby-names-that-vanished',
  'Baby Names That Vanished From America',
  'The most surprising data in the SSA archive isn''t the unusual names. It''s how fast a normal name can disappear. Names that peaked with tens of thousands of b...',
  '<p>The most surprising data in the SSA archive isn''t the unusual names. It''s how fast a normal name can disappear. Names that peaked with tens of thousands of births in a single year now show up in the low double digits, sometimes single digits. Most of these weren''t strange names. They were the names of the neighbor across the street.</p>
<h3>From thousands of babies to almost nobody</h3>
<p>Selected endangered names from the SSA dataset. The numbers show the peak year count and the most recent year count.</p>
<p><a href="https://nobodynamed.com/name/Debbie/">Debbie</a> 19,537 to 24</p>
<p><a href="https://nobodynamed.com/name/Todd/">Todd</a> 15,354 to 160</p>
<p><a href="https://nobodynamed.com/name/Rhonda/">Rhonda</a> 10,950 to 19</p>
<p><a href="https://nobodynamed.com/name/Craig/">Craig</a> 10,718 to 207</p>
<p><a href="https://nobodynamed.com/name/Peggy/">Peggy</a> 10,070 to 23</p>
<p><a href="https://nobodynamed.com/name/Carole/">Carole</a> 8,409 to 8</p>
<p>None of these names disappeared because they sounded weird. They disappeared because they got too successful at marking one adult generation. <a href="https://nobodynamed.com/name/Debbie/">Debbie</a> sounds mid-century because it was a mid-century name. <a href="https://nobodynamed.com/name/Todd/">Todd</a>, <a href="https://nobodynamed.com/name/Craig/">Craig</a>, <a href="https://nobodynamed.com/name/Peggy/">Peggy</a>, <a href="https://nobodynamed.com/name/Rhonda/">Rhonda</a>, and <a href="https://nobodynamed.com/name/Carole/">Carole</a> carry a generational timestamp parents can hear instantly. None of them want to give their kid a name that sounds 60 years old before the kid is.</p>
<p>The cycle that produces this is consistent. A name becomes common enough to feel safe, then so common it becomes saturated, then closely tied to one age group, then closely tied to retirees, then sometimes available again three generations later. Most names complete the cycle. Some don''t make it back.</p>
<p>Browse more at <a href="https://nobodynamed.com/endangered">Endangered names</a>, <a href="https://nobodynamed.com/extinct">Extinct names</a>, or inspect the paths for <a href="https://nobodynamed.com/name/Debbie/">Debbie</a>, <a href="https://nobodynamed.com/name/Todd/">Todd</a>, <a href="https://nobodynamed.com/name/Rhonda/">Rhonda</a>, and <a href="https://nobodynamed.com/name/Carole/">Carole</a>.</p>',
  'published',
  'NobodyNamed',
  '/api/og/default',
  '2026-05-19T09:00:00.000Z',
  datetime('now'))
ON CONFLICT(slug) DO UPDATE SET
  title=excluded.title,
  description=excluded.description,
  body_html=excluded.body_html,
  status=excluded.status,
  author=excluded.author,
  og_image=excluded.og_image,
  published_at=excluded.published_at,
  updated_at=datetime('now');
