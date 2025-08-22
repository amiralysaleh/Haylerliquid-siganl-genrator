# Deployment Guide

This guide provides step-by-step instructions for deploying the Hyperliquid Signal System to Cloudflare.

## Prerequisites Checklist

- [ ] Cloudflare account with Workers Paid plan (required for D1 and Queues)
- [ ] Wrangler CLI installed (`npm install -g wrangler`)
- [ ] Wrangler authenticated (`wrangler auth login`)
- [ ] Telegram Bot Token from @BotFather
- [ ] Telegram Chat ID where notifications will be sent

## Step 1: Create Cloudflare Resources

### 1.1 Create D1 Database

```bash
wrangler d1 create hyperliquid_signals
```

Save the database ID from the output. You'll need it for all wrangler.toml files.

### 1.2 Create Queues

```bash
wrangler queues create signal-events
wrangler queues create notification-events
```

## Step 2: Configure Environment Variables

### 2.1 Update Database IDs

Replace `<YOUR_D1_DATABASE_ID>` in all wrangler.toml files with your actual database ID:

- `backend/workers/ingestion/wrangler.toml`
- `backend/workers/signal-processor/wrangler.toml`
- `backend/workers/price-monitor/wrangler.toml`
- `backend/workers/performance-tracker/wrangler.toml`

### 2.2 Configure Telegram Settings

Update `backend/workers/notifier/wrangler.toml`:

```toml
[vars]
TELEGRAM_BOT_TOKEN = "your_actual_bot_token"
TELEGRAM_CHAT_ID = "your_actual_chat_id"
```

### 2.3 Configure API Endpoints

Update workers that need API access:

**Ingestion Worker** (`backend/workers/ingestion/wrangler.toml`):
```toml
[vars]
HYPERLIQUID_INFO_API = "https://api.hyperliquid.xyz/info"
```

**Price Monitor Worker** (`backend/workers/price-monitor/wrangler.toml`):
```toml
[vars]
HYPERLIQUID_INFO_API = "https://api.hyperliquid.xyz/info"
KUCOIN_API = "https://api.kucoin.com"
```

## Step 3: Initialize Database

### 3.1 Apply Initial Schema

```bash
wrangler d1 execute hyperliquid_signals --file=backend/db/migrations/0001_initial_schema.sql
```

### 3.2 Apply Performance Tables

```bash
wrangler d1 execute hyperliquid_signals --file=backend/db/migrations/0002_performance_tables.sql
```

### 3.3 Apply Schema Fixes and Improvements

```bash
wrangler d1 execute hyperliquid_signals --file=backend/db/migrations/0003_notification_log.sql
wrangler d1 execute hyperliquid_signals --file=backend/db/migrations/0004_schema_fixes.sql
```

### 3.4 Verify Database Setup

```bash
wrangler d1 execute hyperliquid_signals --command="SELECT name FROM sqlite_master WHERE type='table';"
```

You should see all the required tables listed.

## Step 4: Deploy Workers

Deploy each worker in the correct order:

### 4.1 Deploy Ingestion Worker

```bash
cd backend/workers/ingestion
wrangler deploy
```

### 4.2 Deploy Signal Processor Worker

```bash
cd ../signal-processor
wrangler deploy
```

### 4.3 Deploy Price Monitor Worker

```bash
cd ../price-monitor
wrangler deploy
```

### 4.4 Deploy Notifier Worker

```bash
cd ../notifier
wrangler deploy
```

### 4.5 Deploy Performance Tracker Worker

```bash
cd ../performance-tracker
wrangler deploy
```

## Step 5: Deploy Frontend

### 5.1 Build Frontend

```bash
cd ../../frontend/admin-panel
pnpm install
pnpm run build
```

### 5.2 Deploy to Cloudflare Pages

```bash
wrangler pages deploy dist --project-name hyperliquid-admin
```

Note the deployed URL for accessing the admin panel.

## Step 6: Configure Cron Triggers

The cron triggers are defined in the wrangler.toml files, but you can verify they're active:

```bash
wrangler cron list
```

## Step 7: Test Deployment

### 7.1 Test Database Connection

```bash
wrangler d1 execute hyperliquid_signals --command="SELECT COUNT(*) FROM wallets;"
```

