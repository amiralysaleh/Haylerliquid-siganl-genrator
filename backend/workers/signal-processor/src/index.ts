import { SignalEvent, WalletPosition, NotificationEvent } from "../../../shared/types";
import { DatabaseManager } from "../../../shared/database";
import { createLogger, generateEventId } from "../../../shared/utils";
import { validateWalletPosition, validateSignalData } from "../../../shared/validation";
import { v4 as uuidv4 } from 'uuid';

interface Env {
  DB: D1Database;
  NOTIFICATION_QUEUE: Queue;
}

const logger = createLogger('Signal-Processor');

export default {
  async queue(batch: MessageBatch<SignalEvent>, env: Env): Promise<void> {
    logger.info(`Processing ${batch.messages.length} signal events`);
    
    const db = new DatabaseManager(env.DB);
    
    try {
      const config = await db.getConfig();
      
      for (const message of batch.messages) {
        try {
          await processSignalEvent(message.body, db, env.NOTIFICATION_QUEUE, config);
          message.ack();
        } catch (error) {
          logger.error('Failed to process signal event:', error);
          message.retry();
        }
      }
      
      logger.info('Signal event processing completed');
    } catch (error) {
      logger.error('Signal processor batch failed:', error);
      // Retry all messages in the batch
      for (const message of batch.messages) {
        message.retry();
      }
    }
  },
};

async function processSignalEvent(
  event: SignalEvent,
  db: DatabaseManager,
  notificationQueue: Queue,
  config: any
): Promise<void> {
  const newPosition = event.data;
  
  logger.debug(`Processing signal event: ${newPosition.wallet_address} ${newPosition.pair} ${newPosition.position_type}`);
  
  // Get recent positions within the time window
  const timeWindowMs = config.time_window_min * 60 * 1000;
  const recentPositions = await db.getRecentPositions(
    newPosition.pair,
    newPosition.position_type,
    timeWindowMs
  );
  
  // Filter positions based on criteria
  const validPositions = recentPositions.filter(pos => {
    // Check minimum trade size
    if (pos.trade_size < config.min_trade_size) {
      return false;
    }
    
    // Check minimum leverage
    if (pos.leverage < config.required_leverage_min) {
      return false;
    }
    
    return true;
  });
  
  // Count unique wallets
  const uniqueWallets = new Set<string>();
  const walletPositions = new Map<string, WalletPosition>();
  
  for (const pos of validPositions) {
    uniqueWallets.add(pos.wallet_address);
    // Keep the most recent position for each wallet
    if (!walletPositions.has(pos.wallet_address) || 
        pos.entry_timestamp > walletPositions.get(pos.wallet_address)!.entry_timestamp) {
      walletPositions.set(pos.wallet_address, pos);
    }
  }
  
  logger.debug(`Found ${uniqueWallets.size} unique wallets for ${newPosition.pair} ${newPosition.position_type}`);
  
  // Check if signal threshold is met
  if (uniqueWallets.size >= config.wallet_count) {
    await generateSignal(
      newPosition.pair,
      newPosition.position_type,
      Array.from(walletPositions.values()),
      db,
      notificationQueue,
      config
    );
  } else {
    logger.debug(`Signal threshold not met: ${uniqueWallets.size}/${config.wallet_count} wallets`);
  }
}

