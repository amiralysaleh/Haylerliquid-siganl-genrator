-- Schema fixes and improvements based on audit findings

-- Fix column naming inconsistency in wallet_positions
ALTER TABLE wallet_positions RENAME COLUMN direction TO position_type;

-- Add missing last_updated column to signals table
ALTER TABLE signals ADD COLUMN last_updated INTEGER;

-- Add proper constraints and validation
CREATE TABLE IF NOT EXISTS wallet_positions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL,
  pair TEXT NOT NULL,
  position_type TEXT CHECK(position_type IN ('LONG','SHORT')) NOT NULL,
  entry_timestamp INTEGER NOT NULL,
  entry_price REAL NOT NULL CHECK(entry_price > 0),
  trade_size REAL CHECK(trade_size > 0),
  leverage INTEGER CHECK(leverage >= 1 AND leverage <= 100),
  funding_rate REAL,
  last_updated INTEGER NOT NULL,
  open_event_id TEXT NOT NULL,
  status TEXT DEFAULT 'OPEN',
  FOREIGN KEY (wallet_address) REFERENCES wallets(address)
);

-- Copy data from old table to new table
INSERT INTO wallet_positions_new 
SELECT id, wallet_address, pair, position_type, entry_timestamp, entry_price, 
       trade_size, leverage, funding_rate, last_updated, open_event_id, status
FROM wallet_positions;

-- Drop old table and rename new table
DROP TABLE wallet_positions;
ALTER TABLE wallet_positions_new RENAME TO wallet_positions;

-- Recreate indexes
CREATE UNIQUE INDEX IF NOT EXISTS uniq_wp_open ON wallet_positions(wallet_address, pair, open_event_id);
CREATE INDEX IF NOT EXISTS idx_wp_pair_ts ON wallet_positions(pair, entry_timestamp);
CREATE INDEX IF NOT EXISTS idx_wp_wallet ON wallet_positions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_wp_status ON wallet_positions(status);

-- Add constraints to signals table
CREATE TABLE IF NOT EXISTS signals_new (
  signal_id TEXT PRIMARY KEY,
  pair TEXT NOT NULL,
  type TEXT CHECK(type IN ('LONG','SHORT')) NOT NULL,
  entry_timestamp INTEGER NOT NULL,
  entry_price REAL NOT NULL CHECK(entry_price > 0),
  avg_trade_size REAL CHECK(avg_trade_size > 0),
  stop_loss REAL CHECK(stop_loss < 0 AND stop_loss >= -50),
  targets_json TEXT,
  status TEXT NOT NULL,
  notes TEXT,
  created_at INTEGER NOT NULL,
  last_updated INTEGER,
  rule_version INTEGER DEFAULT 1
);

-- Copy data from old signals table
INSERT INTO signals_new 
SELECT signal_id, pair, type, 
       CASE 
         WHEN typeof(entry_timestamp) = 'text' THEN strftime('%s', entry_timestamp) * 1000
         ELSE entry_timestamp 
       END as entry_timestamp,
       entry_price, avg_trade_size, stop_loss, targets_json, status, notes, 
       created_at, last_updated, rule_version
FROM signals;

-- Drop old table and rename new table
DROP TABLE signals;
ALTER TABLE signals_new RENAME TO signals;

-- Recreate indexes for signals
CREATE INDEX IF NOT EXISTS idx_signals_status ON signals(status);
CREATE INDEX IF NOT EXISTS idx_signals_pair_created ON signals(pair, created_at);
CREATE INDEX IF NOT EXISTS idx_signals_type ON signals(type);
CREATE INDEX IF NOT EXISTS idx_signals_timestamp ON signals(entry_timestamp);

-- Add validation constraints to other tables
CREATE TABLE IF NOT EXISTS wallets_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  address TEXT UNIQUE NOT NULL CHECK(length(address) = 42 AND address LIKE '0x%'),
  label TEXT NOT NULL CHECK(length(label) > 0),
  is_active INTEGER DEFAULT 1 CHECK(is_active IN (0, 1)),
  created_at INTEGER NOT NULL
);

