# nobodynamed

Is your name going extinct? nobodynamed shows the popularity, trajectory, and vital status of any American name since 1880, based on [Social Security Administration](https://www.ssa.gov/oact/babynames/) data.

## Stack

| Layer | Service |
|---|---|
| Frontend + API | Cloudflare Pages + Pages Functions |
| Database | Cloudflare D1 (SQLite) |
| Annual data refresh | Cloudflare Worker (Cron Trigger + Queues) |
| Archive storage | Cloudflare R2 |

## Repository layout

```
apps/
  web/             Cloudflare Pages: static HTML/CSS/JS + Functions
    public/        Served as static assets
    functions/     Pages Functions (API routes + SSR /name/:name)
  ingest-worker/   Cron-triggered Worker: SSA download → D1

packages/
  shared/          Types, classification logic, HTML renderer — shared by all packages

migrations/        D1 SQL migrations (applied via wrangler d1 migrations apply)

scripts/
  seed-from-shards.ts   One-shot initial D1 seeding from legacy JSON shards
  verify-parity.ts      Pre-cutover parity checks vs legacy data

viz/               Legacy static site (GitHub Pages) — kept until DNS cutover
```

## First-time setup

### 1. Provision Cloudflare resources

```bash
# D1 database
wrangler d1 create name-vitals
# Copy the database_id into both wrangler.toml files:
#   apps/web/wrangler.toml
#   apps/ingest-worker/wrangler.toml

# Queue (fan-out ingest)
wrangler queues create name-ingest
wrangler queues create name-ingest-dlq

# R2 bucket (SSA zip cache)
wrangler r2 bucket create name-vitals-ingest
```

### 2. Apply schema

```bash
wrangler d1 migrations apply name-vitals --remote
```

### 3. Seed initial data

Reads the existing `viz/name-vitals/data/` JSON shards to populate D1 without pulling from the SSA:

```bash
npm run seed
# Apply each generated SQL file:
ls migrations/seed/*.sql | sort | xargs -I{} wrangler d1 execute name-vitals --file={} --remote
```

### 4. Deploy

```bash
npm run deploy:web       # deploy Cloudflare Pages
npm run deploy:ingest    # deploy the cron Worker
```

### 5. Verify parity

```bash
tsx scripts/verify-parity.ts --base=https://<preview>.pages.dev
```

## Local development

```bash
# Pages + Functions with local D1
npm run dev:web

# Trigger the ingest cron locally
npm run dev:ingest          # starts wrangler dev
# then: curl http://localhost:8787/run
```

## Data refresh

The ingest Worker runs weekly (ETag-gated; exits immediately if the SSA zip is unchanged). The SSA publishes new data once a year, typically in May. Manual trigger:

```bash
wrangler dev --test-scheduled   # local
# or POST to the /run endpoint of the deployed Worker
```

## GitHub Actions secrets

Required for the CI/CD workflows in `.github/workflows/`:

| Secret | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Token with Workers, Pages, and D1 write permissions |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |

## DNS cutover from GitHub Pages

After verifying parity on the Pages preview URL:

1. Add a custom domain to the Pages project in the Cloudflare dashboard.
2. Flip the DNS CNAME from the GitHub Pages address to the Cloudflare Pages CNAME.
3. Add 301 redirects in the old GitHub Pages `index.html` from `/babynames/viz/name-vitals/*` to the new host.
4. After ≥1 week of monitoring, delete `viz/`, `dicts/`, `extra/`, and any remaining legacy files.

## License

Source data is CC0 (Social Security Administration). Code is MIT.

##Setup

This is a Node.js script, so you should consider [downloading Node](http://nodejs.org/) before attempting to run it.

To download the repo, simply clone it:

	git clone https://github.com/TimeMagazine/babynames.git
	cd babynames

Then install the dependencies:

	npm install

##Data 

First, you need to get the raw data from the [Social Security Administration](http://www.ssa.gov/OACT/babynames/). This script will download and unzip it for you with the following command:

	./index.js download 

###Total babies born each year

There is also a file called `extra/totals.json` with data on the total number of babies born (or at least, those issued a SSN) each year, [per the SSA](http://www.ssa.gov/oact/babynames/numberUSbirths.html). This is useful because the totals are higher than the sum of each name in the name files, which don't include names that occur fewer than five times.

If you want to re-download the data--maybe it's a new year or you suspect there has been a revision--just run `./scripts/total_births.js`, which will scrape the page on the SSA website and overwrite the file in the repo.

###Baby names

The Social Security Administration organizes the baby name data, somewhat inconveniently, as year-by-year text files named `yob[year].txt`. The above command extracts those files to a local directory named `data/` and then deletes the zip file it downloaded. If you want to keep that zip file for some reason, just pass `--cache` to the command.

Once that's done, you can aggregate the data to a per-name basis and store it in a variety of formats:

	./index.js store --format=json

First, the script reads every file and stores the data on a per-name basis in memory. For each name, it records both the absolute number of babies with that name in a given year and the percentage of all babies of the same gender with that name. The denominator in that calculation is the gender-specific total number of babies [as reported on SSA.gov](http://www.ssa.gov/oact/babynames/numberUSbirths.html), NOT the calculated sum of all baby name frequencies (which will be lower than the actual number of children born in the United States, given that the data only counts names that appear at least five times). The years are stored as keys in an object for fast retrieval:

	{
	  "_id": "Lothar-M",
	  "name": "Lothar",
	  "gender": "M",
	  "values": {
	    "1927": 7,
	    "1928": 6,
	    "1929": 10,
	    "1931": 6,
	    "1932": 8,
	    "1935": 8,
	    "1956": 7,
	    "1959": 5,
	    "1964": 6,
	    "1968": 5
	  },
	  "percents": {
	    "1927": 0.0000062135232896167586,
	    "1928": 0.000005418551494752584,
	    "1929": 0.000009301278646775573,
	    "1931": 0.000005775539435383265,
	    "1932": 0.000007664935030094451,
	    "1935": 0.00000768623999707923,
	    "1956": 0.0000033120134297413128,
	    "1959": 0.0000023436460007087187,
	    "1964": 0.000003010349581862443,
	    "1968": 0.0000028754074452349896
	  }
	}

###Formats

Your choices are:

+ `json`: Each name is stored as an individual JSON file in the `/flat/individual/` directory.
+ `jsonp`: Each name is stored as an individual JSON-P file in the `/flat/individual/` directory. It is wrapped in a callback function named `ticallback` by default, which you can override with `opts.callback`.
+ `csvs`: Each name is stored as an individual CSV file in the `/flat/individual/` directory.
+ `csv`: All names are packaged into one CSV file and stored in `/flat/names.csv/`. This file will be able 30MB if you don't include limiting specifications (below). This preprocessed file is included in this repo.
+ `mongodb`: All names are inserted into a MongoDB instance. You are responsible for running a Mongo server at `localhost:27017` or updating the source to point to your  instance. *Note:* Because this is optional, the [mongodb](https://www.npmjs.org/package/mongodb) Node module is not listed as a dependency, you you'll need to install it yourself.

##Reducing the size
As of 2013, there are 102,691 names that show up in at least one year at least five times. Many users will not be interested in this volume of data. There are several ways to reduce the scope with command line options.

###Limit the years

+ `start`: Don't retrieve years before this year. Ex: `--start=1950`. Default is `1880`, the first year of the data.
+ `end`: Don't retrieve years after this year. Ex: `--end=2000`. Default is the present year.

###Exclude uncommon names 
+ `min`: Don't include names that don't show up at least this many time in at least one year. Ex: `--min=25`. Default is `0`.
+ `cutoff`: Don't include names that don't show up in at least this many individual years. Ex: `--cutoff=50`. Default is `0`.

##Analysis

The script comes with several options for basic analysis:

+ `normalize`: Add a third property to each name that is the normalized value for the percentage figures, such that the peak percentage year is 1.
+ `peaks`: Find the peak value and year for both raw values and percents
+ `maxima`: Identify all the local maxima -- points where every value 5 years before and after is lower. Only counts maxima that are at least 25 percent of peak value.
+ `pronunications`: See if the name is listed in the [CMU Pronouncing Dictionary](http://www.speech.cs.cmu.edu/cgi-bin/cmudict). Require that you `npm install cmudict` manually.
+ `dense`: If a name does not appear in a year in the range specified between `start` and `end`, list that year in the data as `0`. Otherwise it is not included at all (a "sparse" format).

##Types

For csv outputs, you can get the data back as either raw numbers of new babies each year with a given name (`--type=values`, which is the default) or as a percent (`--type=values`). JSON formats return both percents and values. 

##Phonemes
You can also pass a special type, `--type=phonemes`, to get back a JSON document of phoneme percents for each year for all names. By default, the script examines the first phoneme in each name. You can use `--N==TK` to aggregate around the TKth phonemes in the name. Use a negative value to start from the end.

##Extras
We've now got British baby names going back to 1996, accessed on Oct. 5, 2016 from the U.K. [Office for National Statistics](http://www.ons.gov.uk/peoplepopulationandcommunity/birthsdeathsandmarriages/livebirths/adhocs/006073babynames1996to2015). The total number of live births was downloaded [here](http://www.ons.gov.uk/peoplepopulationandcommunity/birthsdeathsandmarriages/livebirths/datasets/birthsummarytables) from the same source.

##License

This script is provided free and open-source by Time under the MIT license. If you use it, you are politely encouraged to acknowledge Time and link to this page.

The dictionary file [dict/2of12.txt](dict/2of12.txt) is from the [12 Dicts project](http://wordlist.aspell.net/12dicts-readme/), which is in the public domain.
