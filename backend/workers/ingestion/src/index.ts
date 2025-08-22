import { Hono } from 'hono';
import { WalletPosition, SignalEvent } from '../../../shared/types';
import { HyperliquidClient } from '../../../shared/api-clients';
import { DatabaseManager } from '../../../shared/database';
import { createLogger, generateEventId, isValidWalletAddress, calculateNotionalValue } from '../../../shared/utils';

interface Env {
  DB: D1Database;
  SIGNAL_QUEUE: Queue;
  HYPERLIQUID_INFO_API?: string;
}

const logger = createLogger('Ingestion-Worker');
const app = new Hono();

app.get('/health', (c) => {
  logger.info('Health check requested');
  return c.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/cron/poll', async (c) => {
  const env = c.env as Env;
  logger.info('Manual polling triggered');
  
  try {
    await pollWalletActivity(env);
    return c.json({ status: 'Polling completed successfully', timestamp: new Date().toISOString() });
  } catch (error) {
    logger.error('Manual polling failed:', error);
    return c.json({ error: 'Polling failed', details: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

async function pollWalletActivity(env: Env): Promise<void> {
  const db = new DatabaseManager(env.DB);
  const hyperliquidClient = new HyperliquidClient(env.HYPERLIQUID_INFO_API);
  
  try {
    // Get active wallets
    const wallets = await db.getActiveWallets();
    if (wallets.length === 0) {
      logger.warn('No active wallets to monitor');
      return;
    }
    
    logger.info(`Polling ${wallets.length} active wallets`);
    
    // Get configuration
    const config = await db.getConfig();
    
    let processedWallets = 0;
    let newPositions = 0;
    
    for (const wallet of wallets) {
      try {
        if (!isValidWalletAddress(wallet.address)) {
          logger.warn(`Invalid wallet address format: ${wallet.address}`);
          continue;
        }
        
        await processWallet(wallet.address, hyperliquidClient, db, env.SIGNAL_QUEUE, config);
        processedWallets++;
        
        // Add small delay between wallet processing to avoid overwhelming APIs
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        logger.error(`Failed to process wallet ${wallet.address}:`, error);
        // Continue with other wallets even if one fails
      }
    }
    
    logger.info(`Polling completed: ${processedWallets}/${wallets.length} wallets processed`);
    
    // Cleanup old events periodically (every 100th run approximately)
    if (Math.random() < 0.01) {
      await db.cleanupOldEvents();
    }
    
  } catch (error) {
    logger.error('Wallet activity polling failed:', error);
    throw error;
  }
}

async function processWallet(
  walletAddress: string,
  hyperliquidClient: HyperliquidClient,
  db: DatabaseManager,
  signalQueue: Queue,
  config: any
): Promise<void> {
  try {
    // Fetch current positions and recent fills
    const [clearinghouseState, userFills] = await Promise.all([
      hyperliquidClient.getClearinghouseState(walletAddress),
      hyperliquidClient.getUserFills(walletAddress)
    ]);
    
    if (!clearinghouseState) {
      logger.debug(`No clearinghouse data for wallet ${walletAddress}`);
      return;
    }
    
    // Process current positions
    for (const assetPosition of clearinghouseState.assetPositions || []) {
      try {
        await processPosition(
          walletAddress,
          assetPosition,
          userFills,
          db,
          signalQueue,
          config
        );
      } catch (error) {
        logger.error(`Failed to process position for ${walletAddress} ${assetPosition.coin}:`, error);
      }
    }
    
  } catch (error) {
    logger.error(`Error processing wallet ${walletAddress}:`, error);
    throw error;
  }
}

async function processPosition(
  walletAddress: string,
  assetPosition: any,
  userFills: any,
  db: DatabaseManager,
  signalQueue: Queue,
  config: any
): Promise<void> {
  const pair = assetPosition.coin;
  const position = assetPosition.position;
  
  if (!position) {
    return;
  }
  
  const currentSize = parseFloat(position.szi || '0');
  const entryPx = parseFloat(position.entryPx || '0');
  const leverage = parseInt(position.leverage?.value || '1');
  
  // Skip if position is closed
  if (currentSize === 0) {
    return;
  }
  
  // Skip if pair is in ignored list
  if (config.ignored_pairs && config.ignored_pairs.includes(pair)) {
    logger.debug(`Skipping ignored pair: ${pair}`);
    return;
  }
  
  // Skip if pair is not in monitored list (if specified)
  if (config.monitored_pairs && config.monitored_pairs.length > 0 && !config.monitored_pairs.includes(pair)) {
    logger.debug(`Skipping non-monitored pair: ${pair}`);
    return;
  }
  
  const positionType = currentSize > 0 ? 'LONG' : 'SHORT';
  const absSize = Math.abs(currentSize);
  
  // Check minimum trade size
  const notionalValue = calculateNotionalValue(entryPx, absSize);
  if (notionalValue < config.min_trade_size) {
    logger.debug(`Position too small: ${notionalValue} < ${config.min_trade_size}`);
    return;
  }
  
  // Check minimum leverage
  if (leverage < config.required_leverage_min) {
    logger.debug(`Leverage too low: ${leverage} < ${config.required_leverage_min}`);
    return;
  }
  
  // Find relevant recent fill for accurate entry data
  const relevantFill = findRelevantFill(userFills, pair, positionType);
  const entryTimestamp = relevantFill ? relevantFill.time : Date.now();
  const actualEntryPrice = relevantFill ? parseFloat(relevantFill.px) : entryPx;
  
  // Generate deterministic event ID for idempotency
  const eventId = generateEventId(walletAddress, pair, entryTimestamp, positionType);
  
  // Check if we've already processed this event
  if (await db.checkEventExists(eventId)) {
    logger.debug(`Event already processed: ${eventId}`);
    return;
  }
  
  // Get funding rate
  let fundingRate = 0;
  try {
    const hyperliquidClient = new (await import('../../../shared/api-clients')).HyperliquidClient();
    fundingRate = await hyperliquidClient.getFundingRate(pair) || 0;
  } catch (error) {
    logger.warn(`Failed to get funding rate for ${pair}:`, error);
  }
  
  // Create new position record
  const newPosition: WalletPosition = {
    wallet_address: walletAddress,
    pair: pair,
    position_type: positionType,
    entry_timestamp: entryTimestamp,
    entry_price: actualEntryPrice,
    trade_size: absSize,
    leverage: leverage,
    funding_rate: fundingRate,
    last_updated: Date.now(),
    open_event_id: eventId
  };
  
  // Save position and mark event as processed
  await Promise.all([
    db.saveWalletPosition(newPosition),
    db.saveEvent(eventId)
  ]);
  
  logger.info(`New position detected: ${walletAddress} ${pair} ${positionType} at ${actualEntryPrice}`);
  
  // Enqueue for signal processing
  const signalEvent: SignalEvent = {
    type: 'new_position',
    data: newPosition
  };
  
  await signalQueue.send(signalEvent);
  logger.debug(`Enqueued signal event for ${walletAddress} ${pair} ${positionType}`);
}

function findRelevantFill(userFills: any, pair: string, positionType: string): any {
  if (!userFills || !userFills.fills) {
    return null;
  }
  
  // Look for recent fills for this pair in the correct direction
  const recentFills = userFills.fills
    .filter((fill: any) => {
      if (fill.coin !== pair) return false;
      
      // Match fill direction with position type
      const fillDirection = fill.side === 'B' ? 'LONG' : 'SHORT';
      return fillDirection === positionType;
    })
    .sort((a: any, b: any) => b.time - a.time); // Most recent first
  
  // Return the most recent relevant fill
  return recentFills.length > 0 ? recentFills[0] : null;
}

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    logger.info(`Scheduled polling triggered: ${event.cron}`);
    
    try {
      await pollWalletActivity(env);
      logger.info('Scheduled polling completed successfully');
    } catch (error) {
      logger.error('Scheduled polling failed:', error);
      // Don't throw here to prevent worker from being marked as failed
    }
  },
};

