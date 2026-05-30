-- Raw SSA state-level name counts (namesbystate.zip). One row per
-- (name, sex, year, state). Read only by the diaspora compute step; never
-- queried by /api/*. Uses `sex` ('M'/'F') to match the rest of the schema.
CREATE TABLE IF NOT EXISTS name_states (
  name  TEXT NOT NULL,
  sex   TEXT NOT NULL CHECK (sex IN ('M','F')),
  year  INTEGER NOT NULL,
  state TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (name, sex, year, state)
);

-- Lets the compute pass page distinct (name, sex) pairs in name order.
CREATE INDEX IF NOT EXISTS idx_name_states_lookup ON name_states(name, sex);
CREATE INDEX IF NOT EXISTS idx_name_states_state_year ON name_states(state, year);
