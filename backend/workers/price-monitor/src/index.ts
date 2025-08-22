import { NotificationEvent } from "../../../shared/types";
import { HyperliquidClient, KuCoinClient } from "../../../shared/api-clients";
import { DatabaseManager } from "../../../shared/database";
import { PerformanceCalculator, PerformanceMetrics } from "../../../shared/performance";
import { createLogger, batchArray } from "../../../shared/utils";

interface Env {
  DB: D1Database;
  NOTIFICATION_QUEUE: Queue;
  HYPERLIQUID_INFO_API?: string;
  KUCOIN_API?: string;
}

const logger = createLogger('Price-Monitor');

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    logger.info(`Price monitoring triggered: ${event.cron}`);
    
    try {
      await monitorActivePrices(env);
      logger.info('Price monitoring completed successfully');
    } catch (error) {
      logger.error('Price monitoring failed:', error);
      // Don't throw to prevent worker from being marked as failed
    }
  },
};

async function monitorActivePrices(env: Env): Promise<void> {
  const db = new DatabaseManager(env.DB);
  const hyperliquidClient = new HyperliquidClient(env.HYPERLIQUID_INFO_API);
  const kucoinClient = new KuCoinClient(env.KUCOIN_API);
  
  try {
    // Get all active signals
    const activeSignals = await db.getActiveSignals();
    
    if (activeSignals.length === 0) {
      logger.debug('No active signals to monitor');
      return;
    }
    
    logger.info(`Monitoring ${activeSignals.length} active signals`);
    
    // Group signals by pair for efficient price fetching
    const signalsByPair = groupSignalsByPair(activeSignals);
    
    // Process each pair
    for (const [pair, signals] of signalsByPair.entries()) {
      try {
        await processPairSignals(pair, signals, hyperliquidClient, kucoinClient, db, env.NOTIFICATION_QUEUE);
        
        // Small delay between pairs to avoid overwhelming APIs
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        logger.error(`Failed to process signals for pair ${pair}:`, error);
        // Continue with other pairs
      }
    }
    
    logger.info('Price monitoring cycle completed');
    
  } catch (error) {
    logger.error('Price monitoring failed:', error);
    throw error;
  }
}

function groupSignalsByPair(signals: any[]): Map<string, any[]> {
  const grouped = new Map<string, any[]>();
  
  for (const signal of signals) {
    const pair = signal.pair;
    if (!grouped.has(pair)) {
      grouped.set(pair, []);
    }
    grouped.get(pair)!.push(signal);
  }
  
  return grouped;
}

async function processPairSignals(
  pair: string,
  signals: any[],
  hyperliquidClient: HyperliquidClient,
  kucoinClient: KuCoinClient,
  db: DatabaseManager,
  notificationQueue: Queue
): Promise<void> {
  try {
    // Fetch current price with fallback
    const currentPrice = await getCurrentPrice(pair, hyperliquidClient, kucoinClient);
    
    if (currentPrice === null) {
      logger.warn(`Could not fetch price for ${pair}, skipping signals`);
      return;
    }
    
    logger.debug(`Current price for ${pair}: $${currentPrice.toFixed(2)}`);
    
    // Process each signal for this pair
    for (const signal of signals) {
      try {
        await processSignalPriceCheck(signal, currentPrice, db, notificationQueue);
      } catch (error) {
        logger.error(`Failed to process signal ${signal.signal_id}:`, error);
      }
    }
    
  } catch (error) {
    logger.error(`Failed to process pair ${pair}:`, error);
    throw error;
  }
}

async function getCurrentPrice(
  pair: string,
  hyperliquidClient: HyperliquidClient,
  kucoinClient: KuCoinClient
): Promise<number | null> {
  try {
    // Try Hyperliquid first
    const hlPrice = await hyperliquidClient.getMarkPrice(pair);
    if (hlPrice !== null) {
      logger.debug(`Got Hyperliquid price for ${pair}: ${hlPrice}`);
      return hlPrice;
    }
    
    // Fallback to KuCoin
    logger.debug(`Hyperliquid price unavailable for ${pair}, trying KuCoin`);
    const kcPrice = await kucoinClient.getPrice(pair);
    if (kcPrice !== null) {
      logger.debug(`Got KuCoin price for ${pair}: ${kcPrice}`);
      return kcPrice;
    }
    
    logger.warn(`No price available for ${pair} from any source`);
    return null;
    
  } catch (error) {
    logger.error(`Error fetching price for ${pair}:`, error);
    return null;
  }
}

