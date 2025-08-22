import React, { useState } from 'react'
import { Button } from '@/components/ui/button.jsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.jsx'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.jsx'
import { Badge } from '@/components/ui/badge.jsx'
import { Input } from '@/components/ui/input.jsx'
import { Label } from '@/components/ui/label.jsx'
import { Textarea } from '@/components/ui/textarea.jsx'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.jsx'
import { Activity, Wallet, TrendingUp, Settings, Plus, Trash2, Edit } from 'lucide-react'
import './App.css'

function App() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [wallets, setWallets] = useState([
    { id: 1, address: '0xecb63caa47c7c4e77f60f1ce858cf28dc2b82b00', label: 'Wallet 1', isActive: true },
    { id: 2, address: '0x00c511ab1b583f4efab3608d0897d377c4de47a6', label: 'Wallet 2', isActive: true },
    { id: 3, address: '0x023a3d058020fb76cca98f01b3c48c8938a22355', label: 'Wallet 3', isActive: true },
  ])
  const [signals, setSignals] = useState([
    { id: 1, pair: 'ETH', type: 'LONG', entryPrice: 2450.50, status: 'OPEN', walletCount: 6, timestamp: '2024-01-15 14:30:00' },
    { id: 2, pair: 'BTC', type: 'SHORT', entryPrice: 42100.00, status: 'TP_HIT', walletCount: 8, timestamp: '2024-01-15 12:15:00' },
    { id: 3, pair: 'SOL', type: 'LONG', entryPrice: 98.75, status: 'SL_HIT', walletCount: 5, timestamp: '2024-01-15 10:45:00' },
  ])
  const [config, setConfig] = useState({
    walletCount: 5,
    timeWindowMin: 10,
    defaultSlPercent: -2.5,
    tpsPercent: [2.0, 3.5, 5.0],
    pollIntervalSec: 60,
    priceCheckIntervalSec: 30,
  })

  const [newWallet, setNewWallet] = useState({ address: '', label: '' })

  const addWallet = () => {
    if (newWallet.address && newWallet.label) {
      setWallets([...wallets, {
        id: Date.now(),
        address: newWallet.address,
        label: newWallet.label,
        isActive: true
      }])
      setNewWallet({ address: '', label: '' })
    }
  }

  const removeWallet = (id) => {
    setWallets(wallets.filter(w => w.id !== id))
  }

  const toggleWalletStatus = (id) => {
    setWallets(wallets.map(w => w.id === id ? { ...w, isActive: !w.isActive } : w))
  }

  const getStatusBadge = (status) => {
    const variants = {
      'OPEN': 'default',
      'TP_HIT': 'success',
      'SL_HIT': 'destructive',
      'PARTIAL_TP': 'secondary'
    }
    return <Badge variant={variants[status] || 'default'}>{status}</Badge>
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Hyperliquid Signal System</h1>
          <p className="text-muted-foreground">Monitor wallet activity and detect trading signals</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="dashboard" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="wallets" className="flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Wallets
            </TabsTrigger>
            <TabsTrigger value="signals" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Signals
            </TabsTrigger>
            <TabsTrigger value="config" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Configuration
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Wallets</CardTitle>
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{wallets.filter(w => w.isActive).length}</div>
                  <p className="text-xs text-muted-foreground">
                    {wallets.length} total wallets
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Open Signals</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{signals.filter(s => s.status === 'OPEN').length}</div>
                  <p className="text-xs text-muted-foreground">
                    {signals.length} total signals
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">66.7%</div>
                  <p className="text-xs text-muted-foreground">
                    Based on closed signals
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Recent Signals</CardTitle>
                <CardDescription>Latest trading signals detected</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pair</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Entry Price</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Wallets</TableHead>
                      <TableHead>Timestamp</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {signals.slice(0, 5).map((signal) => (
                      <TableRow key={signal.id}>
                        <TableCell className="font-medium">{signal.pair}</TableCell>
                        <TableCell>
                          <Badge variant={signal.type === 'LONG' ? 'default' : 'secondary'}>
                            {signal.type}
                          </Badge>
                        </TableCell>
                        <TableCell>${signal.entryPrice.toFixed(2)}</TableCell>
                        <TableCell>{getStatusBadge(signal.status)}</TableCell>
                        <TableCell>{signal.walletCount}</TableCell>
                        <TableCell>{signal.timestamp}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="wallets" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Add New Wallet</CardTitle>
                <CardDescription>Add a new wallet address to monitor</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="wallet-address">Wallet Address</Label>
                    <Input
                      id="wallet-address"
                      placeholder="0x..."
                      value={newWallet.address}
                      onChange={(e) => setNewWallet({ ...newWallet, address: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="wallet-label">Label</Label>
                    <Input
                      id="wallet-label"
                      placeholder="Wallet name"
                      value={newWallet.label}
                      onChange={(e) => setNewWallet({ ...newWallet, label: e.target.value })}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button onClick={addWallet} className="w-full">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Wallet
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Monitored Wallets</CardTitle>
                <CardDescription>Manage your wallet watchlist</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Label</TableHead>
                      <TableHead>Address</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {wallets.map((wallet) => (
                      <TableRow key={wallet.id}>
                        <TableCell className="font-medium">{wallet.label}</TableCell>
                        <TableCell className="font-mono text-sm">{wallet.address}</TableCell>
                        <TableCell>
                          <Badge variant={wallet.isActive ? 'default' : 'secondary'}>
                            {wallet.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => toggleWalletStatus(wallet.id)}
                            >
                              {wallet.isActive ? 'Deactivate' : 'Activate'}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => removeWallet(wallet.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="signals" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>All Signals</CardTitle>
                <CardDescription>Complete history of detected signals</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Pair</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Entry Price</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Wallets</TableHead>
                      <TableHead>Timestamp</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {signals.map((signal) => (
                      <TableRow key={signal.id}>
                        <TableCell className="font-medium">#{signal.id}</TableCell>
                        <TableCell>{signal.pair}</TableCell>
                        <TableCell>
                          <Badge variant={signal.type === 'LONG' ? 'default' : 'secondary'}>
                            {signal.type}
                          </Badge>
                        </TableCell>
                        <TableCell>${signal.entryPrice.toFixed(2)}</TableCell>
                        <TableCell>{getStatusBadge(signal.status)}</TableCell>
                        <TableCell>{signal.walletCount}</TableCell>
                        <TableCell>{signal.timestamp}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="config" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Signal Detection Configuration</CardTitle>
                <CardDescription>Configure signal detection parameters</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="wallet-count">Minimum Wallet Count</Label>
                    <Input
                      id="wallet-count"
                      type="number"
                      value={config.walletCount}
                      onChange={(e) => setConfig({ ...config, walletCount: parseInt(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="time-window">Time Window (minutes)</Label>
                    <Input
                      id="time-window"
                      type="number"
                      value={config.timeWindowMin}
                      onChange={(e) => setConfig({ ...config, timeWindowMin: parseInt(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="stop-loss">Default Stop Loss (%)</Label>
                    <Input
                      id="stop-loss"
                      type="number"
                      step="0.1"
                      value={config.defaultSlPercent}
                      onChange={(e) => setConfig({ ...config, defaultSlPercent: parseFloat(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="poll-interval">Poll Interval (seconds)</Label>
                    <Input
                      id="poll-interval"
                      type="number"
                      value={config.pollIntervalSec}
                      onChange={(e) => setConfig({ ...config, pollIntervalSec: parseInt(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="take-profits">Take Profit Levels (%)</Label>
                  <Input
                    id="take-profits"
                    placeholder="2.0, 3.5, 5.0"
                    value={config.tpsPercent.join(', ')}
                    onChange={(e) => setConfig({ 
                      ...config, 
                      tpsPercent: e.target.value.split(',').map(v => parseFloat(v.trim())).filter(v => !isNaN(v))
                    })}
                  />
                </div>
                <Button className="w-full">Save Configuration</Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

export default App

