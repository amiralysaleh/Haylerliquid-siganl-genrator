import { Config } from './types';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export function isValidWalletAddress(address: string): boolean {
  if (!address || typeof address !== 'string') {
    return false;
  }
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export function isValidPrice(price: number): boolean {
  return typeof price === 'number' && 
         price > 0 && 
         price < 10000000 && // Reasonable upper bound
         !isNaN(price) && 
         isFinite(price);
}

export function isValidLeverage(leverage: number): boolean {
  return typeof leverage === 'number' && 
         leverage >= 1 && 
         leverage <= 100 && 
         Number.isInteger(leverage);
}

export function isValidPair(pair: string): boolean {
  if (!pair || typeof pair !== 'string') {
    return false;
  }
  return /^[A-Z]{2,10}$/.test(pair);
}

export function isValidPositionType(type: string): boolean {
  return type === 'LONG' || type === 'SHORT';
}

export function isValidTimestamp(timestamp: number): boolean {
  return typeof timestamp === 'number' && 
         timestamp > 0 && 
         timestamp <= Date.now() + 86400000 && // Not more than 1 day in future
         Number.isInteger(timestamp);
}

export function isValidTradeSize(size: number): boolean {
  return typeof size === 'number' && 
         size > 0 && 
         size < 1000000 && // Reasonable upper bound
         !isNaN(size) && 
         isFinite(size);
}

export function validateConfig(config: Partial<Config>): ValidationResult {
  const errors: string[] = [];
  
  if (config.wallet_count !== undefined) {
    if (!Number.isInteger(config.wallet_count) || config.wallet_count < 1 || config.wallet_count > 50) {
      errors.push('Wallet count must be an integer between 1 and 50');
    }
  }
  
  if (config.time_window_min !== undefined) {
    if (!Number.isInteger(config.time_window_min) || config.time_window_min < 1 || config.time_window_min > 60) {
      errors.push('Time window must be an integer between 1 and 60 minutes');
    }
  }
  
  if (config.min_trade_size !== undefined) {
    if (!isValidTradeSize(config.min_trade_size)) {
      errors.push('Minimum trade size must be a positive number');
    }
  }
  
  if (config.required_leverage_min !== undefined) {
    if (!isValidLeverage(config.required_leverage_min)) {
      errors.push('Required minimum leverage must be an integer between 1 and 100');
    }
  }
  
  if (config.poll_interval_sec !== undefined) {
    if (!Number.isInteger(config.poll_interval_sec) || config.poll_interval_sec < 30 || config.poll_interval_sec > 300) {
      errors.push('Poll interval must be an integer between 30 and 300 seconds');
    }
  }
  
  if (config.ignored_pairs !== undefined) {
    if (!Array.isArray(config.ignored_pairs)) {
      errors.push('Ignored pairs must be an array');
    } else {
      for (const pair of config.ignored_pairs) {
        if (!isValidPair(pair)) {
          errors.push(`Invalid pair in ignored list: ${pair}`);
        }
      }
    }
  }
  
  if (config.monitored_pairs !== undefined) {
    if (!Array.isArray(config.monitored_pairs)) {
      errors.push('Monitored pairs must be an array');
    } else {
      for (const pair of config.monitored_pairs) {
        if (!isValidPair(pair)) {
          errors.push(`Invalid pair in monitored list: ${pair}`);
        }
      }
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

export function validateWalletPosition(position: any): ValidationResult {
  const errors: string[] = [];
  
  if (!isValidWalletAddress(position.wallet_address)) {
    errors.push('Invalid wallet address format');
  }
  
  if (!isValidPair(position.pair)) {
    errors.push('Invalid trading pair format');
  }
  
  if (!isValidPositionType(position.position_type)) {
    errors.push('Position type must be LONG or SHORT');
  }
  
  if (!isValidTimestamp(position.entry_timestamp)) {
    errors.push('Invalid entry timestamp');
  }
  
  if (!isValidPrice(position.entry_price)) {
    errors.push('Invalid entry price');
  }
  
  if (!isValidTradeSize(position.trade_size)) {
    errors.push('Invalid trade size');
  }
  
  if (position.leverage !== undefined && !isValidLeverage(position.leverage)) {
    errors.push('Invalid leverage value');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

export function validateSignalData(signal: any): ValidationResult {
  const errors: string[] = [];
  
  if (!signal.signal_id || typeof signal.signal_id !== 'string') {
    errors.push('Signal ID is required and must be a string');
  }
  
  if (!isValidPair(signal.pair)) {
    errors.push('Invalid trading pair format');
  }
  
  if (!isValidPositionType(signal.type)) {
    errors.push('Signal type must be LONG or SHORT');
  }
  
  if (!isValidPrice(signal.entry_price)) {
    errors.push('Invalid entry price');
  }
  
  if (signal.avg_trade_size !== undefined && !isValidTradeSize(signal.avg_trade_size)) {
    errors.push('Invalid average trade size');
  }
  
  if (signal.stop_loss !== undefined) {
    if (typeof signal.stop_loss !== 'number' || signal.stop_loss >= 0 || signal.stop_loss < -50) {
      errors.push('Stop loss must be a negative percentage between 0 and -50');
    }
  }
  
  if (signal.targets_json) {
    try {
      const targets = JSON.parse(signal.targets_json);
      if (!Array.isArray(targets)) {
        errors.push('Targets must be an array');
      } else {
        for (const target of targets) {
          if (typeof target !== 'number' || target <= 0 || target > 100) {
            errors.push('Each target must be a positive percentage less than 100%');
          }
        }
      }
    } catch (e) {
      errors.push('Invalid targets JSON format');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

export function sanitizeInput(input: any): any {
  if (typeof input === 'string') {
    // Remove potentially dangerous characters
    return input.replace(/[<>\"'&]/g, '').trim();
  }
  
  if (typeof input === 'number') {
    // Ensure number is finite and not NaN
    return isFinite(input) && !isNaN(input) ? input : 0;
  }
  
  if (Array.isArray(input)) {
    return input.map(sanitizeInput);
  }
  
  if (typeof input === 'object' && input !== null) {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(input)) {
      sanitized[sanitizeInput(key)] = sanitizeInput(value);
    }
    return sanitized;
  }
  
  return input;
}

export function validateAndSanitizeConfig(config: any): { config: Partial<Config>; errors: string[] } {
  const sanitized = sanitizeInput(config);
  const validation = validateConfig(sanitized);
  
  return {
    config: sanitized,
    errors: validation.errors
  };
}

export function validateTelegramMessage(message: string): ValidationResult {
  const errors: string[] = [];
  
  if (!message || typeof message !== 'string') {
    errors.push('Message must be a non-empty string');
  } else {
    if (message.length > 4096) {
      errors.push('Message exceeds Telegram limit of 4096 characters');
    }
    
    if (message.trim().length === 0) {
      errors.push('Message cannot be empty or only whitespace');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

export function validateChatId(chatId: string): ValidationResult {
  const errors: string[] = [];
  
  if (!chatId || typeof chatId !== 'string') {
    errors.push('Chat ID must be a non-empty string');
  } else {
    // Telegram chat IDs can be positive (user) or negative (group/channel)
    if (!/^-?\d+$/.test(chatId)) {
      errors.push('Chat ID must be a valid Telegram chat identifier');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