### 7.2 Test Worker Health Endpoints

```bash
# Test ingestion worker
curl https://ingestion-worker.your-subdomain.workers.dev/health

# Test other workers similarly
```

### 7.3 Test Telegram Integration

Send a test message to verify Telegram integration:

```bash
# You can trigger this through the admin panel or by manually invoking the notifier
```

### 7.4 Test Admin Panel

1. Navigate to your deployed Pages URL
2. Verify all tabs load correctly
3. Test adding a wallet address
4. Check configuration settings

## Step 8: Production Configuration

### 8.1 Set Production Environment

Update all wrangler.toml files:

```toml
[vars]
ENVIRONMENT = "production"
```

### 8.2 Configure Monitoring

Set up Cloudflare Analytics and monitoring:

1. Enable Workers Analytics in the Cloudflare dashboard
2. Set up alerts for worker failures
3. Monitor D1 usage and performance

### 8.3 Security Settings

1. **Cloudflare Access**: Protect the admin panel
2. **API Rate Limiting**: Configure rate limits for external APIs
3. **Environment Variables**: Ensure all secrets are properly configured

## Step 9: Operational Procedures

### 9.1 Monitoring Checklist

- [ ] Workers are executing successfully
- [ ] Queues are processing messages
- [ ] Database operations are completing
- [ ] Telegram notifications are being sent
- [ ] Admin panel is accessible

### 9.2 Regular Maintenance

1. **Weekly**: Review performance metrics and error logs
2. **Monthly**: Update wallet lists and configuration
3. **Quarterly**: Review and optimize worker performance

### 9.3 Backup Procedures

```bash
# Export database for backup
wrangler d1 export hyperliquid_signals --output=backup-$(date +%Y%m%d).sql
```

## Troubleshooting Deployment Issues

### Common Problems

1. **Database ID Mismatch**
   - Verify the database ID in all wrangler.toml files
   - Check that the database exists: `wrangler d1 list`

2. **Queue Configuration Issues**
   - Verify queues exist: `wrangler queues list`
   - Check queue bindings in wrangler.toml files

3. **Worker Deployment Failures**
   - Check for TypeScript compilation errors
   - Verify all dependencies are installed
   - Review wrangler.toml syntax

4. **Telegram Integration Issues**
   - Verify bot token is correct
   - Ensure chat ID is valid (can be negative for groups)
   - Check bot permissions in the target chat

### Debug Commands

```bash
# View worker logs
wrangler tail ingestion-worker

# Check D1 database status
wrangler d1 info hyperliquid_signals

# List all deployed workers
wrangler list

# Check queue status
wrangler queues list
```

## Rollback Procedures

If deployment issues occur:

1. **Revert Worker Deployment**:
   ```bash
   wrangler rollback ingestion-worker
   ```

2. **Database Rollback**:
   ```bash
   # Restore from backup
   wrangler d1 execute hyperliquid_signals --file=backup-YYYYMMDD.sql
   ```

3. **Frontend Rollback**:
   ```bash
   # Redeploy previous version
   wrangler pages deploy previous-build-dir --project-name hyperliquid-admin
   ```

## Post-Deployment Verification

### Functional Tests

1. **Signal Generation**: Verify signals are being generated when conditions are met
2. **Price Monitoring**: Confirm price updates are working
3. **Notifications**: Test Telegram message delivery
4. **Performance Tracking**: Verify metrics are being calculated and stored

### Performance Tests

1. **Worker Response Times**: Monitor execution duration
2. **Database Performance**: Check query execution times
3. **Queue Processing**: Verify message processing rates
4. **API Rate Limits**: Ensure external API calls stay within limits

## Success Criteria

Deployment is successful when:

- [ ] All workers are deployed and healthy
- [ ] Database is initialized with correct schema
- [ ] Queues are processing messages
- [ ] Admin panel is accessible and functional
- [ ] Telegram notifications are working
- [ ] Initial wallet data is loaded
- [ ] Configuration is properly set
- [ ] Monitoring is active

## Next Steps

After successful deployment:

1. Add your wallet addresses through the admin panel
2. Configure signal detection parameters
3. Set up monitoring and alerting
4. Begin monitoring wallet activity
5. Review and adjust configuration based on initial results

