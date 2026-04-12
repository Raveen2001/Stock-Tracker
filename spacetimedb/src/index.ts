import { schema, t, table, SenderError } from "spacetimedb/server";
import { ScheduleAt } from "spacetimedb";

// ─── Tables ───────────────────────────────────────────────────────────────────

/**
 * Shared live price data for every symbol currently on any user's watchlist.
 * Keyed by symbol string (e.g. "RELIANCE.NS", "AAPL"). Market-agnostic by design.
 */
const stockPrice = table(
  { name: "stock_price", public: true },
  {
    symbol: t.string().primaryKey(),
    name: t.string(),
    exchange: t.string(),
    currency: t.string(),
    price: t.f64(),
    previousClose: t.f64(),
    change: t.f64(),
    changePercent: t.f64(),
    dayHigh: t.f64(),
    dayLow: t.f64(),
    volume: t.f64(),
    lastUpdated: t.timestamp(),
  },
);

/**
 * Per-user watchlist. Each row is one symbol for one identity.
 */
const watchlistItem = table(
  { name: "watchlist_item", public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    owner: t.identity(),
    symbol: t.string(),
  },
);

/**
 * Per-user price alerts. The server-side fetch_prices procedure detects
 * threshold crossings and sets active=false + triggeredAt. The client
 * sees the onUpdate event and shows a toast notification.
 */
const alert = table(
  { name: "alert", public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    owner: t.identity(),
    symbol: t.string(),
    targetPrice: t.f64(),
    alertType: t.string(),
    active: t.bool(),
    createdAt: t.timestamp(),
    triggeredAt: t.timestamp().optional(),
  },
);

/**
 * Internal schedule table. One row inserted by init() triggers fetch_prices
 * every 5 seconds.
 */
const priceFetchSchedule = table(
  { name: "price_fetch_schedule", scheduled: (): any => fetchPrices },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  },
);

const spacetimedb = schema({
  stockPrice,
  watchlistItem,
  alert,
  priceFetchSchedule,
});
export default spacetimedb;

// ─── Lifecycle ────────────────────────────────────────────────────────────────

/**
 * Called once when the module is first published. Seeds the price fetch schedule.
 */
export const init = spacetimedb.init((ctx) => {
  // Insert a single schedule row that repeats every 5 seconds (5,000,000 microseconds)
  ctx.db.priceFetchSchedule.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.interval(5_000_000n),
  });
  console.info(
    "Stock Tracker module initialized. Price fetch scheduled every 5s.",
  );
});

// ─── Watchlist Reducers ───────────────────────────────────────────────────────

export const addToWatchlist = spacetimedb.reducer(
  { symbol: t.string() },
  (ctx, { symbol }) => {
    const sym = symbol.trim().toUpperCase();
    if (!sym) throw new SenderError("Symbol must not be empty");

    // Dedup: check if this owner already has this symbol
    for (const item of ctx.db.watchlistItem.iter()) {
      if (item.owner.isEqual(ctx.sender) && item.symbol === sym) {
        return; // already exists, silently succeed
      }
    }

    ctx.db.watchlistItem.insert({ id: 0n, owner: ctx.sender, symbol: sym });
    console.info(`${ctx.sender.toHexString().substring(0, 8)} added ${sym}`);
  },
);

export const removeFromWatchlist = spacetimedb.reducer(
  { symbol: t.string() },
  (ctx, { symbol }) => {
    const sym = symbol.trim().toUpperCase();

    // Remove watchlist entry
    for (const item of ctx.db.watchlistItem.iter()) {
      if (item.owner.isEqual(ctx.sender) && item.symbol === sym) {
        ctx.db.watchlistItem.id.delete(item.id);
      }
    }

    // Remove associated alerts for this owner + symbol
    for (const a of ctx.db.alert.iter()) {
      if (a.owner.isEqual(ctx.sender) && a.symbol === sym) {
        ctx.db.alert.id.delete(a.id);
      }
    }

    // If no other user watches this symbol, remove the price row to keep the table clean
    let othersWatch = false;
    for (const item of ctx.db.watchlistItem.iter()) {
      if (item.symbol === sym) {
        othersWatch = true;
        break;
      }
    }
    if (!othersWatch) {
      const priceRow = ctx.db.stockPrice.symbol.find(sym);
      if (priceRow) ctx.db.stockPrice.symbol.delete(sym);
    }
  },
);