async function processSignalPriceCheck(
  signal: any,
  currentPrice: number,
  db: DatabaseManager,
  notificationQueue: Queue
): Promise<void> {
  const {
    signal_id: signalId,
    pair,
    type: signalType,
    entry_price: entryPrice,
    stop_loss: stopLossPercent,
    targets_json: targetsJson,
    avg_trade_size: avgTradeSize,
    entry_timestamp: entryTimestamp
  } = signal;
  
  const targets = JSON.parse(targetsJson);
  
  // Calculate absolute SL/TP prices
  const { stopLossPrice, targetPrices } = calculatePriceLevels(
    entryPrice,
    stopLossPercent,
    targets,
    signalType
  );
  
  logger.debug(`Checking signal ${signalId}: Entry=${entryPrice}, Current=${currentPrice}, SL=${stopLossPrice}`);
  
  // Check for stop loss hit
  if (isStopLossHit(currentPrice, stopLossPrice, signalType)) {
    await handleStopLossHit(signalId, pair, signalType, currentPrice, entryPrice, avgTradeSize, entryTimestamp, db, notificationQueue);
    return; // Signal is closed, no need to check TPs
  }
  
  // Check for take profit hits
  const tpHits = await checkTakeProfitHits(signalId, currentPrice, targetPrices, signalType, db);
  
  if (tpHits.length > 0) {
    await handleTakeProfitHits(signalId, pair, signalType, currentPrice, tpHits, targets, entryPrice, avgTradeSize, entryTimestamp, db, notificationQueue);
  }
}

function calculatePriceLevels(
  entryPrice: number,
  stopLossPercent: number,
  targets: number[],
  signalType: string
): { stopLossPrice: number; targetPrices: number[] } {
  let stopLossPrice: number;
  let targetPrices: number[];
  
  if (signalType === 'LONG') {
    // For LONG: SL is below entry, TP is above entry
    stopLossPrice = entryPrice * (1 + stopLossPercent / 100); // stopLossPercent is negative
    targetPrices = targets.map(tp => entryPrice * (1 + tp / 100));
  } else {
    // For SHORT: SL is above entry, TP is below entry
    stopLossPrice = entryPrice * (1 - Math.abs(stopLossPercent) / 100);
    targetPrices = targets.map(tp => entryPrice * (1 - tp / 100));
  }
  
  return { stopLossPrice, targetPrices };
}

function isStopLossHit(currentPrice: number, stopLossPrice: number, signalType: string): boolean {
  if (signalType === 'LONG') {
    return currentPrice <= stopLossPrice;
  } else {
    return currentPrice >= stopLossPrice;
  }
}

async function checkTakeProfitHits(
  signalId: string,
  currentPrice: number,
  targetPrices: number[],
  signalType: string,
  db: DatabaseManager
): Promise<number[]> {
  const hits: number[] = [];
  
  try {
    // Get current target status
    const { results } = await db.db.prepare(`
      SELECT target_index, is_hit FROM signal_targets
      WHERE signal_id = ?
      ORDER BY target_index ASC
    `).bind(signalId).all();
    
    const targetStatus = new Map<number, boolean>();
    for (const row of results as any[]) {
      targetStatus.set(row.target_index, row.is_hit === 1);
    }
    
    // Check each target
    for (let i = 0; i < targetPrices.length; i++) {
      const targetPrice = targetPrices[i];
      const isAlreadyHit = targetStatus.get(i) || false;
      
      if (!isAlreadyHit) {
        const isHit = signalType === 'LONG' 
          ? currentPrice >= targetPrice
          : currentPrice <= targetPrice;
        
        if (isHit) {
          hits.push(i);
        }
      }
    }
    
    return hits;
    
  } catch (error) {
    logger.error(`Failed to check TP hits for signal ${signalId}:`, error);
    return [];
  }
}

async function handleStopLossHit(
  signalId: string,
  pair: string,
  signalType: string,
  currentPrice: number,
  entryPrice: number,
  avgTradeSize: number,
  entryTimestamp: string,
  db: DatabaseManager,
  notificationQueue: Queue
): Promise<void> {
  try {
    // Update signal status
    await db.updateSignalStatus(signalId, 'SL_HIT', `Stop loss hit at ${currentPrice.toFixed(2)}`);
    
    // Calculate and store performance
    await updatePerformanceMetrics(
      signalId,
      entryPrice,
      currentPrice,
      signalType,
      entryTimestamp,
      avgTradeSize,
      'SL_HIT',
      db
    );
    
    // Send notification
    const message = `🚨 **STOP LOSS HIT** 🚨\n\n**Pair:** ${pair}\n**Direction:** ${signalType}\n**Price:** $${currentPrice.toFixed(2)}\n**Signal ID:** ${signalId}\n\n**Time:** ${new Date().toISOString()}`;
    
    await notificationQueue.send({
      type: 'SL_HIT',
      message: message,
      chat_id: 'CONFIGURED_IN_NOTIFIER'
    });
    
    logger.info(`Stop loss hit for signal ${signalId}: ${pair} ${signalType} at ${currentPrice.toFixed(2)}`);
    
  } catch (error) {
    logger.error(`Failed to handle SL hit for signal ${signalId}:`, error);
  }
}