async function generateSignal(
  pair: string,
  positionType: string,
  positions: WalletPosition[],
  db: DatabaseManager,
  notificationQueue: Queue,
  config: any
): Promise<void> {
  try {
    // Check for duplicate signals in recent time
    const signalCooldownMs = 5 * 60 * 1000; // 5 minutes cooldown
    const recentSignalId = await checkRecentSignal(db, pair, positionType, signalCooldownMs);
    
    if (recentSignalId) {
      logger.info(`Signal cooldown active for ${pair} ${positionType}, skipping duplicate`);
      return;
    }
    
    // Calculate signal metrics
    const metrics = calculateSignalMetrics(positions);
    const signalId = uuidv4();
    
    // Get default SL/TP from config
    const stopLoss = config.default_sl_percent || -2.5;
    const targets = config.tps_percent || [2.0, 3.5, 5.0];
    
    // Create signal record
    const signalData = {
      signal_id: signalId,
      pair: pair,
      type: positionType,
      entry_timestamp: new Date().toISOString(),
      entry_price: metrics.avgEntryPrice,
      avg_trade_size: metrics.avgTradeSize,
      stop_loss: stopLoss,
      targets_json: JSON.stringify(targets),
      status: 'OPEN',
      created_at: Date.now()
    };
    
    // Save signal
    await db.saveSignal(signalData);
    
    // Save signal-wallet relationships
    const signalWallets = positions.map(pos => ({
      wallet_address: pos.wallet_address,
      entry_price: pos.entry_price,
      trade_size: pos.trade_size,
      leverage: pos.leverage
    }));
    
    await db.saveSignalWallets(signalId, signalWallets);
    
    // Save signal targets
    const signalTargets = targets.map((targetPercent: number, index: number) => {
      const targetPrice = positionType === 'LONG'
        ? metrics.avgEntryPrice * (1 + targetPercent / 100)
        : metrics.avgEntryPrice * (1 - targetPercent / 100);
      
      return {
        target_index: index,
        target_percent: targetPercent,
        target_price: targetPrice
      };
    });
    
    await db.saveSignalTargets(signalId, signalTargets);
    
    logger.info(`Generated signal ${signalId}: ${pair} ${positionType} with ${positions.length} wallets at ${metrics.avgEntryPrice.toFixed(2)}`);
    
    // Send notification
    await sendSignalNotification(
      signalId,
      pair,
      positionType,
      metrics.avgEntryPrice,
      positions.length,
      stopLoss,
      targets,
      notificationQueue
    );
    
  } catch (error) {
    logger.error('Failed to generate signal:', error);
    throw error;
  }
}

function calculateSignalMetrics(positions: WalletPosition[]): {
  avgEntryPrice: number;
  avgTradeSize: number;
  totalNotional: number;
  avgLeverage: number;
} {
  let totalEntryPrice = 0;
  let totalTradeSize = 0;
  let totalNotional = 0;
  let totalLeverage = 0;
  
  for (const pos of positions) {
    totalEntryPrice += pos.entry_price;
    totalTradeSize += pos.trade_size;
    totalNotional += pos.entry_price * pos.trade_size;
    totalLeverage += pos.leverage;
  }
  
  const count = positions.length;
  
  return {
    avgEntryPrice: totalEntryPrice / count,
    avgTradeSize: totalTradeSize / count,
    totalNotional: totalNotional,
    avgLeverage: totalLeverage / count
  };
}

async function checkRecentSignal(
  db: DatabaseManager,
  pair: string,
  positionType: string,
  cooldownMs: number
): Promise<string | null> {
  try {
    const cutoffTime = Date.now() - cooldownMs;
    
    const { results } = await db.db.prepare(`
      SELECT signal_id FROM signals
      WHERE pair = ? AND type = ? AND created_at > ?
      ORDER BY created_at DESC
      LIMIT 1
    `).bind(pair, positionType, cutoffTime).all();
    
    return results.length > 0 ? (results[0] as any).signal_id : null;
  } catch (error) {
    logger.error('Failed to check recent signals:', error);
    return null; // Allow signal generation on error
  }
}

async function sendSignalNotification(
  signalId: string,
  pair: string,
  positionType: string,
  entryPrice: number,
  walletCount: number,
  stopLoss: number,
  targets: number[],
  notificationQueue: Queue
): Promise<void> {
  try {
    const emoji = positionType === 'LONG' ? '🟢' : '🔴';
    const slPrice = positionType === 'LONG' 
      ? entryPrice * (1 + stopLoss / 100)
      : entryPrice * (1 - stopLoss / 100);
    
    const targetPrices = targets.map(tp => 
      positionType === 'LONG' 
        ? entryPrice * (1 + tp / 100)
        : entryPrice * (1 - tp / 100)
    );
    
    const message = `
${emoji} **NEW SIGNAL DETECTED** ${emoji}

**Pair:** ${pair}
**Direction:** ${positionType}
**Entry Price:** $${entryPrice.toFixed(2)}
**Wallets:** ${walletCount}

**Stop Loss:** $${slPrice.toFixed(2)} (${stopLoss.toFixed(1)}%)
**Take Profits:**
${targetPrices.map((price, i) => `  TP${i + 1}: $${price.toFixed(2)} (${targets[i].toFixed(1)}%)`).join('\n')}

**Signal ID:** ${signalId}
**Time:** ${new Date().toISOString()}
    `.trim();
    
    const notification: NotificationEvent = {
      type: "new_signal",
      message: message,
      chat_id: "CONFIGURED_IN_NOTIFIER" // Will be replaced by notifier worker
    };
    
    await notificationQueue.send(notification);
    logger.debug(`Notification queued for signal ${signalId}`);
    
  } catch (error) {
    logger.error('Failed to send signal notification:', error);
    // Don't throw here as signal is already saved
  }
}

