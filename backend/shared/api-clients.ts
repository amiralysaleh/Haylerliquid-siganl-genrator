import { withRetry, fetchWithTimeout, ApiError, RateLimiter, createLogger } from './utils';
import { HyperliquidResponse, HyperliquidClearinghouseState, HyperliquidUserFills } from './types';

const logger = createLogger('API-Clients');

export class HyperliquidClient {
  private rateLimiter = new RateLimiter(10, 1000); // 10 requests per second
  
  constructor(private baseUrl: string = 'https://api.hyperliquid.xyz/info') {}
  
  async getClearinghouseState(walletAddress: string): Promise<HyperliquidClearinghouseState | null> {
    return withRetry(async () => {
      await this.rateLimiter.waitForSlot();
      
      const response = await fetchWithTimeout(this.baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'clearinghouseState',
          user: walletAddress,
        }),
        timeout: 10000
      });
      
      if (!response.ok) {
        if (response.status === 429) {
          throw new ApiError('Rate limited', response.status);
        }
        if (response.status >= 500) {
          throw new ApiError(`Server error: ${response.statusText}`, response.status);
        }
        logger.warn(`Non-retryable error for wallet ${walletAddress}:`, response.status);
        return null;
      }
      
      const data = await response.json();
      logger.debug(`Fetched clearinghouse state for ${walletAddress}`, { positionCount: data.assetPositions?.length || 0 });
      
      return data;
    });
  }
  
  async getUserFills(walletAddress: string): Promise<HyperliquidUserFills | null> {
    return withRetry(async () => {
      await this.rateLimiter.waitForSlot();
      
      const response = await fetchWithTimeout(this.baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'userFills',
          user: walletAddress,
        }),
        timeout: 10000
      });
      
      if (!response.ok) {
        if (response.status === 429) {
          throw new ApiError('Rate limited', response.status);
        }
        if (response.status >= 500) {
          throw new ApiError(`Server error: ${response.statusText}`, response.status);
        }
        logger.warn(`Non-retryable error for wallet fills ${walletAddress}:`, response.status);
        return null;
      }
      
      const data = await response.json();
      logger.debug(`Fetched user fills for ${walletAddress}`, { fillCount: data.fills?.length || 0 });
      
      return data;
    });
  }
  
  async getMarkPrice(pair: string): Promise<number | null> {
    return withRetry(async () => {
      await this.rateLimiter.waitForSlot();
      
      const response = await fetchWithTimeout(this.baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'metaAndAssetCtxs',
        }),
        timeout: 10000
      });
      
      if (!response.ok) {
        throw new ApiError(`Failed to fetch mark price for ${pair}: ${response.statusText}`, response.status);
      }
      
      const data = await response.json();
      
      // Find the specific pair in the response
      if (data && data.assetCtxs) {
        for (const assetCtx of data.assetCtxs) {
          if (assetCtx.coin === pair && assetCtx.markPx) {
            const price = parseFloat(assetCtx.markPx);
            logger.debug(`Fetched mark price for ${pair}:`, price);
            return price;
          }
        }
      }
      
      logger.warn(`Mark price not found for pair: ${pair}`);
      return null;
    });
  }
  
  async getFundingRate(pair: string): Promise<number | null> {
    return withRetry(async () => {
      await this.rateLimiter.waitForSlot();
      
      const response = await fetchWithTimeout(this.baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'fundingHistory',
          coin: pair,
        }),
        timeout: 10000
      });
      
      if (!response.ok) {
        throw new ApiError(`Failed to fetch funding rate for ${pair}: ${response.statusText}`, response.status);
      }
      
      const data = await response.json();
      
      // Get the most recent funding rate
      if (data && Array.isArray(data) && data.length > 0) {
        const latestFunding = data[data.length - 1];
        const fundingRate = parseFloat(latestFunding.fundingRate || '0');
        logger.debug(`Fetched funding rate for ${pair}:`, fundingRate);
        return fundingRate;
      }
      
      return 0; // Default to 0 if no funding data
    });
  }
}

export class KuCoinClient {
  private rateLimiter = new RateLimiter(100, 60000); // 100 requests per minute
  private priceCache = new Map<string, { price: number; timestamp: number }>();
  private cacheTimeout = 10000; // 10 seconds
  
  constructor(private baseUrl: string = 'https://api.kucoin.com') {}
  
  async getPrice(pair: string): Promise<number | null> {
    const symbol = `${pair}-USDT`;
    
    // Check cache first
    const cached = this.priceCache.get(symbol);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      logger.debug(`Using cached price for ${symbol}:`, cached.price);
      return cached.price;
    }
    
