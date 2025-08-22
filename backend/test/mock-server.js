const express = require('express');
const app = express();
const port = 3001;

app.use(express.json());

// Mock Hyperliquid API responses
const mockWallets = {
  '0xecb63caa47c7c4e77f60f1ce858cf28dc2b82b00': {
    assetPositions: [
      {
        coin: 'ETH',
        position: {
          szi: '10.5',
          entryPx: '2450.50',
          leverage: { value: '5' }
        }
      }
    ]
  },
  '0x00c511ab1b583f4efab3608d0897d377c4de47a6': {
    assetPositions: [
      {
        coin: 'ETH',
        position: {
          szi: '8.2',
          entryPx: '2451.20',
          leverage: { value: '3' }
        }
      }
    ]
  }
};

const mockPrices = {
  'ETH': 2465.75,
  'BTC': 42150.30,
  'SOL': 98.45
};

// Hyperliquid clearinghouse state endpoint
app.post('/info', (req, res) => {
  const { type, user, coin } = req.body;
  
  console.log(`Mock API request: ${type}`, { user, coin });
  
  if (type === 'clearinghouseState' && user) {
    const walletData = mockWallets[user];
    if (walletData) {
      res.json(walletData);
    } else {
      res.json({ assetPositions: [] });
    }
    return;
  }
  
  if (type === 'userFills' && user) {
    // Mock recent fills
    res.json({
      fills: [
        {
          coin: 'ETH',
          side: 'B',
          px: '2450.50',
          sz: '10.5',
          time: Date.now() - 300000 // 5 minutes ago
        }
      ]
    });
    return;
  }
  
  if (type === 'metaAndAssetCtxs') {
    // Mock price data
    res.json({
      assetCtxs: Object.entries(mockPrices).map(([coin, price]) => ({
        coin,
        markPx: price.toString()
      }))
    });
    return;
  }
  
  if (type === 'fundingHistory' && coin) {
    res.json([
      {
        fundingRate: '0.0001',
        time: Date.now()
      }
    ]);
    return;
  }
  
  res.status(404).json({ error: 'Endpoint not found' });
});

// KuCoin price endpoint
app.get('/api/v1/market/orderbook/level1', (req, res) => {
  const symbol = req.query.symbol;
  const coin = symbol?.split('-')[0];
  
  console.log(`Mock KuCoin price request: ${symbol}`);
  
  if (coin && mockPrices[coin]) {
    res.json({
      data: {
        price: mockPrices[coin].toString(),
        time: Date.now()
      }
    });
  } else {
    res.status(404).json({ error: 'Symbol not found' });
  }
});

// Telegram Bot API mock
app.post('/bot:token/sendMessage', (req, res) => {
  const { chat_id, text } = req.body;
  
  console.log(`Mock Telegram message to ${chat_id}:`, text.substring(0, 100) + '...');
  
  res.json({
    ok: true,
    result: {
      message_id: Math.floor(Math.random() * 1000000),
      date: Math.floor(Date.now() / 1000),
      text: text
    }
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    endpoints: [
      'POST /info (Hyperliquid)',
      'GET /api/v1/market/orderbook/level1 (KuCoin)',
      'POST /bot:token/sendMessage (Telegram)'
    ]
  });
});

// Update mock data endpoint
app.post('/mock/update-position', (req, res) => {
  const { wallet, coin, size, price, leverage } = req.body;
  
  if (!mockWallets[wallet]) {
    mockWallets[wallet] = { assetPositions: [] };
  }
  
  // Find existing position or create new one
  let position = mockWallets[wallet].assetPositions.find(p => p.coin === coin);
  if (!position) {
    position = { coin, position: {} };
    mockWallets[wallet].assetPositions.push(position);
  }
  
  position.position = {
    szi: size.toString(),
    entryPx: price.toString(),
    leverage: { value: leverage.toString() }
  };
  
  console.log(`Updated mock position: ${wallet} ${coin} ${size} @ ${price}`);
  res.json({ success: true, wallet, coin, size, price, leverage });
});

app.post('/mock/update-price', (req, res) => {
  const { coin, price } = req.body;
  
  mockPrices[coin] = price;
  console.log(`Updated mock price: ${coin} = ${price}`);
  res.json({ success: true, coin, price });
});

app.listen(port, () => {
  console.log(`Mock API server running at http://localhost:${port}`);
  console.log('Available endpoints:');
  console.log('  POST /info - Hyperliquid API mock');
  console.log('  GET /api/v1/market/orderbook/level1 - KuCoin API mock');
  console.log('  POST /bot:token/sendMessage - Telegram Bot API mock');
  console.log('  GET /health - Health check');
  console.log('  POST /mock/update-position - Update mock wallet position');
  console.log('  POST /mock/update-price - Update mock price');
});

module.exports = app;