// ─── Alert Reducers ───────────────────────────────────────────────────────────

export const addAlert = spacetimedb.reducer(
  { symbol: t.string(), targetPrice: t.f64(), alertType: t.string() },
  (ctx, { symbol, targetPrice, alertType }) => {
    const sym = symbol.trim().toUpperCase();
    if (!sym) throw new SenderError("Symbol must not be empty");
    if (targetPrice <= 0)
      throw new SenderError("Target price must be positive");
    if (alertType !== "above" && alertType !== "below") {
      throw new SenderError('alertType must be "above" or "below"');
    }

    ctx.db.alert.insert({
      id: 0n,
      owner: ctx.sender,
      symbol: sym,
      targetPrice,
      alertType,
      active: true,
      createdAt: ctx.timestamp,
      triggeredAt: undefined,
    });
  },
);

export const removeAlert = spacetimedb.reducer(
  { alertId: t.u64() },
  (ctx, { alertId }) => {
    const a = ctx.db.alert.id.find(alertId);
    if (!a) return;
    if (!a.owner.isEqual(ctx.sender)) throw new SenderError("Not your alert");
    ctx.db.alert.id.delete(alertId);
  },
);

export const toggleAlert = spacetimedb.reducer(
  { alertId: t.u64() },
  (ctx, { alertId }) => {
    const a = ctx.db.alert.id.find(alertId);
    if (!a) throw new SenderError("Alert not found");
    if (!a.owner.isEqual(ctx.sender)) throw new SenderError("Not your alert");
    ctx.db.alert.id.update({
      ...a,
      active: !a.active,
      triggeredAt: !a.active ? undefined : a.triggeredAt,
    });
  },
);

// ─── Scheduled Procedure: fetch_prices ───────────────────────────────────────

const YAHOO_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  Accept: "application/json",
};

/**
 * Runs every 5 seconds (triggered by priceFetchSchedule).
 * Fetches current prices from Yahoo Finance for all watched symbols,
 * upserts stock_price rows, and checks active alerts.
 */
