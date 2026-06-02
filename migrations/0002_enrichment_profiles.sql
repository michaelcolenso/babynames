CREATE TABLE IF NOT EXISTS name_enrichment_profiles (
  name_lower TEXT NOT NULL,
  sex TEXT NOT NULL CHECK (sex IN ('M','F')),
  total_living_est INTEGER NOT NULL,
  median_age INTEGER NOT NULL,
  age_range_low INTEGER NOT NULL,
  age_range_high INTEGER NOT NULL,
  wave_topology TEXT NOT NULL CHECK(wave_topology IN (
    'Flash Flood',
    'Glacier',
    'Steady Decline',
    'Steady Wave',
    'Plateau'
  )),
  latest_pct REAL NOT NULL,
  analysis_year INTEGER NOT NULL,
  source_version TEXT,
  PRIMARY KEY (name_lower, sex)
);

CREATE INDEX IF NOT EXISTS idx_name_enrichment_profiles_lookup
ON name_enrichment_profiles(name_lower, sex);

CREATE TABLE IF NOT EXISTS name_catalysts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name_lower TEXT NOT NULL,
  sex TEXT NOT NULL CHECK (sex IN ('M','F')),
  trigger_year INTEGER NOT NULL,
  catalyst_title TEXT NOT NULL,
  catalyst_type TEXT CHECK(catalyst_type IN (
    'movie',
    'tv',
    'music',
    'historical_event',
    'sports',
    'literature',
    'celebrity',
    'religion',
    'politics',
    'internet'
  )),
  impact_score TEXT,
  description TEXT,
  source_url TEXT
);

CREATE INDEX IF NOT EXISTS idx_name_catalysts_lookup
ON name_catalysts(name_lower, sex, trigger_year);

CREATE TABLE IF NOT EXISTS name_historical_profiles (
  name_lower TEXT NOT NULL,
  sex TEXT NOT NULL CHECK (sex IN ('M','F')),
  era_year INTEGER NOT NULL,
  top_occupations TEXT NOT NULL,
  primary_region TEXT NOT NULL,
  urban_vs_rural TEXT NOT NULL,
  PRIMARY KEY (name_lower, sex, era_year)
);

CREATE INDEX IF NOT EXISTS idx_name_historical_profiles_lookup
ON name_historical_profiles(name_lower, sex, era_year);

CREATE TABLE IF NOT EXISTS name_regional_anomalies (
  name_lower TEXT NOT NULL,
  sex TEXT NOT NULL CHECK (sex IN ('M','F')),
  state CHAR(2) NOT NULL,
  era_start_year INTEGER NOT NULL,
  location_quotient REAL NOT NULL,
  name_births INTEGER NOT NULL,
  historical_peak_year INTEGER,
  anomaly_type TEXT NOT NULL,
  PRIMARY KEY (name_lower, sex, state, era_start_year)
);

CREATE INDEX IF NOT EXISTS idx_name_regional_anomalies_lookup
ON name_regional_anomalies(name_lower, sex, location_quotient DESC);
