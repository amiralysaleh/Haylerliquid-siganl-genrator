export interface RetryOptions {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public response?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class RetryableError extends Error {
  constructor(message: string, public originalError?: Error) {
    super(message);
    this.name = 'RetryableError';
  }
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2
  }
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry on non-retryable errors
      if (error instanceof ApiError && error.status && error.status < 500) {
        throw error;
      }
      
      if (attempt === options.maxRetries) {
        throw lastError;
      }
      
      const delay = Math.min(
        options.baseDelay * Math.pow(options.backoffMultiplier, attempt),
        options.maxDelay
      );
      
      // Add jitter to prevent thundering herd
      const jitteredDelay = delay + Math.random() * 1000;
      
      console.warn(`Attempt ${attempt + 1} failed, retrying in ${jitteredDelay}ms:`, error);
      await sleep(jitteredDelay);
    }
  }
  
  throw lastError!;
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number } = {}
): Promise<Response> {
  const { timeout = 10000, ...fetchOptions } = options;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new RetryableError(`Request timeout after ${timeout}ms`);
    }
    throw error;
  }
}

export function validateEnvironment(requiredVars: string[]): void {
  const missing = requiredVars.filter(varName => !process.env[varName]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

export function sanitizeForLogging(data: any): any {
  if (typeof data !== 'object' || data === null) {
    return data;
  }
  
  const sensitiveKeys = ['token', 'key', 'secret', 'password', 'auth'];
  const sanitized = { ...data };
  
  for (const key in sanitized) {
    if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
      sanitized[key] = '[REDACTED]';
    }
  }
  
  return sanitized;
}

export function createLogger(workerName: string) {
  return {
    info: (message: string, data?: any) => {
      console.log(`[${workerName}] INFO: ${message}`, data ? sanitizeForLogging(data) : '');
    },
    warn: (message: string, data?: any) => {
      console.warn(`[${workerName}] WARN: ${message}`, data ? sanitizeForLogging(data) : '');
    },
    error: (message: string, error?: Error | any) => {
      console.error(`[${workerName}] ERROR: ${message}`, error);
    },
    debug: (message: string, data?: any) => {
      if (process.env.ENVIRONMENT === 'development') {
        console.log(`[${workerName}] DEBUG: ${message}`, data ? sanitizeForLogging(data) : '');
      }
    }
  };
}

export function generateEventId(walletAddress: string, pair: string, timestamp: number, direction: string): string {
  // Create deterministic event ID for idempotency
  const data = `${walletAddress}-${pair}-${direction}-${Math.floor(timestamp / 60000)}`; // Round to minute
  return btoa(data).replace(/[^a-zA-Z0-9]/g, '').substring(0, 32);
}

export function isValidWalletAddress(address: string): boolean {
  // Basic Ethereum address validation
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export function calculateNotionalValue(price: number, size: number, contractMultiplier: number = 1): number {
  return price * size * contractMultiplier;
}

export function formatPrice(price: number, decimals: number = 2): string {
  return price.toFixed(decimals);
}

export function formatPercentage(value: number, decimals: number = 2): string {
  return `${value.toFixed(decimals)}%`;
}

export function isWithinTimeWindow(timestamp: number, windowMs: number): boolean {
  return Date.now() - timestamp <= windowMs;
}

export function batchArray<T>(array: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < array.length; i += batchSize) {
    batches.push(array.slice(i, i + batchSize));
  }
  return batches;
}

export class RateLimiter {
  private requests: number[] = [];
  
  constructor(
    private maxRequests: number,
    private windowMs: number
  ) {}
  
  async waitForSlot(): Promise<void> {
    const now = Date.now();
    
    // Remove old requests outside the window
    this.requests = this.requests.filter(time => now - time < this.windowMs);
    
    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = Math.min(...this.requests);
      const waitTime = this.windowMs - (now - oldestRequest) + 100; // Add small buffer
      
      if (waitTime > 0) {
        await sleep(waitTime);
        return this.waitForSlot(); // Recursive call after waiting
      }
    }
    
    this.requests.push(now);
  }
}

export function createCircuitBreaker(
  failureThreshold: number = 5,
  resetTimeoutMs: number = 60000
) {
  let failures = 0;
  let lastFailureTime = 0;
  let state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  
  return {
    async execute<T>(operation: () => Promise<T>): Promise<T> {
      const now = Date.now();
      
      // Reset if enough time has passed
      if (state === 'OPEN' && now - lastFailureTime > resetTimeoutMs) {
        state = 'HALF_OPEN';
        failures = 0;
      }
      
      if (state === 'OPEN') {
        throw new Error('Circuit breaker is OPEN');
      }
      
      try {
        const result = await operation();
        
        // Success - reset if we were in HALF_OPEN
        if (state === 'HALF_OPEN') {
          state = 'CLOSED';
          failures = 0;
        }
        
        return result;
      } catch (error) {
        failures++;
        lastFailureTime = now;
        
        if (failures >= failureThreshold) {
          state = 'OPEN';
        }
        
        throw error;
      }
    },
    
    getState: () => ({ state, failures, lastFailureTime })
  };
}