export const fetchPrices = spacetimedb.procedure(
  { arg: priceFetchSchedule.rowType },
  t.unit(),
  (ctx, _arg) => {
    // 1. Collect unique symbols from watchlist
    const symbols = new Set<string>();
    ctx.withTx((tx) => {
      for (const item of tx.db.watchlistItem.iter()) {
        symbols.add(item.symbol);
      }
      // Also include symbols from active alerts in case they're not on watchlist
      for (const a of tx.db.alert.iter()) {
        if (a.active) symbols.add(a.symbol);
      }
    });

    if (symbols.size === 0) return {};

    // 2. HTTP phase: fetch each symbol sequentially (no transaction open)
    const results: Array<{
      symbol: string;
      name: string;
      exchange: string;
      currency: string;
      price: number;
      previousClose: number;
      change: number;
      changePercent: number;
      dayHigh: number;
      dayLow: number;
      volume: number;
    }> = [];

    for (const sym of symbols) {
      try {
        const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1m&range=1d`;
        const response = ctx.http.fetch(url, { headers: YAHOO_HEADERS });
        if (response.status !== 200) {
          console.warn(`Yahoo returned ${response.status} for ${sym}`);
          continue;
        }
        const data = response.json() as any;
        const meta = data?.chart?.result?.[0]?.meta;
        if (!meta) {
          console.warn(`No meta for ${sym}`);
          continue;
        }
        const price: number = meta.regularMarketPrice ?? 0;
        const previousClose: number =
          meta.chartPreviousClose ?? meta.previousClose ?? price;
        const change = price - previousClose;
        const changePercent =
          previousClose > 0 ? (change / previousClose) * 100 : 0;

        results.push({
          symbol: meta.symbol ?? sym,
          name: meta.shortName ?? meta.longName ?? sym,
          exchange: meta.exchangeName ?? "",
          currency: meta.currency ?? "INR",
          price,
          previousClose,
          change: parseFloat(change.toFixed(4)),
          changePercent: parseFloat(changePercent.toFixed(4)),
          dayHigh: meta.regularMarketDayHigh ?? price,
          dayLow: meta.regularMarketDayLow ?? price,
          volume: meta.regularMarketVolume ?? 0,
        });
      } catch (e) {
        console.error(`Failed to fetch ${sym}:`, e);
      }
    }

    if (results.length === 0) return {};

    // 3. Write phase: upsert prices and trigger alerts in a single transaction
    ctx.withTx((tx) => {
      const now = tx.timestamp;

      for (const r of results) {
        const existing = tx.db.stockPrice.symbol.find(r.symbol);
        if (existing) {
          tx.db.stockPrice.symbol.update({ ...r, lastUpdated: now });
        } else {
          tx.db.stockPrice.insert({ ...r, lastUpdated: now });
        }

        // Check active alerts for this symbol
        for (const a of tx.db.alert.iter()) {
          if (!a.active || a.symbol !== r.symbol) continue;

          const triggered =
            (a.alertType === "above" && r.price >= a.targetPrice) ||
            (a.alertType === "below" && r.price <= a.targetPrice);

          if (triggered) {
            tx.db.alert.id.update({ ...a, active: false, triggeredAt: now });
            console.info(
              `Alert triggered: ${r.symbol} ${a.alertType} ${a.targetPrice} (current: ${r.price})`,
            );
          }
        }
      }
    });

    return {};
  },
);

// ─── On-Demand Procedure: fetch_chart ────────────────────────────────────────

/**
 * Called by the client to get intraday chart data for a symbol.
 * Returns parsed quote + price history. Not stored in any table.
 */
export const fetchChart = spacetimedb.procedure(
  { symbol: t.string(), interval: t.string(), range: t.string() },
  t.string(),
  (ctx, { symbol, interval, range }) => {
    const sym = symbol.trim().toUpperCase();
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=${interval}&range=${range}`;

    const response = ctx.http.fetch(url, { headers: YAHOO_HEADERS });
    if (response.status !== 200) {
      throw new SenderError(`Yahoo returned ${response.status} for ${sym}`);
    }

    const data = response.json() as any;
    const result = data?.chart?.result?.[0];
    if (!result) throw new SenderError(`No chart data available for ${sym}`);

    const meta = result.meta;
    const quotes = result.indicators?.quote?.[0] ?? {};
    const timestamps: number[] = result.timestamp ?? [];

    /** Meta often omits regularMarketOpen; session open = first bar's open (same as Yahoo's first `open[]`). */
    const openSeries = quotes.open as number[] | undefined;
    const sessionOpenFromBars =
      Array.isArray(openSeries) && openSeries.length > 0
        ? openSeries.find(
            (v: number) => v != null && Number.isFinite(Number(v)),
          )
        : undefined;

    const currentPrice: number = meta.regularMarketPrice;
    const previousClose: number = meta.chartPreviousClose ?? meta.previousClose;
    const change = currentPrice - previousClose;
    const changePercent =
      previousClose > 0 ? (change / previousClose) * 100 : 0;

    const priceHistory = timestamps
      .map((ts: number, i: number) => ({
        time: new Date(ts * 1000).toLocaleString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        }),
        price: (quotes.close?.[i] ?? quotes.open?.[i] ?? null) as number | null,
        timestamp: ts,
        /** Per-minute open; first bar matches session open (used by client if quote.open is missing). */
        barOpen: openSeries?.[i] ?? null,
      }))
      .filter((p: { price: number | null }) => p.price != null);

    const payload = {
      quote: {
        symbol: meta.symbol,
        name: meta.shortName ?? meta.longName ?? sym,
        exchange: meta.exchangeName,
        currency: meta.currency,
        currentPrice,
        previousClose,
        open: sessionOpenFromBars,
        change: parseFloat(change.toFixed(2)),
        changePercent: parseFloat(changePercent.toFixed(2)),
        dayHigh: meta.regularMarketDayHigh,
        dayLow: meta.regularMarketDayLow,
        volume: meta.regularMarketVolume,
        fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
        lastUpdated: new Date().toLocaleTimeString("en-IN"),
      },
      priceHistory,
    };

    return JSON.stringify(payload);
  },
);