-- Copy wallet data
INSERT INTO wallets_new SELECT * FROM wallets;

-- Replace wallets table
DROP TABLE wallets;
ALTER TABLE wallets_new RENAME TO wallets;

-- Recreate wallet indexes
CREATE INDEX IF NOT EXISTS idx_wallets_address ON wallets(address);
CREATE INDEX IF NOT EXISTS idx_wallets_active ON wallets(is_active);

-- Add performance tracking improvements
CREATE INDEX IF NOT EXISTS idx_performance_timeframe ON performance(timeframe);
CREATE INDEX IF NOT EXISTS idx_performance_outcome ON performance(outcome);
CREATE INDEX IF NOT EXISTS idx_performance_updated ON performance(updated_at);

-- Add configuration validation
CREATE TABLE IF NOT EXISTS config_new (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT,
  CHECK(length(key) > 0 AND length(value) > 0)
);

-- Copy config data
INSERT INTO config_new SELECT * FROM config;

-- Replace config table
DROP TABLE config;
ALTER TABLE config_new RENAME TO config;

-- Add cleanup for old events (performance optimization)
CREATE INDEX IF NOT EXISTS idx_ingested_events_created ON ingested_events(created_at);

-- Add notification log improvements
CREATE INDEX IF NOT EXISTS idx_notification_log_status ON notification_log(status);

-- Update signal_wallets with proper constraints
CREATE TABLE IF NOT EXISTS signal_wallets_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  signal_id TEXT NOT NULL,
  wallet_address TEXT NOT NULL CHECK(length(wallet_address) = 42 AND wallet_address LIKE '0x%'),
  entry_price REAL CHECK(entry_price > 0),
  trade_size REAL CHECK(trade_size > 0),
  leverage INTEGER CHECK(leverage >= 1 AND leverage <= 100),
  FOREIGN KEY (signal_id) REFERENCES signals(signal_id),
  FOREIGN KEY (wallet_address) REFERENCES wallets(address)
);

-- Copy signal_wallets data
INSERT INTO signal_wallets_new SELECT * FROM signal_wallets;

-- Replace signal_wallets table
DROP TABLE signal_wallets;
ALTER TABLE signal_wallets_new RENAME TO signal_wallets;

-- Recreate signal_wallets indexes
CREATE INDEX IF NOT EXISTS idx_sw_signal ON signal_wallets(signal_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_sw_signal_wallet ON signal_wallets(signal_id, wallet_address);
CREATE INDEX IF NOT EXISTS idx_sw_wallet ON signal_wallets(wallet_address);

-- Add signal_targets constraints
CREATE TABLE IF NOT EXISTS signal_targets_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  signal_id TEXT NOT NULL,
  target_index INTEGER NOT NULL CHECK(target_index >= 0),
  target_percent REAL NOT NULL CHECK(target_percent > 0 AND target_percent <= 100),
  target_price REAL NOT NULL CHECK(target_price > 0),
  is_hit INTEGER DEFAULT 0 CHECK(is_hit IN (0, 1)),
  hit_timestamp INTEGER,
  FOREIGN KEY (signal_id) REFERENCES signals(signal_id)
);

-- Copy signal_targets data
INSERT INTO signal_targets_new SELECT * FROM signal_targets;

-- Replace signal_targets table
DROP TABLE signal_targets;
ALTER TABLE signal_targets_new RENAME TO signal_targets;

-- Recreate signal_targets indexes
CREATE UNIQUE INDEX IF NOT EXISTS uniq_target ON signal_targets(signal_id, target_index);
CREATE INDEX IF NOT EXISTS idx_targets_signal ON signal_targets(signal_id);
CREATE INDEX IF NOT EXISTS idx_targets_hit ON signal_targets(is_hit);

