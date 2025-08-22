-- notification_log table for tracking sent notifications
CREATE TABLE IF NOT EXISTS notification_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);
CREATE INDEX IF NOT EXISTS idx_notification_log_type ON notification_log(type);
CREATE INDEX IF NOT EXISTS idx_notification_log_sent_at ON notification_log(sent_at);

