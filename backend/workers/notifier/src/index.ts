import { NotificationEvent } from "../../../shared/types";
import { TelegramClient } from "../../../shared/api-clients";
import { DatabaseManager } from "../../../shared/database";
import { createLogger, validateEnvironment } from "../../../shared/utils";

interface Env {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  ENVIRONMENT?: string;
}

const logger = createLogger('Notifier');

export default {
  async queue(batch: MessageBatch<NotificationEvent>, env: Env): Promise<void> {
    logger.info(`Processing ${batch.messages.length} notification events`);
    
    try {
      // Validate environment
      validateEnvironment(['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID']);
      
      const telegramClient = new TelegramClient(env.TELEGRAM_BOT_TOKEN);
      const db = new DatabaseManager(env.DB);
      
      for (const message of batch.messages) {
        try {
          await processNotificationEvent(message.body, telegramClient, env.TELEGRAM_CHAT_ID, db);
          message.ack();
        } catch (error) {
          logger.error('Failed to process notification event:', error);
          message.retry();
        }
      }
      
      logger.info('Notification processing completed');
    } catch (error) {
      logger.error('Notification batch processing failed:', error);
      // Retry all messages in the batch
      for (const message of batch.messages) {
        message.retry();
      }
    }
  },
  
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  }
};

async function processNotificationEvent(
  event: NotificationEvent,
  telegramClient: TelegramClient,
  chatId: string,
  db: DatabaseManager
): Promise<void> {
  try {
    logger.debug(`Processing notification: ${event.type}`);
    
    // Format message based on type
    const formattedMessage = await formatMessage(event, db);
    
    // Send to Telegram
    const success = await telegramClient.sendMessage(chatId, formattedMessage);
    
    if (success) {
      logger.info(`Notification sent successfully: ${event.type}`);
      
      // Log notification for audit trail
      await logNotification(event, db);
    } else {
      throw new Error('Failed to send Telegram message');
    }
    
  } catch (error) {
    logger.error('Failed to process notification event:', error);
    throw error;
  }
}

async function formatMessage(event: NotificationEvent, db: DatabaseManager): Promise<string> {
  try {
    // Add system branding and timestamp
    const timestamp = new Date().toISOString();
    const header = "🔔 **Hyperliquid Signal System**\n\n";
    const footer = `\n\n⏰ ${timestamp}`;
    
    let formattedMessage = event.message;
    
    // Enhance message based on type
    switch (event.type) {
      case 'new_signal':
        formattedMessage = await enhanceSignalMessage(formattedMessage, db);
        break;
      case 'SL_HIT':
        formattedMessage = enhanceStopLossMessage(formattedMessage);
        break;
      case 'TP_HIT':
      case 'PARTIAL_TP':
        formattedMessage = enhanceTakeProfitMessage(formattedMessage);
        break;
      default:
        // Use message as-is for other types
        break;
    }
    
    return header + formattedMessage + footer;
    
  } catch (error) {
    logger.error('Failed to format message:', error);
    // Return original message if formatting fails
    return event.message;
  }
}

async function enhanceSignalMessage(message: string, db: DatabaseManager): Promise<string> {
  try {
    // Extract signal ID from message if present
    const signalIdMatch = message.match(/Signal ID:\s*([a-f0-9-]+)/i);
    if (!signalIdMatch) {
      return message;
    }
    
    const signalId = signalIdMatch[1];
    
    // Get additional signal context
    const { results } = await db.db.prepare(`
      SELECT 
        s.pair,
        s.type,
        COUNT(sw.wallet_address) as wallet_count,
        AVG(sw.leverage) as avg_leverage
      FROM signals s
      LEFT JOIN signal_wallets sw ON s.signal_id = sw.signal_id
      WHERE s.signal_id = ?
      GROUP BY s.signal_id
    `).bind(signalId).all();
    
    if (results.length > 0) {
      const signalData = results[0] as any;
      const avgLeverage = Math.round(signalData.avg_leverage || 1);
      
      // Add leverage info to message
      message += `\n**Average Leverage:** ${avgLeverage}x`;
      
      // Add confidence indicator based on wallet count
      const confidence = getConfidenceLevel(signalData.wallet_count);
      message += `\n**Confidence:** ${confidence}`;
    }
    
    return message;
    
  } catch (error) {
    logger.error('Failed to enhance signal message:', error);
    return message;
  }
}

function enhanceStopLossMessage(message: string): string {
  // Add risk management reminder
  return message + "\n\n⚠️ **Risk Management Reminder:**\nAlways use proper position sizing and never risk more than you can afford to lose.";
}

function enhanceTakeProfitMessage(message: string): string {
  // Add profit-taking advice
  return message + "\n\n💡 **Profit Management:**\nConsider securing partial profits and adjusting stop losses to breakeven.";
}

function getConfidenceLevel(walletCount: number): string {
  if (walletCount >= 10) return "🟢 High";
  if (walletCount >= 7) return "🟡 Medium";
  if (walletCount >= 5) return "🟠 Low";
  return "🔴 Very Low";
}

async function logNotification(event: NotificationEvent, db: DatabaseManager): Promise<void> {
  try {
    await db.db.prepare(`
      INSERT INTO notification_log (type, message, sent_at, status)
      VALUES (?, ?, ?, 'sent')
    `).bind(
      event.type,
      event.message.substring(0, 500), // Truncate for storage
      Date.now()
    ).run();
    
    logger.debug(`Notification logged: ${event.type}`);
    
  } catch (error) {
    logger.error('Failed to log notification:', error);
    // Don't throw here as notification was already sent
  }
}

// Health check endpoint for manual testing
async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  
  if (url.pathname === '/health') {
    return new Response(JSON.stringify({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      telegram_configured: !!env.TELEGRAM_BOT_TOKEN
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  if (url.pathname === '/test' && request.method === 'POST') {
    try {
      validateEnvironment(['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID']);
      
      const telegramClient = new TelegramClient(env.TELEGRAM_BOT_TOKEN);
      
      const testMessage = "🧪 **Test Notification**\n\nThis is a test message from the Hyperliquid Signal System.\n\n✅ Telegram integration is working correctly!";
      
      const success = await telegramClient.sendMessage(env.TELEGRAM_CHAT_ID, testMessage);
      
      if (success) {
        return new Response(JSON.stringify({
          status: 'success',
          message: 'Test notification sent successfully'
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } else {
        throw new Error('Failed to send test message');
      }
      
    } catch (error) {
      logger.error('Test notification failed:', error);
      return new Response(JSON.stringify({
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
  
  return new Response('Not Found', { status: 404 });
}

