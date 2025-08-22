import { WalletPosition, Config } from './types';
import { createLogger, batchArray } from './utils';

const logger = createLogger('Database');

export class DatabaseManager {
  constructor(private db: D1Database) {}
  
  async getActiveWallets(): Promise<{ address: string; label: string }[]> {
    try {
      const { results } = await this.db.prepare(
        'SELECT address, label FROM wallets WHERE is_active = 1 ORDER BY created_at ASC'
      ).all();
      
      logger.debug(`Retrieved ${results.length} active wallets`);
      return results as { address: string; label: string }[];
    } catch (error) {
      logger.error('Failed to get active wallets:', error);
      throw error;
    }
  }
  
  async getConfig(): Promise<Config> {
    try {
      const { results } = await this.db.prepare(
        'SELECT key, value FROM config'
      ).all();
      
      const config: Partial<Config> = {};
      for (const row of results as { key: string; value: string }[]) {
        try {
          // Try to parse as JSON first, then fall back to string/number
          const value = row.value;
          if (value.startsWith('[') || value.startsWith('{')) {
            config[row.key as keyof Config] = JSON.parse(value);
          } else if (!isNaN(Number(value))) {
            config[row.key as keyof Config] = Number(value) as any;
          } else {
            config[row.key as keyof Config] = value as any;
          }
        } catch (e) {
          config[row.key as keyof Config] = row.value as any;
        }
      }
      
      // Apply defaults for missing values
      const finalConfig: Config = {
        wallet_count: config.wallet_count || 5,
        time_window_min: config.time_window_min || 10,
        min_trade_size: config.min_trade_size || 0,
        ignored_pairs: config.ignored_pairs || [],
        required_leverage_min: config.required_leverage_min || 1,
        poll_interval_sec: config.poll_interval_sec || 60,
        monitored_pairs: config.monitored_pairs || [],
      };
      
      logger.debug('Retrieved configuration:', finalConfig);
      return finalConfig;
    } catch (error) {
      logger.error('Failed to get configuration:', error);
      throw error;
    }
  }
  
  async updateConfig(key: string, value: any, updatedBy: string = 'system'): Promise<void> {
    try {
      const serializedValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
      
      await this.db.prepare(
        'INSERT OR REPLACE INTO config (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)'
      ).bind(key, serializedValue, Date.now(), updatedBy).run();
      
      logger.info(`Configuration updated: ${key} = ${serializedValue}`);
    } catch (error) {
      logger.error(`Failed to update config ${key}:`, error);
      throw error;
    }
  }
  
