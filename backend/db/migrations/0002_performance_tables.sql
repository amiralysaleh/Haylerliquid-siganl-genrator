-- wallet_performance table for tracking individual wallet metrics
CREATE TABLE IF NOT EXISTS wallet_performance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  success_rate REAL NOT NULL,
  win_loss_ratio REAL NOT NULL,
  total_pnl REAL NOT NULL,
  avg_pnl_per_trade REAL NOT NULL,
  participation_rate REAL NOT NULL,
  total_signals INTEGER NOT NULL,
  wins INTEGER NOT NULL,
  losses INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(wallet_address, timeframe)
);
CREATE INDEX IF NOT EXISTS idx_wallet_performance_address ON wallet_performance(wallet_address);
CREATE INDEX IF NOT EXISTS idx_wallet_performance_timeframe ON wallet_performance(timeframe);

-- system_performance table for overall system metrics
CREATE TABLE IF NOT EXISTS system_performance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timeframe TEXT UNIQUE NOT NULL,
  total_signals INTEGER NOT NULL,
  total_wins INTEGER NOT NULL,
  total_losses INTEGER NOT NULL,
  success_rate REAL NOT NULL,
  win_loss_ratio REAL NOT NULL,
  avg_pnl REAL NOT NULL,
  total_pnl REAL NOT NULL,
  avg_duration_sec REAL NOT NULL,
  avg_max_drawdown REAL NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_system_performance_timeframe ON system_performance(timeframe);

-- Insert default configuration values
INSERT OR IGNORE INTO config (key, value, updated_at, updated_by) VALUES
('wallet_count', '5', strftime('%s', 'now') * 1000, 'system'),
('time_window_min', '10', strftime('%s', 'now') * 1000, 'system'),
('default_sl_percent', '-2.5', strftime('%s', 'now') * 1000, 'system'),
('tps_percent', '[2.0, 3.5, 5.0]', strftime('%s', 'now') * 1000, 'system'),
('poll_interval_sec', '60', strftime('%s', 'now') * 1000, 'system'),
('price_poll_interval_sec', '30', strftime('%s', 'now') * 1000, 'system'),
('monitored_pairs', '["ETH", "BTC", "SOL"]', strftime('%s', 'now') * 1000, 'system'),
('ignored_pairs', '[]', strftime('%s', 'now') * 1000, 'system'),
('required_leverage_min', '1', strftime('%s', 'now') * 1000, 'system'),
('min_trade_size', '0', strftime('%s', 'now') * 1000, 'system');

-- Insert initial wallet addresses
INSERT OR IGNORE INTO wallets (address, label, is_active, created_at) VALUES
('0xecb63caa47c7c4e77f60f1ce858cf28dc2b82b00', 'Wallet 1', 1, strftime('%s', 'now') * 1000),
('0x00c511ab1b583f4efab3608d0897d377c4de47a6', 'Wallet 2', 1, strftime('%s', 'now') * 1000),
('0x023a3d058020fb76cca98f01b3c48c8938a22355', 'Wallet 3', 1, strftime('%s', 'now') * 1000),
('0x2ba553d9f990a3b66b03b2dc0d030dfc1c061036', 'Wallet 4', 1, strftime('%s', 'now') * 1000),
('0x7b7f72a28fe109fa703eeed7984f2a8a68fedee2', 'Wallet 5', 1, strftime('%s', 'now') * 1000),
('0x183d0567c33e7591c22540e45d2f74730b42a0ca', 'Wallet 6', 1, strftime('%s', 'now') * 1000);

