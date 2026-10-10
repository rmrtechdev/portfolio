-- One row per ~1° grid cell (~110 km) that has had a visitor. Presence only, no counts: the globe
-- shows where people came from, not how many. Coarse on purpose: it bounds table size and never
-- pins a visitor closer than a metro area.
CREATE TABLE IF NOT EXISTS cells (
  id TEXT PRIMARY KEY,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  place TEXT,
  -- 1 while every visit from this cell came through a VPN or datacentre exit.
  vpn INTEGER NOT NULL DEFAULT 0,
  last_seen INTEGER NOT NULL
);
