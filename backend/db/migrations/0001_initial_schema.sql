-- wallets
CREATE TABLE IF NOT EXISTS wallets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  address TEXT UNIQUE NOT NULL,
  label TEXT,
  is_active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wallets_address ON wallets(address);

-- fills (raw)
CREATE TABLE IF NOT EXISTS fills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL,
  pair TEXT NOT NULL,
  direction TEXT CHECK(direction IN ('LONG','SHORT')) NOT NULL,
  px REAL NOT NULL,
  sz REAL NOT NULL,
  leverage INTEGER,
  fee REAL,
  fill_timestamp INTEGER NOT NULL,
  source TEXT,
  raw TEXT
);
CREATE INDEX IF NOT EXISTS idx_fills_wallet_ts ON fills(wallet_address, fill_timestamp);
CREATE INDEX IF NOT EXISTS idx_fills_pair_ts ON fills(pair, fill_timestamp);

-- wallet_positions (per open event)
CREATE TABLE IF NOT EXISTS wallet_positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL,
  pair TEXT NOT NULL,
  direction TEXT CHECK(direction IN ('LONG','SHORT')) NOT NULL,
  entry_timestamp INTEGER NOT NULL,
  entry_price REAL NOT NULL,
  notional REAL,
  leverage INTEGER,
  funding_rate REAL,
  last_updated INTEGER NOT NULL,
  open_event_id TEXT NOT NULL,
  status TEXT DEFAULT 'OPEN'
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_wp_open ON wallet_positions(wallet_address, pair, open_event_id);
CREATE INDEX IF NOT EXISTS idx_wp_pair_ts ON wallet_positions(pair, entry_timestamp);

-- signals
CREATE TABLE IF NOT EXISTS signals (
  signal_id TEXT PRIMARY KEY,
  pair TEXT NOT NULL,
  type TEXT CHECK(type IN ('LONG','SHORT')) NOT NULL,
  entry_timestamp TEXT NOT NULL,
  entry_price REAL NOT NULL,
  avg_trade_size REAL,
  stop_loss REAL,
  targets_json TEXT,
  status TEXT NOT NULL,
  notes TEXT,
  created_at INTEGER NOT NULL,
  rule_version INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_signals_status ON signals(status);
CREATE INDEX IF NOT EXISTS idx_signals_pair_created ON signals(pair, created_at);

-- link wallets to signals
CREATE TABLE IF NOT EXISTS signal_wallets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  signal_id TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  entry_price REAL,
  trade_size REAL,
  leverage INTEGER
);
CREATE INDEX IF NOT EXISTS idx_sw_signal ON signal_wallets(signal_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_sw_signal_wallet ON signal_wallets(signal_id, wallet_address);

-- targets per signal
CREATE TABLE IF NOT EXISTS signal_targets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  signal_id TEXT NOT NULL,
  target_index INTEGER NOT NULL,
  target_percent REAL NOT NULL,
  target_price REAL NOT NULL,
  is_hit INTEGER DEFAULT 0,
  hit_timestamp INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_target ON signal_targets(signal_id, target_index);

-- status history
CREATE TABLE IF NOT EXISTS signal_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  signal_id TEXT NOT NULL,
  status TEXT NOT NULL,
  reason TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ssh_signal ON signal_status_history(signal_id);

-- performance
CREATE TABLE IF NOT EXISTS performance (
  signal_id TEXT NOT NULL,
  outcome TEXT,
  pnl REAL,
  duration_sec INTEGER,
  max_drawdown_pct REAL,
  timeframe TEXT,
  updated_at INTEGER,
  PRIMARY KEY(signal_id, timeframe)
);

-- config
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);

-- idempotency (optional)
CREATE TABLE IF NOT EXISTS ingested_events (
  event_id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

