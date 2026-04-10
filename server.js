const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const WebSocket = require('ws');

const app = express();
const PORT = 3001;
const POLL_INTERVAL = 5000; // 5 seconds

app.use(cors());

const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept': 'application/json',
};

// ─── REST: Get stock quote + chart ───
app.get('/api/chart/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const interval = req.query.interval || '1m';
  const range = req.query.range || '1d';
  try {
    const data = await fetchYahooChart(symbol, interval, range);
    res.json(data);
  } catch (err) {
    console.error(`Chart error for ${symbol}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Yahoo Finance helpers ───
async function fetchYahooChart(symbol, interval = '1m', range = '1d') {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
  const response = await fetch(url, { headers: YAHOO_HEADERS });
  if (!response.ok) throw new Error(`Yahoo returned ${response.status}`);
  return response.json();
}

// Fetch current price for a single symbol using v8 chart endpoint
async function fetchCurrentPrice(symbol) {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`;
  const response = await fetch(url, { headers: YAHOO_HEADERS });
  if (!response.ok) throw new Error(`Yahoo returned ${response.status}`);
  const data = await response.json();
  const meta = data.chart?.result?.[0]?.meta;
  if (!meta) return null;
  return {
    symbol: meta.symbol,
    price: meta.regularMarketPrice,
    previousClose: meta.chartPreviousClose || meta.previousClose,
    dayHigh: meta.regularMarketDayHigh,
    dayLow: meta.regularMarketDayLow,
    volume: meta.regularMarketVolume,
  };
}

// ─── Start HTTP + WebSocket server ───
const httpServer = app.listen(PORT, () => {
  console.log(`Stock API server running on http://localhost:${PORT}`);
});

const wss = new WebSocket.Server({ server: httpServer });

// Track subscribed symbols across all clients
let subscribedSymbols = new Set();
let clientSockets = new Set();
let pollTimer = null;

// Poll Yahoo Finance and push updates via WebSocket
async function pollPrices() {
  if (subscribedSymbols.size === 0 || clientSockets.size === 0) return;

  const symbols = Array.from(subscribedSymbols);

  // Fetch all symbols in parallel
  const results = await Promise.allSettled(
    symbols.map((s) => fetchCurrentPrice(s))
  );

  results.forEach((result) => {
    if (result.status !== 'fulfilled' || !result.value) return;
    const q = result.value;
    const change = q.price - q.previousClose;
    const changePercent = q.previousClose ? (change / q.previousClose) * 100 : 0;

    const update = JSON.stringify({
      event: 'price',
      symbol: q.symbol,
      price: q.price,
      change,
      changePercent,
      dayHigh: q.dayHigh,
      dayLow: q.dayLow,
      volume: q.volume,
      previousClose: q.previousClose,
    });

    clientSockets.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(update);
      }
    });
  });
}

function startPolling() {
  stopPolling();
  if (subscribedSymbols.size > 0 && clientSockets.size > 0) {
    pollPrices(); // immediate first poll
    pollTimer = setInterval(pollPrices, POLL_INTERVAL);
    console.log(`Polling ${subscribedSymbols.size} symbols every ${POLL_INTERVAL / 1000}s`);
  }
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

// Handle browser client connections
wss.on('connection', (ws) => {
  clientSockets.add(ws);
  console.log(`Client connected (total: ${clientSockets.size})`);

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.action === 'subscribe' && msg.symbols) {
        const symbols = Array.isArray(msg.symbols) ? msg.symbols : [msg.symbols];
        symbols.forEach((s) => subscribedSymbols.add(s));
        console.log(`Subscribed: ${symbols.join(', ')} (total: ${subscribedSymbols.size})`);
        startPolling();
      }

      if (msg.action === 'unsubscribe' && msg.symbols) {
        const symbols = Array.isArray(msg.symbols) ? msg.symbols : [msg.symbols];
        symbols.forEach((s) => subscribedSymbols.delete(s));
        console.log(`Unsubscribed: ${symbols.join(', ')} (total: ${subscribedSymbols.size})`);
        if (subscribedSymbols.size === 0) stopPolling();
        else startPolling(); // restart with updated list
      }
    } catch (err) {
      console.error('Client message error:', err.message);
    }
  });

  ws.on('close', () => {
    clientSockets.delete(ws);
    console.log(`Client disconnected (total: ${clientSockets.size})`);
    if (clientSockets.size === 0) {
      stopPolling();
      console.log('No clients, polling stopped');
    }
  });
});

console.log(`WebSocket server ready on ws://localhost:${PORT}`);