  async saveWalletPosition(position: WalletPosition): Promise<void> {
    try {
      await this.db.prepare(`
        INSERT OR REPLACE INTO wallet_positions (
          wallet_address, pair, position_type, entry_timestamp, entry_price, 
          trade_size, leverage, funding_rate, last_updated, open_event_id, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        position.wallet_address,
        position.pair,
        position.position_type,
        position.entry_timestamp,
        position.entry_price,
        position.trade_size,
        position.leverage,
        position.funding_rate,
        position.last_updated,
        position.open_event_id,
        'OPEN'
      ).run();
      
      logger.debug(`Saved wallet position: ${position.wallet_address} ${position.pair} ${position.position_type}`);
    } catch (error) {
      logger.error('Failed to save wallet position:', error);
      throw error;
    }
  }
  
  async getRecentPositions(pair: string, positionType: string, timeWindowMs: number): Promise<WalletPosition[]> {
    try {
      const cutoffTime = Date.now() - timeWindowMs;
      
      const { results } = await this.db.prepare(`
        SELECT * FROM wallet_positions
        WHERE pair = ? AND position_type = ? AND entry_timestamp >= ?
        ORDER BY entry_timestamp DESC
      `).bind(pair, positionType, cutoffTime).all();
      
      logger.debug(`Retrieved ${results.length} recent positions for ${pair} ${positionType}`);
      return results as WalletPosition[];
    } catch (error) {
      logger.error('Failed to get recent positions:', error);
      throw error;
    }
  }
  
  async saveSignal(signalData: {
    signal_id: string;
    pair: string;
    type: string;
    entry_timestamp: string;
    entry_price: number;
    avg_trade_size: number;
    stop_loss: number;
    targets_json: string;
    status: string;
    created_at: number;
  }): Promise<void> {
    try {
      await this.db.prepare(`
        INSERT INTO signals (
          signal_id, pair, type, entry_timestamp, entry_price, avg_trade_size,
          stop_loss, targets_json, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        signalData.signal_id,
        signalData.pair,
        signalData.type,
        signalData.entry_timestamp,
        signalData.entry_price,
        signalData.avg_trade_size,
        signalData.stop_loss,
        signalData.targets_json,
        signalData.status,
        signalData.created_at
      ).run();
      
      logger.info(`Saved signal: ${signalData.signal_id} for ${signalData.pair} ${signalData.type}`);
    } catch (error) {
      logger.error('Failed to save signal:', error);
      throw error;
    }
  }
  
  async saveSignalWallets(signalId: string, wallets: Array<{
    wallet_address: string;
    entry_price: number;
    trade_size: number;
    leverage: number;
  }>): Promise<void> {
    try {
      // Use batch processing for multiple wallets
      const batches = batchArray(wallets, 50); // Process in batches of 50
      
      for (const batch of batches) {
        const stmt = this.db.prepare(`
          INSERT INTO signal_wallets (signal_id, wallet_address, entry_price, trade_size, leverage)
          VALUES (?, ?, ?, ?, ?)
        `);
        
        for (const wallet of batch) {
          await stmt.bind(
            signalId,
            wallet.wallet_address,
            wallet.entry_price,
            wallet.trade_size,
            wallet.leverage
          ).run();
        }
      }
      
      logger.debug(`Saved ${wallets.length} signal wallets for signal ${signalId}`);
    } catch (error) {
      logger.error('Failed to save signal wallets:', error);
      throw error;
    }
  }
  
  async saveSignalTargets(signalId: string, targets: Array<{
    target_index: number;
    target_percent: number;
    target_price: number;
  }>): Promise<void> {
    try {
      for (const target of targets) {
        await this.db.prepare(`
          INSERT INTO signal_targets (signal_id, target_index, target_percent, target_price, is_hit)
          VALUES (?, ?, ?, ?, 0)
        `).bind(
          signalId,
          target.target_index,
          target.target_percent,
          target.target_price
        ).run();
      }
      
      logger.debug(`Saved ${targets.length} signal targets for signal ${signalId}`);
    } catch (error) {
      logger.error('Failed to save signal targets:', error);
      throw error;
    }
  }
  
  async getActiveSignals(): Promise<any[]> {
    try {
      const { results } = await this.db.prepare(`
        SELECT signal_id, pair, type, entry_price, stop_loss, targets_json, 
               avg_trade_size, entry_timestamp, created_at
        FROM signals 
        WHERE status = 'OPEN'
        ORDER BY created_at DESC
      `).all();
      
      logger.debug(`Retrieved ${results.length} active signals`);
      return results as any[];
    } catch (error) {
      logger.error('Failed to get active signals:', error);
      throw error;
    }
  }
  
  async updateSignalStatus(signalId: string, status: string, notes?: string): Promise<void> {
    try {
      await this.db.prepare(`
        UPDATE signals SET status = ?, notes = ?, last_updated = ?
        WHERE signal_id = ?
      `).bind(status, notes || '', Date.now(), signalId).run();
      
      logger.info(`Updated signal ${signalId} status to ${status}`);
    } catch (error) {
      logger.error('Failed to update signal status:', error);
      throw error;
    }
  }
  
  async updateSignalTarget(signalId: string, targetIndex: number, isHit: boolean): Promise<void> {
    try {
      await this.db.prepare(`
        UPDATE signal_targets SET is_hit = ?, hit_timestamp = ?
        WHERE signal_id = ? AND target_index = ?
      `).bind(isHit ? 1 : 0, isHit ? Date.now() : null, signalId, targetIndex).run();
      
      logger.debug(`Updated signal ${signalId} target ${targetIndex} hit status: ${isHit}`);
    } catch (error) {
      logger.error('Failed to update signal target:', error);
      throw error;
    }
  }
  
  async checkEventExists(eventId: string): Promise<boolean> {
    try {
      const { results } = await this.db.prepare(
        'SELECT 1 FROM ingested_events WHERE event_id = ? LIMIT 1'
      ).bind(eventId).all();
      
      return results.length > 0;
    } catch (error) {
      logger.error('Failed to check event existence:', error);
      return false; // Assume doesn't exist on error to avoid blocking
    }
  }
  
  async saveEvent(eventId: string): Promise<void> {
    try {
      await this.db.prepare(
        'INSERT OR IGNORE INTO ingested_events (event_id, created_at) VALUES (?, ?)'
      ).bind(eventId, Date.now()).run();
      
      logger.debug(`Saved event: ${eventId}`);
    } catch (error) {
      logger.error('Failed to save event:', error);
      // Don't throw here as this is for idempotency only
    }
  }
  
  async cleanupOldEvents(olderThanMs: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
    try {
      const cutoffTime = Date.now() - olderThanMs;
      
      const result = await this.db.prepare(
        'DELETE FROM ingested_events WHERE created_at < ?'
      ).bind(cutoffTime).run();
      
      logger.info(`Cleaned up ${result.changes} old events`);
    } catch (error) {
      logger.error('Failed to cleanup old events:', error);
    }
  }
  
  async addWallet(address: string, label: string): Promise<void> {
    try {
      await this.db.prepare(`
        INSERT INTO wallets (address, label, is_active, created_at)
        VALUES (?, ?, 1, ?)
      `).bind(address, label, Date.now()).run();
      
      logger.info(`Added new wallet: ${address} (${label})`);
    } catch (error) {
      logger.error('Failed to add wallet:', error);
      throw error;
    }
  }
  
  async updateWalletStatus(address: string, isActive: boolean): Promise<void> {
    try {
      await this.db.prepare(
        'UPDATE wallets SET is_active = ? WHERE address = ?'
      ).bind(isActive ? 1 : 0, address).run();
      
      logger.info(`Updated wallet ${address} status to ${isActive ? 'active' : 'inactive'}`);
    } catch (error) {
      logger.error('Failed to update wallet status:', error);
      throw error;
    }
  }
  
  async removeWallet(address: string): Promise<void> {
    try {
      await this.db.prepare(
        'DELETE FROM wallets WHERE address = ?'
      ).bind(address).run();
      
      logger.info(`Removed wallet: ${address}`);
    } catch (error) {
      logger.error('Failed to remove wallet:', error);
      throw error;
    }
  }
}

