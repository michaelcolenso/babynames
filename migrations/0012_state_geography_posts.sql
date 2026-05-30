-- State-geography blog posts from the May 2026 editorial set, backed by the
-- name_states / name_regional_anomalies / name_diaspora tables (SSA state data,
-- 1910-2025). Figures computed against live D1:
--   * signature names  = top location quotient per state (>=150 births,
--     SSA placeholder tokens removed)
--   * diffusion lead/lag = per-capita adoption vs. national median, 12-name basket
-- Two posts: the signature-name map, and the corrected "trends don't start on
-- the coasts" diffusion piece.

PRAGMA foreign_keys = ON;

INSERT INTO blog_posts(slug, title, description, body_html, status, author, og_image, published_at, updated_at)
VALUES
('your-states-signature-name',
  'Every State Has a Name Only It Would Use',
  'Normalize each state''s naming against the country and a hidden map appears: Cajun French in Louisiana, Somali in Minnesota, stadium names in Iowa and Tennessee, and a naming culture all its own in Utah.',
  '<p>Take any baby name and ask not how many babies got it, but where they were born. Most names are spread roughly evenly across the country. A few are wildly concentrated in one state, far past what its population would predict. Those are a state''s signature names, and when you line up all 50 of them, you get a map of America that nobody set out to draw.</p>
<p>The measure here is simple. For each state we take a name''s share of births in that state and divide it by its share of births nationally. A score of 1 means the name is exactly as common there as everywhere else. A score of 20 means it is twenty times more concentrated in that state than in the country at large. Every name below is the highest-scoring name in its state, drawn from SSA records going back to 1910, with a floor on total births so the list isn''t just statistical noise from a single year.</p>
<h2>The immigrant map</h2>
<p>The strongest signatures trace migration. <a href="https://nobodynamed.com/name/Angelle/">Angelle</a> is fifty times more concentrated in Louisiana than nationally, a Cajun French feminine name that essentially does not exist outside the state. <a href="https://nobodynamed.com/name/Eloy/">Eloy</a> in New Mexico and <a href="https://nobodynamed.com/name/Jesusa/">Jesusa</a> in Texas mark the Hispanic Catholic Southwest. <a href="https://nobodynamed.com/name/Abdirahman/">Abdirahman</a> is Minnesota''s most distinctive name, almost entirely because of the Somali community concentrated around the Twin Cities. <a href="https://nobodynamed.com/name/Benuel/">Benuel</a>, Pennsylvania''s signature, is an Amish name. In Hawaii the top of the list is a mix of Japanese-immigrant names like Shizue and Hawaiian names like <a href="https://nobodynamed.com/name/Kainoa/">Kainoa</a> and <a href="https://nobodynamed.com/name/Keanu/">Keanu</a>, often three hundred times more concentrated there than on the mainland.</p>
<h2>The faith map</h2>
<p>Two states are dominated by religious naming traditions. New Jersey and New York both surface Orthodox Jewish names at the top of their lists, <a href="https://nobodynamed.com/name/Avrohom/">Avrohom</a> and Yides, concentrated in specific communities in and around New York City. And then there is Utah, which is less a state with a few distinctive names than a naming culture of its own. <a href="https://nobodynamed.com/name/Dallin/">Dallin</a>, <a href="https://nobodynamed.com/name/Ammon/">Ammon</a>, <a href="https://nobodynamed.com/name/Brigham/">Brigham</a>, <a href="https://nobodynamed.com/name/Brynlee/">Brynlee</a>, and <a href="https://nobodynamed.com/name/Stockton/">Stockton</a> all cluster there, drawn from LDS history and a local taste for inventive spellings. No other state generates this many of its own names.</p>
<h2>The stadium map</h2>
<p>The finding we did not expect: two states name their sons after football stadiums. In Iowa, the most distinctive name is <a href="https://nobodynamed.com/name/Kinnick/">Kinnick</a> — Kinnick Stadium, home of the Hawkeyes, named for Nile Kinnick, the 1939 Heisman winner who died in WWII. In Tennessee, it is <a href="https://nobodynamed.com/name/Neyland/">Neyland</a> — Neyland Stadium, where the Volunteers play. Both names are recent, both are overwhelmingly local, and both exist because a state''s devotion to its college football team is strong enough to show up on birth certificates. Alabama''s signature, <a href="https://nobodynamed.com/name/Crimson/">Crimson</a>, belongs to the same impulse.</p>
<h2>The leftover century</h2>
<p>For states without a strong immigrant, faith, or sports signature, the top name is usually a mid-century relic — a name that was briefly fashionable in that state decades ago and nowhere else since. <a href="https://nobodynamed.com/name/Marlys/">Marlys</a> in North Dakota, <a href="https://nobodynamed.com/name/Drema/">Drema</a> in West Virginia, <a href="https://nobodynamed.com/name/Twila/">Twila</a> in Kansas. These are quieter signatures, but they are signatures all the same: a name the rest of the country forgot, still carried by one state''s grandparents.</p>
<p>A caveat worth stating plainly. The SSA suppresses any name with fewer than five births in a state in a given year, which hits the smallest states hardest. Wyoming, Vermont, Alaska, and Delaware have thinner records and weaker, older signatures as a result. The map is real, but it is sharper in the places with more people in it.</p>
<p>Browse the names: <a href="https://nobodynamed.com/name/Angelle">Angelle</a> · <a href="https://nobodynamed.com/name/Kinnick">Kinnick</a> · <a href="https://nobodynamed.com/name/Neyland">Neyland</a> · <a href="https://nobodynamed.com/name/Dallin">Dallin</a> · <a href="https://nobodynamed.com/name/Abdirahman">Abdirahman</a> · <a href="https://nobodynamed.com/name/Benuel">Benuel</a></p>',
  'published',
  'NobodyNamed',
  '/api/og/default',
  '2026-05-30T09:00:00.000Z',
  datetime('now')),
