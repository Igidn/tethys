PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS agents (
  id             TEXT PRIMARY KEY,
  secret_hash    TEXT NOT NULL,
  computer_id    INTEGER,
  label          TEXT,
  role           TEXT NOT NULL DEFAULT 'unassigned',
  status         TEXT NOT NULL DEFAULT 'pending',
  pairing_code   TEXT UNIQUE,
  channel        TEXT NOT NULL DEFAULT 'stable',
  runtime        TEXT,
  state          TEXT,
  pose_json      TEXT,
  fuel           INTEGER,
  inventory_json TEXT,
  config_json    TEXT,
  created_at     INTEGER NOT NULL,
  approved_at    INTEGER,
  last_seen      INTEGER
);

CREATE INDEX IF NOT EXISTS agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS agents_last_seen ON agents(last_seen);

CREATE TABLE IF NOT EXISTS jobs (
  id            TEXT PRIMARY KEY,
  agent_id      TEXT NOT NULL REFERENCES agents(id),
  kind          TEXT NOT NULL,
  spec_json     TEXT NOT NULL,
  state         TEXT NOT NULL,
  progress_json TEXT,
  stats_json    TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS jobs_agent ON jobs(agent_id, state);

CREATE TABLE IF NOT EXISTS commands (
  id           TEXT PRIMARY KEY,
  agent_id     TEXT NOT NULL REFERENCES agents(id),
  op           TEXT NOT NULL,
  payload_json TEXT,
  state        TEXT NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  sent_at      INTEGER,
  acked_at     INTEGER,
  result_json  TEXT
);

CREATE INDEX IF NOT EXISTS commands_pending ON commands(agent_id, state, created_at);

CREATE TABLE IF NOT EXISTS events (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ts        INTEGER NOT NULL,
  agent_id  TEXT,
  kind      TEXT NOT NULL,
  data_json TEXT
);

CREATE INDEX IF NOT EXISTS events_ts ON events(ts);

CREATE TABLE IF NOT EXISTS releases (
  version       TEXT PRIMARY KEY,
  tag           TEXT NOT NULL,
  manifest_json TEXT NOT NULL,
  channel       TEXT NOT NULL DEFAULT 'stable',
  published_at  INTEGER
);

CREATE TABLE IF NOT EXISTS playlists (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  manifest_json TEXT NOT NULL,
  published_at  INTEGER
);
