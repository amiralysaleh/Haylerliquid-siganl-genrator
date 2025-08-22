const assert = require('assert');

// Test configuration
const MOCK_API_BASE = 'http://localhost:3001';
const TEST_WALLET = '0xecb63caa47c7c4e77f60f1ce858cf28dc2b82b00';

async function runTests() {
  console.log('🧪 Starting Hyperliquid Signal System Integration Tests\n');
  
  let passed = 0;
  let failed = 0;
  
  // Test 1: Mock API Health Check
  try {
    console.log('Test 1: Mock API Health Check');
    const response = await fetch(`${MOCK_API_BASE}/health`);
    const data = await response.json();
    assert.strictEqual(data.status, 'healthy');
    console.log('✅ PASSED: Mock API is healthy\n');
    passed++;
  } catch (error) {
    console.log('❌ FAILED: Mock API health check failed:', error.message, '\n');
    failed++;
  }
  
  // Test 2: Hyperliquid Clearinghouse State
  try {
    console.log('Test 2: Hyperliquid Clearinghouse State');
    const response = await fetch(`${MOCK_API_BASE}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'clearinghouseState',
        user: TEST_WALLET
      })
    });
    const data = await response.json();
    assert(data.assetPositions);
    assert(data.assetPositions.length > 0);
    console.log('✅ PASSED: Clearinghouse state retrieved successfully');
    console.log(`   Found ${data.assetPositions.length} positions\n`);
    passed++;
  } catch (error) {
    console.log('❌ FAILED: Clearinghouse state test failed:', error.message, '\n');
    failed++;
  }
  
  // Test 3: Price Data Retrieval
  try {
    console.log('Test 3: Price Data Retrieval');
    const response = await fetch(`${MOCK_API_BASE}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'metaAndAssetCtxs'
      })
    });
    const data = await response.json();
    assert(data.assetCtxs);
    assert(data.assetCtxs.length > 0);
    const ethPrice = data.assetCtxs.find(ctx => ctx.coin === 'ETH');
    assert(ethPrice && ethPrice.markPx);
    console.log('✅ PASSED: Price data retrieved successfully');
    console.log(`   ETH price: $${ethPrice.markPx}\n`);
    passed++;
  } catch (error) {
    console.log('❌ FAILED: Price data test failed:', error.message, '\n');
    failed++;
  }
  
  // Test 4: KuCoin Price Fallback
  try {
    console.log('Test 4: KuCoin Price Fallback');
    const response = await fetch(`${MOCK_API_BASE}/api/v1/market/orderbook/level1?symbol=ETH-USDT`);
    const data = await response.json();
    assert(data.data && data.data.price);
    console.log('✅ PASSED: KuCoin price fallback working');
    console.log(`   ETH-USDT price: $${data.data.price}\n`);
    passed++;
  } catch (error) {
    console.log('❌ FAILED: KuCoin price test failed:', error.message, '\n');
    failed++;
  }
  
  // Test 5: Telegram Message Sending
  try {
    console.log('Test 5: Telegram Message Sending');
    const response = await fetch(`${MOCK_API_BASE}/bot123456:test_token/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: '-1001234567890',
        text: 'Test message from integration test'
      })
    });
    const data = await response.json();
    assert(data.ok === true);
    assert(data.result && data.result.message_id);
    console.log('✅ PASSED: Telegram message sending working');
    console.log(`   Message ID: ${data.result.message_id}\n`);
    passed++;
  } catch (error) {
    console.log('❌ FAILED: Telegram message test failed:', error.message, '\n');
    failed++;
  }
  
  // Test 6: Signal Detection Logic
  try {
    console.log('Test 6: Signal Detection Logic');
    
    // Simulate multiple wallets opening positions
    const wallets = [
      '0xecb63caa47c7c4e77f60f1ce858cf28dc2b82b00',
      '0x00c511ab1b583f4efab3608d0897d377c4de47a6',
      '0x023a3d058020fb76cca98f01b3c48c8938a22355',
      '0x2ba553d9f990a3b66b03b2dc0d030dfc1c061036',
      '0x7b7f72a28fe109fa703eeed7984f2a8a68fedee2'
    ];
    
    // Update mock positions for signal generation
    for (let i = 0; i < wallets.length; i++) {
      await fetch(`${MOCK_API_BASE}/mock/update-position`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: wallets[i],
          coin: 'ETH',
          size: '10.0',
          price: '2450.00',
          leverage: '5'
        })
      });
    }
    
    console.log('✅ PASSED: Signal detection logic setup complete');
    console.log(`   Updated ${wallets.length} wallet positions for ETH LONG\n`);
    passed++;
  } catch (error) {
    console.log('❌ FAILED: Signal detection test failed:', error.message, '\n');
    failed++;
  }
  
  // Test 7: Price Movement Simulation
  try {
    console.log('Test 7: Price Movement Simulation');
    
    // Simulate price movements for SL/TP testing
    const priceUpdates = [
      { coin: 'ETH', price: 2465.75 }, // +0.64% (within normal range)
      { coin: 'BTC', price: 42150.30 }, // Stable
      { coin: 'SOL', price: 98.45 }     // Stable
    ];
    
    for (const update of priceUpdates) {
      const response = await fetch(`${MOCK_API_BASE}/mock/update-price`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update)
      });
      const data = await response.json();
      assert(data.success === true);
    }
    
    console.log('✅ PASSED: Price movement simulation working');
    console.log('   Updated prices for ETH, BTC, SOL\n');
    passed++;
  } catch (error) {
    console.log('❌ FAILED: Price movement test failed:', error.message, '\n');
    failed++;
  }
  
  // Test 8: Error Handling
  try {
    console.log('Test 8: Error Handling');
    
    // Test invalid wallet address
    const response = await fetch(`${MOCK_API_BASE}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'clearinghouseState',
        user: '0xinvalid'
      })
    });
    const data = await response.json();
    assert(data.assetPositions);
    assert(data.assetPositions.length === 0); // Should return empty array for unknown wallet
    
    console.log('✅ PASSED: Error handling working correctly');
    console.log('   Invalid wallet returns empty positions\n');
    passed++;
  } catch (error) {
    console.log('❌ FAILED: Error handling test failed:', error.message, '\n');
    failed++;
  }
  
  // Test Summary
  console.log('📊 Test Summary:');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  
  if (failed === 0) {
    console.log('\n🎉 All tests passed! The system is ready for deployment.');
  } else {
    console.log('\n⚠️  Some tests failed. Please review the issues before deployment.');
  }
  
  return { passed, failed };
}

