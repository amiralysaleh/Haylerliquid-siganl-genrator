import { PerformanceCalculator, WalletPerformance } from "../../../shared/performance";

interface Env {
  DB: D1Database;
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`Performance tracker worker triggered by cron: ${event.cron}`);

    // 1. Update wallet performance metrics for all active wallets
    const { results: activeWallets } = await env.DB.prepare(
      'SELECT address FROM wallets WHERE is_active = 1'
    ).all();

    const timeframes = ['24h', '7d', '30d', 'all_time'];

    for (const wallet of activeWallets as { address: string }[]) {
      for (const timeframe of timeframes) {
        try {
          const performance = await PerformanceCalculator.calculateWalletPerformance(
            env.DB,
            wallet.address,
            timeframe
          );

          // Store or update wallet performance metrics
          await env.DB.prepare(`
            INSERT OR REPLACE INTO wallet_performance (
              wallet_address, timeframe, success_rate, win_loss_ratio, total_pnl,
              avg_pnl_per_trade, participation_rate, total_signals, wins, losses, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            performance.wallet_address,
            timeframe,
            performance.success_rate,
            performance.win_loss_ratio,
            performance.total_pnl,
            performance.avg_pnl_per_trade,
            performance.participation_rate,
            performance.total_signals,
            performance.wins,
            performance.losses,
            Date.now()
          ).run();

          console.log(`Updated performance for wallet ${wallet.address} (${timeframe}): ${performance.success_rate.toFixed(1)}% success rate`);
        } catch (error) {
          console.error(`Error calculating performance for wallet ${wallet.address} (${timeframe}):`, error);
        }
      }
    }

    // 2. Generate system-wide performance summary
    await generateSystemPerformanceSummary(env);

    // 3. Clean up old performance data (optional)
    await cleanupOldPerformanceData(env);

    console.log("Performance tracker worker completed successfully");
  },
};

async function generateSystemPerformanceSummary(env: Env): Promise<void> {
  const timeframes = ['24h', '7d', '30d', 'all_time'];

  for (const timeframe of timeframes) {
    try {
      // Calculate system-wide metrics
      const { results: systemMetrics } = await env.DB.prepare(`
        SELECT 
          COUNT(*) as total_signals,
          SUM(CASE WHEN outcome = 'WIN' THEN 1 ELSE 0 END) as total_wins,
          SUM(CASE WHEN outcome = 'LOSS' THEN 1 ELSE 0 END) as total_losses,
          AVG(pnl) as avg_pnl,
          SUM(pnl) as total_pnl,
          AVG(duration_sec) as avg_duration_sec,
          AVG(max_drawdown_pct) as avg_max_drawdown
        FROM performance 
        WHERE timeframe = ?
      `).bind(timeframe).all();

      const metrics = systemMetrics[0] as any;
      if (metrics && metrics.total_signals > 0) {
        const successRate = (metrics.total_wins / metrics.total_signals) * 100;
        const winLossRatio = metrics.total_losses > 0 ? metrics.total_wins / metrics.total_losses : metrics.total_wins;

        // Store system performance summary
        await env.DB.prepare(`
          INSERT OR REPLACE INTO system_performance (
            timeframe, total_signals, total_wins, total_losses, success_rate,
            win_loss_ratio, avg_pnl, total_pnl, avg_duration_sec, avg_max_drawdown, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          timeframe,
          metrics.total_signals,
          metrics.total_wins,
          metrics.total_losses,
          successRate,
          winLossRatio,
          metrics.avg_pnl,
          metrics.total_pnl,
          metrics.avg_duration_sec,
          metrics.avg_max_drawdown,
          Date.now()
        ).run();

        console.log(`System performance summary updated for ${timeframe}: ${successRate.toFixed(1)}% success rate`);
      }
    } catch (error) {
      console.error(`Error generating system performance summary for ${timeframe}:`, error);
    }
  }
}

async function cleanupOldPerformanceData(env: Env): Promise<void> {
  try {
    // Remove performance data older than 90 days for non-all_time timeframes
    const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
    
    await env.DB.prepare(`
      DELETE FROM performance 
      WHERE timeframe != 'all_time' AND updated_at < ?
    `).bind(ninetyDaysAgo).run();

    console.log("Old performance data cleaned up");
  } catch (error) {
    console.error("Error cleaning up old performance data:", error);
  }
}

