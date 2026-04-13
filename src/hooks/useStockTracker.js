import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { useSpacetimeDB, useTable, useReducer } from 'spacetimedb/react';
import { tables, reducers } from '../module_bindings/index.ts';
import posthog from '../posthog';

export function useStockTracker() {
  const { identity, isActive, getConnection } = useSpacetimeDB();

  // ─── Server-synced state via SpacetimeDB subscriptions ───────────────────────

  const [watchlistItems, watchlistReady] = useTable(
    identity ? tables.watchlistItem.where(r => r.owner.eq(identity)) : tables.watchlistItem,
    {
      onInsert: item => {
        // When a new watchlist item appears, fetch its chart data
        if (identity && item.owner.toHexString() === identity.toHexString()) {
          fetchChartForSymbol(item.symbol);
        }
      },
    }
  );

  const [stockPrices, pricesReady] = useTable(tables.stockPrice);

  const triggeredAlertsRef = useRef(new Set());

  const [alerts, alertsReady] = useTable(
    identity ? tables.alert.where(r => r.owner.eq(identity)) : tables.alert,
    {
      onUpdate: (_oldAlert, newAlert) => {
        // Server triggered the alert (active flipped to false)
        if (!newAlert.active && newAlert.triggeredAt && !triggeredAlertsRef.current.has(String(newAlert.id))) {
          triggeredAlertsRef.current.add(String(newAlert.id));

          const price = stockPricesRef.current[newAlert.symbol]?.price;
          const priceStr = price != null
            ? `₹${price.toLocaleString('en-IN')}`
            : `target ₹${newAlert.targetPrice.toLocaleString('en-IN')}`;

          const direction = newAlert.alertType === 'above' ? '↑' : '↓';
          const message = `${newAlert.symbol} alert triggered at ${priceStr} ${direction}`;

          toast.success(message, { position: 'top-right', autoClose: 10000 });

          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Stock Alert!', { body: message, icon: '/favicon.ico' });
          }

          posthog.capture({
            distinctId: identity?.toHexString() ?? 'anonymous',
            event: 'alert triggered',
            properties: {
              symbol: newAlert.symbol,
              alert_type: newAlert.alertType,
              target_price: newAlert.targetPrice,
              triggered_price: price ?? null,
            },
          });
        }
      },
    }
  );

  // ─── Local client-side state (chart data + loading) ──────────────────────────

  const [chartData, setChartData] = useState({});
  /** Extra quote fields from fetchChart (open, 52w) — not stored on stock_price rows. */
  const [chartQuoteBySymbol, setChartQuoteBySymbol] = useState({});
  const [loading, setLoading] = useState({});
  const [errors, setErrors] = useState({});

  // Keep a ref to stockPrices so the alert onUpdate callback can read current prices
  const stockPricesRef = useRef({});
  useEffect(() => {
    const map = {};
    for (const sp of stockPrices) {
      map[sp.symbol] = sp;
    }
    stockPricesRef.current = map;
  }, [stockPrices]);

  // ─── Reducers (server mutations) ─────────────────────────────────────────────

  const addToWatchlistReducer = useReducer(reducers.addToWatchlist);
  const removeFromWatchlistReducer = useReducer(reducers.removeFromWatchlist);
  const addAlertReducer = useReducer(reducers.addAlert);
  const removeAlertReducer = useReducer(reducers.removeAlert);
  const toggleAlertReducer = useReducer(reducers.toggleAlert);
  const registerPhoneReducer = useReducer(reducers.registerPhone);
  const setTelegramChatIdReducer = useReducer(reducers.setTelegramChatId);

  // ─── Phone profile (private user_profile on server) ───────────────────────────

  const [profilePhone, setProfilePhone] = useState(null);
  const [profileChecked, setProfileChecked] = useState(false);

  useEffect(() => {
    if (!isActive || !identity) {
      setProfilePhone(null);
      setProfileChecked(false);
      return;
    }

    const cacheKey = `st_profile_phone_${identity.toHexString()}`;

    let cancelled = false;
    (async () => {
      try {
        const conn = getConnection();
        if (!conn) {
          if (!cancelled) setProfilePhone('');
          return;
        }
        const phone = await conn.procedures.getMyPhone({});
        if (cancelled) return;
        if (phone) {
          sessionStorage.setItem(cacheKey, phone);
          setProfilePhone(phone);
        } else {
          sessionStorage.removeItem(cacheKey);
          sessionStorage.removeItem(`st_telegram_chat_id_${identity.toHexString()}`);
          setProfilePhone('');
        }
      } catch (e) {
        console.error('getMyPhone failed:', e);
        if (!cancelled) setProfilePhone('');
      } finally {
        if (!cancelled) setProfileChecked(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isActive, identity, getConnection]);

  const submitProfilePhone = useCallback(
    (phoneRaw) => {
      const trimmed = phoneRaw.trim();
      if (!trimmed) {
        toast.error('Please enter a phone number');
        return;
      }
      const digits = trimmed.replace(/\D/g, '');
      if (digits.length < 10 || digits.length > 15) {
        toast.error('Enter a valid phone number (10–15 digits)');
        return;
      }
      try {
        registerPhoneReducer({ phone: trimmed });
        if (identity) {
          sessionStorage.setItem(`st_profile_phone_${identity.toHexString()}`, digits);
        }
        setProfilePhone(digits);
        posthog.capture({
          distinctId: identity?.toHexString() ?? 'anonymous',
          event: 'profile phone registered',
          properties: { phone_length: digits.length },
        });
      } catch (e) {
        console.error(e);
        toast.error(e?.message || 'Could not save phone number');
      }
    },
    [registerPhoneReducer, identity],
  );

  // ─── Telegram Chat ID (private user_profile on server) ─────────────────────────

  const [telegramChatId, setTelegramChatId] = useState(null);

  useEffect(() => {
    if (!isActive || !identity) {
      setTelegramChatId(null);
      return;
    }

    const cacheKey = `st_telegram_chat_id_${identity.toHexString()}`;

    let cancelled = false;
    (async () => {
      try {
        const conn = getConnection();
        if (!conn) return;
        const chatId = await conn.procedures.getMyTelegramChatId({});
        if (cancelled) return;
        if (chatId) {
          sessionStorage.setItem(cacheKey, chatId);
          setTelegramChatId(chatId);
        } else {
          sessionStorage.removeItem(cacheKey);
          setTelegramChatId('');
        }
      } catch (e) {
        console.error('getMyTelegramChatId failed:', e);
        if (!cancelled) setTelegramChatId('');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isActive, identity, getConnection]);

  const submitTelegramChatId = useCallback(
    (chatId) => {
      const trimmed = chatId.trim();
      if (!trimmed) {
        toast.error('Please enter a Telegram Chat ID');
        return;
      }
      try {
        setTelegramChatIdReducer({ chatId: trimmed });
        if (identity) {
          sessionStorage.setItem(`st_telegram_chat_id_${identity.toHexString()}`, trimmed);
        }
        setTelegramChatId(trimmed);
        toast.success('Telegram Chat ID saved');
        posthog.capture({
          distinctId: identity?.toHexString() ?? 'anonymous',
          event: 'telegram chat id set',
        });
      } catch (e) {
        console.error(e);
        toast.error(e?.message || 'Could not save Telegram Chat ID');
      }
    },
    [setTelegramChatIdReducer, identity],
  );

  // ─── Notification permission ──────────────────────────────────────────────────

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // ─── Chart data fetching (via SpacetimeDB procedure) ─────────────────────────

  const fetchChartForSymbol = useCallback(async (symbol) => {
    setLoading(prev => ({ ...prev, [symbol]: true }));
    setErrors(prev => ({ ...prev, [symbol]: null }));

    try {
      const conn = getConnection();
      if (!conn) throw new Error('Not connected');

      const raw = await conn.procedures.fetchChart({
        symbol,
        interval: '1m',
        range: '1d',
      });

      const parsed = JSON.parse(raw);
      setChartData(prev => ({ ...prev, [symbol]: parsed.priceHistory }));
      if (parsed.quote) {
        setChartQuoteBySymbol(prev => ({ ...prev, [symbol]: parsed.quote }));
      }
    } catch (err) {
      setErrors(prev => ({ ...prev, [symbol]: err.message || 'Failed to fetch chart data' }));
      posthog.capture({
        distinctId: identity?.toHexString() ?? 'anonymous',
        event: 'chart fetch failed',
        properties: {
          symbol,
          error: err.message || 'Failed to fetch chart data',
        },
      });
      posthog.captureException(err, identity?.toHexString() ?? 'anonymous');
    } finally {
      setLoading(prev => ({ ...prev, [symbol]: false }));
    }
  }, [getConnection, identity]);

  // Fetch chart data for all watchlist items on initial connection
  const hasFetchedInitial = useRef(false);
  useEffect(() => {
    if (!isActive || !watchlistReady || hasFetchedInitial.current) return;
    hasFetchedInitial.current = true;
    for (const item of watchlistItems) {
      fetchChartForSymbol(item.symbol);
    }
  }, [isActive, watchlistReady, watchlistItems, fetchChartForSymbol]);

  // ─── Public API (same shape as before so components don't change) ─────────────

  // watchlist: string[] of symbols
  const watchlist = watchlistItems.map(item => item.symbol);

  const finiteOrUndef = (v) => {
    if (v == null) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };

  // stockData: { [symbol]: quote object } — SpacetimeDB rows merged with fetchChart quote extras
  const stockData = {};
  for (const sp of stockPrices) {
    const q = chartQuoteBySymbol[sp.symbol];
    const openFromQuote = finiteOrUndef(q?.open);
    const openFromFirstBar = finiteOrUndef(chartData[sp.symbol]?.[0]?.barOpen);
    stockData[sp.symbol] = {
      symbol: sp.symbol,
      name: sp.name,
      exchange: sp.exchange,
      currency: sp.currency,
      currentPrice: sp.price,
      previousClose: sp.previousClose,
      change: sp.change,
      changePercent: sp.changePercent,
      dayHigh: sp.dayHigh,
      dayLow: sp.dayLow,
      volume: sp.volume,
      lastUpdated: sp.lastUpdated?.toDate?.()?.toLocaleTimeString('en-IN') ?? '',
      // quote.open is often absent from chart meta; first intraday bar's barOpen is session open
      open: openFromQuote ?? openFromFirstBar,
      fiftyTwoWeekHigh: q?.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: q?.fiftyTwoWeekLow,
    };
  }

  // alerts: shaped to match the existing AlertsPanel / AlertForm expectations
  const alertsList = alerts.map(a => ({
    id: String(a.id),
    symbol: a.symbol,
    targetPrice: a.targetPrice,
    type: a.alertType,
    active: a.active,
    createdAt: a.createdAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
    triggeredAt: a.triggeredAt?.toDate?.()?.toISOString() ?? null,
  }));

  const addToWatchlist = useCallback((symbol) => {
    addToWatchlistReducer({ symbol });
    // Optimistically fetch chart data immediately
    fetchChartForSymbol(symbol.trim().toUpperCase());
    posthog.capture({
      distinctId: identity?.toHexString() ?? 'anonymous',
      event: 'stock added',
      properties: { symbol: symbol.trim().toUpperCase() },
    });
  }, [addToWatchlistReducer, fetchChartForSymbol, identity]);

  const removeFromWatchlist = useCallback((symbol) => {
    removeFromWatchlistReducer({ symbol });
    setChartData(prev => { const n = { ...prev }; delete n[symbol]; return n; });
    setChartQuoteBySymbol(prev => { const n = { ...prev }; delete n[symbol]; return n; });
    setErrors(prev => { const n = { ...prev }; delete n[symbol]; return n; });
    posthog.capture({
      distinctId: identity?.toHexString() ?? 'anonymous',
      event: 'stock removed',
      properties: { symbol },
    });
  }, [removeFromWatchlistReducer, identity]);

  const addAlert = useCallback((symbol, targetPrice, type) => {
    addAlertReducer({ symbol, targetPrice: parseFloat(targetPrice), alertType: type });
    toast.info(
      `Alert set: ${symbol} ${type === 'above' ? '≥' : '≤'} ₹${parseFloat(targetPrice).toLocaleString('en-IN')}`,
      { autoClose: 3000 }
    );
    posthog.capture({
      distinctId: identity?.toHexString() ?? 'anonymous',
      event: 'alert created',
      properties: {
        symbol,
        target_price: parseFloat(targetPrice),
        alert_type: type,
      },
    });
  }, [addAlertReducer, identity]);

  const removeAlert = useCallback((alertId) => {
    removeAlertReducer({ alertId: BigInt(alertId) });
    triggeredAlertsRef.current.delete(alertId);
    posthog.capture({
      distinctId: identity?.toHexString() ?? 'anonymous',
      event: 'alert removed',
      properties: { alert_id: alertId },
    });
  }, [removeAlertReducer, identity]);

  const toggleAlert = useCallback((alertId) => {
    toggleAlertReducer({ alertId: BigInt(alertId) });
    posthog.capture({
      distinctId: identity?.toHexString() ?? 'anonymous',
      event: 'alert toggled',
      properties: { alert_id: alertId },
    });
  }, [toggleAlertReducer, identity]);

  const refreshStock = useCallback((symbol) => {
    fetchChartForSymbol(symbol);
    posthog.capture({
      distinctId: identity?.toHexString() ?? 'anonymous',
      event: 'chart refreshed',
      properties: { symbol },
    });
  }, [fetchChartForSymbol, identity]);

  return {
    watchlist,
    watchlistReady,
    alerts: alertsList,
    stockData,
    chartData,
    loading,
    errors,
    isConnected: isActive,
    addToWatchlist,
    removeFromWatchlist,
    addAlert,
    removeAlert,
    toggleAlert,
    refreshStock,
    profileResolved: profileChecked,
    needsPhonePrompt: profileChecked && profilePhone === '',
    profilePhone: profilePhone && profilePhone.length > 0 ? profilePhone : null,
    submitProfilePhone,
    telegramChatId: telegramChatId || null,
    submitTelegramChatId,
  };
}