    return withRetry(async () => {
      await this.rateLimiter.waitForSlot();
      
      const response = await fetchWithTimeout(`${this.baseUrl}/api/v1/market/orderbook/level1?symbol=${symbol}`, {
        timeout: 10000
      });
      
      if (!response.ok) {
        if (response.status === 429) {
          throw new ApiError('Rate limited', response.status);
        }
        throw new ApiError(`Failed to fetch KuCoin price for ${symbol}: ${response.statusText}`, response.status);
      }
      
      const data = await response.json();
      
      if (data && data.data && data.data.price) {
        const price = parseFloat(data.data.price);
        
        // Cache the result
        this.priceCache.set(symbol, { price, timestamp: Date.now() });
        
        logger.debug(`Fetched KuCoin price for ${symbol}:`, price);
        return price;
      }
      
      logger.warn(`Price not found for symbol: ${symbol}`);
      return null;
    });
  }
  
  async getCandles(pair: string, interval: string = '1min', startAt?: number, endAt?: number): Promise<any[] | null> {
    const symbol = `${pair}-USDT`;
    
    return withRetry(async () => {
      await this.rateLimiter.waitForSlot();
      
      let url = `${this.baseUrl}/api/v1/market/candles?symbol=${symbol}&type=${interval}`;
      if (startAt) url += `&startAt=${startAt}`;
      if (endAt) url += `&endAt=${endAt}`;
      
      const response = await fetchWithTimeout(url, {
        timeout: 15000
      });
      
      if (!response.ok) {
        throw new ApiError(`Failed to fetch KuCoin candles for ${symbol}: ${response.statusText}`, response.status);
      }
      
      const data = await response.json();
      
      if (data && data.data) {
        logger.debug(`Fetched KuCoin candles for ${symbol}:`, { count: data.data.length });
        return data.data;
      }
      
      return null;
    });
  }
  
  clearCache(): void {
    this.priceCache.clear();
    logger.debug('KuCoin price cache cleared');
  }
}

export class TelegramClient {
  private rateLimiter = new RateLimiter(30, 1000); // 30 messages per second
  
  constructor(private botToken: string) {}
  
  async sendMessage(chatId: string, text: string, parseMode: 'HTML' | 'MarkdownV2' | undefined = undefined): Promise<boolean> {
    return withRetry(async () => {
      await this.rateLimiter.waitForSlot();
      
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
      
      const payload: any = {
        chat_id: chatId,
        text: text,
      };
      
      if (parseMode) {
        payload.parse_mode = parseMode;
      }
      
      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        timeout: 10000
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new ApiError(`Telegram API error: ${response.status} ${response.statusText} - ${errorText}`, response.status);
      }
      
      logger.debug('Telegram message sent successfully');
      return true;
    });
  }
  
  async sendFormattedSignalAlert(
    chatId: string,
    pair: string,
    type: 'LONG' | 'SHORT',
    entryPrice: number,
    walletCount: number,
    stopLoss: number,
    targets: number[]
  ): Promise<boolean> {
    const emoji = type === 'LONG' ? '🟢' : '🔴';
    const slPrice = type === 'LONG' 
      ? entryPrice * (1 + stopLoss / 100)
      : entryPrice * (1 - stopLoss / 100);
    
    const targetPrices = targets.map(tp => 
      type === 'LONG' 
        ? entryPrice * (1 + tp / 100)
        : entryPrice * (1 - tp / 100)
    );
    
    const message = `
${emoji} **NEW SIGNAL DETECTED** ${emoji}

**Pair:** ${pair}
**Direction:** ${type}
**Entry Price:** $${entryPrice.toFixed(2)}
**Wallets:** ${walletCount}

**Stop Loss:** $${slPrice.toFixed(2)} (${stopLoss.toFixed(1)}%)
**Take Profits:**
${targetPrices.map((price, i) => `  TP${i + 1}: $${price.toFixed(2)} (${targets[i].toFixed(1)}%)`).join('\n')}

**Time:** ${new Date().toISOString()}
    `.trim();
    
    return this.sendMessage(chatId, message);
  }
  
  async sendPriceAlert(
    chatId: string,
    pair: string,
    type: 'LONG' | 'SHORT',
    alertType: 'SL_HIT' | 'TP_HIT' | 'PARTIAL_TP',
    currentPrice: number,
    signalId: string
  ): Promise<boolean> {
    const emoji = alertType === 'SL_HIT' ? '🚨' : '🎯';
    const alertText = alertType === 'SL_HIT' ? 'STOP LOSS HIT' : 
                     alertType === 'TP_HIT' ? 'TAKE PROFIT HIT' : 'PARTIAL TAKE PROFIT';
    
    const message = `
${emoji} **${alertText}** ${emoji}

**Pair:** ${pair}
**Direction:** ${type}
**Price:** $${currentPrice.toFixed(2)}
**Signal ID:** ${signalId}

**Time:** ${new Date().toISOString()}
    `.trim();
    
    return this.sendMessage(chatId, message);
  }
}

