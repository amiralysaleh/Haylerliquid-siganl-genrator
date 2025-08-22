export interface PerformanceMetrics {
  signal_id: string;
  outcome: 'WIN' | 'LOSS' | 'PARTIAL';
  pnl: number;
  duration_sec: number;
  max_drawdown_pct: number;
  timeframe: string;
  updated_at: number;
}

export interface WalletPerformance {
  wallet_address: string;
  success_rate: number;
  win_loss_ratio: number;
  total_pnl: number;
  avg_pnl_per_trade: number;
  participation_rate: number;
  total_signals: number;
  wins: number;
  losses: number;
}

export class PerformanceCalculator {
  static calculatePnL(
    entryPrice: number,
    exitPrice: number,
    positionSize: number,
    signalType: 'LONG' | 'SHORT',
    fundingRate: number = 0,
    durationHours: number = 0
  ): number {
    const directionMultiplier = signalType === 'LONG' ? 1 : -1;
    const priceDiff = exitPrice - entryPrice;
    const tradePnL = directionMultiplier * priceDiff * positionSize;
    
    // Approximate funding cost (simplified)
    const fundingCost = fundingRate * positionSize * entryPrice * (durationHours / 8); // Assuming 8-hour funding intervals
    
    return tradePnL - fundingCost;
  }

  static calculateMaxDrawdown(
    entryPrice: number,
    priceHistory: { price: number; timestamp: number }[],
    signalType: 'LONG' | 'SHORT'
  ): number {
    let maxDrawdown = 0;
    
    for (const pricePoint of priceHistory) {
      const currentPnLPercent = signalType === 'LONG' 
        ? ((pricePoint.price - entryPrice) / entryPrice) * 100
        : ((entryPrice - pricePoint.price) / entryPrice) * 100;
      
      if (currentPnLPercent < maxDrawdown) {
        maxDrawdown = currentPnLPercent;
      }
    }
    
    return Math.abs(maxDrawdown);
  }

  static determineOutcome(
    status: string,
    pnl: number
  ): 'WIN' | 'LOSS' | 'PARTIAL' {
    if (status === 'TP_HIT') return 'WIN';
    if (status === 'SL_HIT') return 'LOSS';
    if (status === 'PARTIAL_TP') return 'PARTIAL';
    
    // For manually closed positions, use PnL
    return pnl > 0 ? 'WIN' : 'LOSS';
  }

  static async calculateWalletPerformance(
    db: D1Database,
    walletAddress: string,
    timeframe: string = 'all_time'
  ): Promise<WalletPerformance> {
    // Get all signals this wallet participated in
    const { results: signalParticipations } = await db.prepare(`
      SELECT s.signal_id, s.status, p.outcome, p.pnl
      FROM signal_wallets sw
      JOIN signals s ON sw.signal_id = s.signal_id
      LEFT JOIN performance p ON s.signal_id = p.signal_id AND p.timeframe = ?
      WHERE sw.wallet_address = ?
    `).bind(timeframe, walletAddress).all();

    const totalSignals = signalParticipations.length;
    if (totalSignals === 0) {
      return {
        wallet_address: walletAddress,
        success_rate: 0,
        win_loss_ratio: 0,
        total_pnl: 0,
        avg_pnl_per_trade: 0,
        participation_rate: 0,
        total_signals: 0,
        wins: 0,
        losses: 0,
      };
    }

    const wins = signalParticipations.filter((s: any) => s.outcome === 'WIN').length;
    const losses = signalParticipations.filter((s: any) => s.outcome === 'LOSS').length;
    const totalPnL = signalParticipations.reduce((sum: number, s: any) => sum + (s.pnl || 0), 0);

    // Get total signals in the system for participation rate
    const { results: totalSystemSignals } = await db.prepare(`
      SELECT COUNT(*) as count FROM signals
      WHERE created_at >= ? 
    `).bind(this.getTimeframeStartTimestamp(timeframe)).all();

    const systemSignalCount = (totalSystemSignals[0] as any)?.count || 1;

    return {
      wallet_address: walletAddress,
      success_rate: totalSignals > 0 ? (wins / totalSignals) * 100 : 0,
      win_loss_ratio: losses > 0 ? wins / losses : wins,
      total_pnl: totalPnL,
      avg_pnl_per_trade: totalSignals > 0 ? totalPnL / totalSignals : 0,
      participation_rate: (totalSignals / systemSignalCount) * 100,
      total_signals: totalSignals,
      wins,
      losses,
    };
  }

  private static getTimeframeStartTimestamp(timeframe: string): number {
    const now = Date.now();
    switch (timeframe) {
      case '24h': return now - 24 * 60 * 60 * 1000;
      case '7d': return now - 7 * 24 * 60 * 60 * 1000;
      case '30d': return now - 30 * 24 * 60 * 60 * 1000;
      case 'all_time':
      default: return 0;
    }
  }
}

