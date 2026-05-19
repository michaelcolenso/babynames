INSERT INTO meta(key,value) VALUES('min_year','1880') ON CONFLICT(key) DO UPDATE SET value=excluded.value;
INSERT INTO meta(key,value) VALUES('max_year','2025') ON CONFLICT(key) DO UPDATE SET value=excluded.value;
INSERT INTO meta(key,value) VALUES('total_names','117820') ON CONFLICT(key) DO UPDATE SET value=excluded.value;
INSERT INTO meta(key,value) VALUES('total_rows','2181032') ON CONFLICT(key) DO UPDATE SET value=excluded.value;
INSERT INTO meta(key,value) VALUES('schema_version','1') ON CONFLICT(key) DO UPDATE SET value=excluded.value;
INSERT INTO meta(key,value) VALUES('data_version','ff571693-52f3-47bb-bc79-4899c2f57226') ON CONFLICT(key) DO UPDATE SET value=excluded.value;
INSERT INTO meta(key,value) VALUES('last_ingest_at','2026-05-19T15:27:45.550Z') ON CONFLICT(key) DO UPDATE SET value=excluded.value;