('baby-name-trends-dont-start-on-the-coasts',
  'Baby Name Trends Don''t Start on the Coasts',
  'The intuition is that names start in New York and Los Angeles and spread inward. The state data says the opposite: trends ignite in Wyoming, Utah, and the Dakotas, and the big coastal states are the last to arrive.',
  '<p>There is a tidy story about how baby names spread. They start in the big coastal cities, where culture is made, and roll inward to the rest of the country a few years behind. It is a clean story. The data says it is backwards.</p>
<p>We tracked a basket of twelve names that broke out nationally over the last forty years — <a href="https://nobodynamed.com/name/Aiden/">Aiden</a>, <a href="https://nobodynamed.com/name/Madison/">Madison</a>, <a href="https://nobodynamed.com/name/Jayden/">Jayden</a>, <a href="https://nobodynamed.com/name/Harper/">Harper</a>, <a href="https://nobodynamed.com/name/Liam/">Liam</a>, <a href="https://nobodynamed.com/name/Aria/">Aria</a>, and more — and asked, for each one, what year each state crossed the same per-capita adoption line. The key word is per capita. If you rank states by raw count, California and Texas and New York always look like they got there first, but only because they have the most babies. Measure a name as a share of each state''s own births and the order flips.</p>
<h2>The early adopters</h2>
<p>Averaged across the basket, these states crossed the line years ahead of the national midpoint:</p>
<p><strong>Alaska, 2.7 years early. North Dakota, 2.6 years early.</strong> The two earliest movers.</p>
<p><strong>Utah, 2.1 years early. Montana, 2.0. Wyoming, 1.8.</strong></p>
<p><strong>Hawaii, 1.8 years early.</strong></p>
<p>The leaders are small, interior, and demographically homogeneous. Not a coastal media capital among them.</p>
<h2>The laggards</h2>
<p>And the states that consistently arrived last:</p>
<p><strong>California, 2.0 years late. New York, 1.7 years late.</strong></p>
<p><strong>Florida, New Jersey, and Georgia all more than a year behind the national midpoint.</strong></p>
<p>The biggest, most diverse states — the ones the tidy story says invent the trends — are reliably the last to adopt them at scale.</p>
<h2>Why the small states win</h2>
<p>The mechanism is fragmentation. A name spreads fast when a population moves together. In a small, homogeneous state, when a name catches on it catches on across the whole state at once, and its share of births jumps quickly past any threshold. In California, parents are choosing from a far wider menu drawn from far more cultures, so no single name sweeps the same way. The same name might be just as present in absolute numbers, but it is diluted across hundreds of competing choices, and it crosses the per-capita line years later.</p>
<p>So the trendsetter is not the cultural capital. It is the small state where everyone is, in effect, reading from the same short list.</p>
<h2>A note on what we corrected</h2>
<p>An earlier version of our own diffusion data made exactly the mistake this piece warns against. It ranked a name''s origin by raw count, which meant California, Texas, and New York were credited as the origin of nearly every name — not because anything started there, but because they are large. We rebuilt the measure on a per-capita basis, and the map it produces is the one above. It is a useful reminder that with geographic data, the first question is always: compared to how many people?</p>
<p>Explore the names: <a href="https://nobodynamed.com/name/Aiden">Aiden</a> · <a href="https://nobodynamed.com/name/Madison">Madison</a> · <a href="https://nobodynamed.com/name/Harper">Harper</a> · <a href="https://nobodynamed.com/name/Liam">Liam</a> · <a href="https://nobodynamed.com/name/Aria">Aria</a></p>',
  'published',
  'NobodyNamed',
  '/api/og/default',
  '2026-05-30T09:30:00.000Z',
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
