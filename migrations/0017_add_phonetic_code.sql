-- Migration: Add phonetic_code and first_year indices for sounds-like and debut almanac search.

PRAGMA foreign_keys = ON;

-- 1. Alter tables to add phonetic_code column
ALTER TABLE names ADD COLUMN phonetic_code TEXT;
ALTER TABLE names_staging ADD COLUMN phonetic_code TEXT;

-- 2. Create index on phonetic_code to optimize sounds-like queries
CREATE INDEX IF NOT EXISTS names_phonetic_count ON names(phonetic_code, total_count DESC);

-- 3. Create index on first_year to optimize debut almanac queries
CREATE INDEX IF NOT EXISTS names_first_year_sex ON names(first_year, sex, total_count DESC);