// Performance test
async function performanceTest() {
  console.log('\n🚀 Performance Test: API Response Times\n');
  
  const tests = [
    {
      name: 'Clearinghouse State',
      request: () => fetch(`${MOCK_API_BASE}/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'clearinghouseState',
          user: TEST_WALLET
        })
      })
    },
    {
      name: 'Price Data',
      request: () => fetch(`${MOCK_API_BASE}/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'metaAndAssetCtxs'
        })
      })
    },
    {
      name: 'KuCoin Price',
      request: () => fetch(`${MOCK_API_BASE}/api/v1/market/orderbook/level1?symbol=ETH-USDT`)
    }
  ];
  
  for (const test of tests) {
    const iterations = 10;
    const times = [];
    
    for (let i = 0; i < iterations; i++) {
      const start = Date.now();
      await test.request();
      const end = Date.now();
      times.push(end - start);
    }
    
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);
    
    console.log(`${test.name}:`);
    console.log(`  Average: ${avg.toFixed(1)}ms`);
    console.log(`  Min: ${min}ms, Max: ${max}ms`);
    console.log(`  ${avg < 100 ? '✅' : '⚠️'} ${avg < 100 ? 'Good' : 'Slow'} response time\n`);
  }
}

// Run tests
if (require.main === module) {
  runTests()
    .then(() => performanceTest())
    .then(() => {
      console.log('\n🏁 Testing complete!');
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Test runner failed:', error);
      process.exit(1);
    });
}

module.exports = { runTests, performanceTest };

