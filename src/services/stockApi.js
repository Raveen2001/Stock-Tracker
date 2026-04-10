const API_BASE = 'http://localhost:3001/api';

// Popular NSE & BSE stocks for quick search
const POPULAR_STOCKS = [
  { symbol: 'RELIANCE.NS', name: 'Reliance Industries', exchange: 'NSE' },
  { symbol: 'TCS.NS', name: 'Tata Consultancy Services', exchange: 'NSE' },
  { symbol: 'INFY.NS', name: 'Infosys', exchange: 'NSE' },
  { symbol: 'HDFCBANK.NS', name: 'HDFC Bank', exchange: 'NSE' },
  { symbol: 'ICICIBANK.NS', name: 'ICICI Bank', exchange: 'NSE' },
  { symbol: 'HINDUNILVR.NS', name: 'Hindustan Unilever', exchange: 'NSE' },
  { symbol: 'SBIN.NS', name: 'State Bank of India', exchange: 'NSE' },
  { symbol: 'BHARTIARTL.NS', name: 'Bharti Airtel', exchange: 'NSE' },
  { symbol: 'ITC.NS', name: 'ITC Limited', exchange: 'NSE' },
  { symbol: 'KOTAKBANK.NS', name: 'Kotak Mahindra Bank', exchange: 'NSE' },
  { symbol: 'LT.NS', name: 'Larsen & Toubro', exchange: 'NSE' },
  { symbol: 'AXISBANK.NS', name: 'Axis Bank', exchange: 'NSE' },
  { symbol: 'WIPRO.NS', name: 'Wipro', exchange: 'NSE' },
  { symbol: 'BAJFINANCE.NS', name: 'Bajaj Finance', exchange: 'NSE' },
  { symbol: 'MARUTI.NS', name: 'Maruti Suzuki', exchange: 'NSE' },
  { symbol: 'TATAMOTORS.NS', name: 'Tata Motors', exchange: 'NSE' },
  { symbol: 'SUNPHARMA.NS', name: 'Sun Pharma', exchange: 'NSE' },
  { symbol: 'TITAN.NS', name: 'Titan Company', exchange: 'NSE' },
  { symbol: 'ASIANPAINT.NS', name: 'Asian Paints', exchange: 'NSE' },
  { symbol: 'ULTRACEMCO.NS', name: 'UltraTech Cement', exchange: 'NSE' },
  { symbol: 'HCLTECH.NS', name: 'HCL Technologies', exchange: 'NSE' },
  { symbol: 'ADANIENT.NS', name: 'Adani Enterprises', exchange: 'NSE' },
  { symbol: 'ADANIPORTS.NS', name: 'Adani Ports', exchange: 'NSE' },
  { symbol: 'POWERGRID.NS', name: 'Power Grid Corp', exchange: 'NSE' },
  { symbol: 'NTPC.NS', name: 'NTPC Limited', exchange: 'NSE' },
  { symbol: 'ONGC.NS', name: 'Oil & Natural Gas Corp', exchange: 'NSE' },
  { symbol: 'COALINDIA.NS', name: 'Coal India', exchange: 'NSE' },
  { symbol: 'TATASTEEL.NS', name: 'Tata Steel', exchange: 'NSE' },
  { symbol: 'JSWSTEEL.NS', name: 'JSW Steel', exchange: 'NSE' },
  { symbol: 'TECHM.NS', name: 'Tech Mahindra', exchange: 'NSE' },
  { symbol: 'RELIANCE.BO', name: 'Reliance Industries', exchange: 'BSE' },
  { symbol: 'TCS.BO', name: 'Tata Consultancy Services', exchange: 'BSE' },
  { symbol: 'INFY.BO', name: 'Infosys', exchange: 'BSE' },
  { symbol: 'HDFCBANK.BO', name: 'HDFC Bank', exchange: 'BSE' },
  { symbol: 'ICICIBANK.BO', name: 'ICICI Bank', exchange: 'BSE' },
  { symbol: 'SBIN.BO', name: 'State Bank of India', exchange: 'BSE' },
];