async function handleTakeProfitHits(
  signalId: string,
  pair: string,
  signalType: string,
  currentPrice: number,
  tpHits: number[],
  targets: number[],
  entryPrice: number,
  avgTradeSize: number,
  entryTimestamp: string,
  db: DatabaseManager,
  notificationQueue: Queue
): Promise<void> {
  try {
    // Update target status
    for (const tpIndex of tpHits) {
      await db.updateSignalTarget(signalId, tpIndex, true);
    }
    
    // Check if all targets are hit
    const allTargetsHit = await checkAllTargetsHit(signalId, targets.length, db);
    
    // Update signal status
    const newStatus = allTargetsHit ? 'TP_HIT' : 'PARTIAL_TP';
    await db.updateSignalStatus(signalId, newStatus, `TP${tpHits.map(i => i + 1).join(', ')} hit at ${currentPrice.toFixed(2)}`);
    
    // Calculate performance if all targets hit
    if (allTargetsHit) {
      await updatePerformanceMetrics(
        signalId,
        entryPrice,
        currentPrice,
        signalType,
        entryTimestamp,
        avgTradeSize,
        'TP_HIT',
        db
      );
    }
    
    // Send notification
    const tpText = tpHits.map(i => `TP${i + 1}`).join(', ');
    const emoji = allTargetsHit ? '🎯🎯🎯' : '🎯';
    const statusText = allTargetsHit ? 'ALL TAKE PROFITS HIT' : `${tpText} HIT`;
    
    const message = `${emoji} **${statusText}** ${emoji}\n\n**Pair:** ${pair}\n**Direction:** ${signalType}\n**Price:** $${currentPrice.toFixed(2)}\n**Signal ID:** ${signalId}\n\n**Time:** ${new Date().toISOString()}`;
    
    await notificationQueue.send({
      type: newStatus,
      message: message,
      chat_id: 'CONFIGURED_IN_NOTIFIER'
    });
    
    logger.info(`${statusText} for signal ${signalId}: ${pair} ${signalType} at ${currentPrice.toFixed(2)}`);
    
  } catch (error) {
    logger.error(`Failed to handle TP hits for signal ${signalId}:`, error);
  }
}

async function checkAllTargetsHit(signalId: string, totalTargets: number, db: DatabaseManager): Promise<boolean> {
  try {
    const { results } = await db.db.prepare(`
      SELECT COUNT(*) as hit_count FROM signal_targets
      WHERE signal_id = ? AND is_hit = 1
    `).bind(signalId).all();
    
    const hitCount = (results[0] as any)?.hit_count || 0;
    return hitCount >= totalTargets;
    
  } catch (error) {
    logger.error(`Failed to check all targets hit for signal ${signalId}:`, error);
    return false;
  }
}

async function updatePerformanceMetrics(
  signalId: string,
  entryPrice: number,
  exitPrice: number,
  signalType: 'LONG' | 'SHORT',
  entryTimestamp: string,
  avgTradeSize: number,
  status: string,
  db: DatabaseManager
): Promise<void> {
  try {
    const entryTime = new Date(entryTimestamp).getTime();
    const exitTime = Date.now();
    const durationSec = Math.floor((exitTime - entryTime) / 1000);
    const durationHours = durationSec / 3600;
    
    // Calculate PnL
    const pnl = PerformanceCalculator.calculatePnL(
      entryPrice,
      exitPrice,
      avgTradeSize,
      signalType,
      0, // funding rate placeholder
      durationHours
    );
    
    // Determine outcome
    const outcome = PerformanceCalculator.determineOutcome(status, pnl);
    
    // Store performance metrics for different timeframes
    const timeframes = ['24h', '7d', '30d', 'all_time'];
    
    for (const timeframe of timeframes) {
      const performanceMetric: PerformanceMetrics = {
        signal_id: signalId,
        outcome,
        pnl,
        duration_sec: durationSec,
        max_drawdown_pct: 0, // TODO: Calculate from price history
        timeframe,
        updated_at: Date.now(),
      };
      
      await db.db.prepare(`
        INSERT OR REPLACE INTO performance (
          signal_id, outcome, pnl, duration_sec, max_drawdown_pct, timeframe, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        performanceMetric.signal_id,
        performanceMetric.outcome,
        performanceMetric.pnl,
        performanceMetric.duration_sec,
        performanceMetric.max_drawdown_pct,
        performanceMetric.timeframe,
        performanceMetric.updated_at
      ).run();
    }
    
    logger.info(`Performance metrics updated for signal ${signalId}: ${outcome}, PnL: ${pnl.toFixed(2)}`);
    
  } catch (error) {
    logger.error(`Failed to update performance metrics for signal ${signalId}:`, error);
  }
}

