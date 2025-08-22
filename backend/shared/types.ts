export interface WalletPosition {
  wallet_address: string;
  pair: string;
  position_type: 'LONG' | 'SHORT';
  entry_timestamp: number;
  entry_price: number;
  trade_size: number;
  leverage: number;
  funding_rate: number;
  last_updated: number;
  open_event_id: string;
}

export interface SignalEvent {
  type: 'new_position' | 'position_update';
  data: WalletPosition;
}

export interface HyperliquidFill {
  coin: string;
  px: string;
  sz: string;
  time: number;
  side: 'B' | 'A'; // B for buy (long), A for sell (short)
  startPosition: string;
  endPosition: string;
  liquidation: boolean;
  // Add other fields as needed from Hyperliquid API
}

export interface HyperliquidClearinghouseState {
  assetPositions: Array<{
    coin: string;
    position: {
      coin: string;
      szi: string; // size in contracts
      entryPx: string;
      leverage: {
        value: string;
      };
      // Add other position related fields
    };
  }>;
  // Add other fields as needed from Hyperliquid API
}

export interface HyperliquidUserFills {
  fills: HyperliquidFill[];
}

export interface HyperliquidResponse {
  clearinghouseState: HyperliquidClearinghouseState;
  userFills: HyperliquidUserFills;
}

export interface Config {
  wallet_count: number;
  time_window_min: number;
  min_trade_size: number;
  ignored_pairs: string[];
  required_leverage_min: number;
  poll_interval_sec: number;
  monitored_pairs: string[];
}

export interface NotificationEvent {
  type: string;
  message: string;
  chat_id: string;
}