// ─── REST: Fetch chart data (quote + intraday prices) ───
export async function fetchStockChart(symbol) {
  const response = await fetch(`${API_BASE}/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();

  const result = data.chart?.result?.[0];
  if (!result) throw new Error('No data available');

  const meta = result.meta;
  const quotes = result.indicators?.quote?.[0] || {};
  const timestamps = result.timestamp || [];

  const currentPrice = meta.regularMarketPrice;
  const previousClose = meta.chartPreviousClose || meta.previousClose;
  const change = currentPrice - previousClose;
  const changePercent = previousClose ? (change / previousClose) * 100 : 0;

  const priceHistory = timestamps
    .map((ts, i) => ({
      time: new Date(ts * 1000).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      price: quotes.close?.[i] || quotes.open?.[i] || null,
      timestamp: ts,
    }))
    .filter((p) => p.price != null);

  return {
    quote: {
      symbol: meta.symbol,
      name: meta.shortName || meta.longName || symbol,
      exchange: meta.exchangeName,
      currency: meta.currency,
      currentPrice,
      previousClose,
      open: meta.regularMarketOpen,
      change: parseFloat(change.toFixed(2)),
      changePercent: parseFloat(changePercent.toFixed(2)),
      dayHigh: meta.regularMarketDayHigh,
      dayLow: meta.regularMarketDayLow,
      volume: meta.regularMarketVolume,
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
      lastUpdated: new Date().toLocaleTimeString('en-IN'),
    },
    priceHistory,
  };
}

// ─── Search stocks (local list + dynamic suffix) ───
export async function searchStocks(query) {
  if (!query || query.length < 1) return [];

  const q = query.toUpperCase().trim();

  const matches = POPULAR_STOCKS.filter(
    (s) =>
      s.symbol.toUpperCase().includes(q) ||
      s.name.toUpperCase().includes(q)
  );

  const suggestions = [...matches];

  // Add dynamic entries for custom symbols
  if (!q.includes('.')) {
    if (!suggestions.some((s) => s.symbol === `${q}.NS`)) {
      suggestions.push({ symbol: `${q}.NS`, name: q, exchange: 'NSE' });
    }
    if (!suggestions.some((s) => s.symbol === `${q}.BO`)) {
      suggestions.push({ symbol: `${q}.BO`, name: q, exchange: 'BSE' });
    }
  }

  // Deduplicate
  const seen = new Set();
  return suggestions.filter((s) => {
    if (seen.has(s.symbol)) return false;
    seen.add(s.symbol);
    return true;
  });
}

// ─── WebSocket: Real-time price stream ───
export class StockWebSocket {
  constructor(onPrice, onStatusChange) {
    this.onPrice = onPrice;
    this.onStatusChange = onStatusChange || (() => {});
    this.ws = null;
    this.reconnectTimer = null;
    this.subscribedSymbols = new Set();
    this.closed = false;
    this.connect();
  }

  connect() {
    if (this.closed) return;
    this.onStatusChange('connecting');

    try {
      this.ws = new WebSocket('ws://localhost:3001');
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      if (this.closed) { this.ws.close(); return; }
      this.onStatusChange('connected');
      if (this.subscribedSymbols.size > 0) {
        this.ws.send(
          JSON.stringify({
            action: 'subscribe',
            symbols: Array.from(this.subscribedSymbols),
          })
        );
      }
    };

    this.ws.onmessage = (event) => {
      if (this.closed) return;
      try {
        const data = JSON.parse(event.data);
        if (data.event === 'price') {
          this.onPrice(data);
        }
      } catch {}
    };

    this.ws.onclose = () => {
      if (this.closed) return;
      this.onStatusChange('disconnected');
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      // onclose will fire after this, so just suppress the error
    };
  }

  scheduleReconnect() {
    clearTimeout(this.reconnectTimer);
    if (!this.closed) {
      this.reconnectTimer = setTimeout(() => this.connect(), 3000);
    }
  }

  subscribe(symbols) {
    const list = Array.isArray(symbols) ? symbols : [symbols];
    list.forEach((s) => this.subscribedSymbols.add(s));
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'subscribe', symbols: list }));
    }
  }

  unsubscribe(symbols) {
    const list = Array.isArray(symbols) ? symbols : [symbols];
    list.forEach((s) => this.subscribedSymbols.delete(s));
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'unsubscribe', symbols: list }));
    }
  }

  close() {
    this.closed = true;
    clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
  }
}
