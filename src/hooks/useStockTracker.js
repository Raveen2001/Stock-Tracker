import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { useSpacetimeDB, useTable, useReducer } from 'spacetimedb/react';
import { tables, reducers } from '../module_bindings/index.ts';
import posthog from '../posthog';

export function useStockTracker() {
  const { identity, isActive, getConnection } = useSpacetimeDB();

  // ─── Account state ──────────────────────────────────────────────────────────

  const [profilePhone, setProfilePhone] = useState(null);
  const [profileChecked, setProfileChecked] = useState(false);
  const [accountId, setAccountId] = useState(null);
  const [loginError, setLoginError] = useState(null);

  // ─── Server-synced state via SpacetimeDB subscriptions ───────────────────────

  const [watchlistItems, watchlistReady] = useTable(
    accountId ? tables.watchlistItem.where(r => r.accountId.eq(BigInt(accountId))) : tables.watchlistItem,
    {
      onInsert: item => {
        if (accountId && item.accountId.toString() === accountId) {
          fetchChartForSymbol(item.symbol);
        }
      },
    }
  );

  const [stockPrices, pricesReady] = useTable(tables.stockPrice);

  const triggeredAlertsRef = useRef(new Set());

  const [alerts, alertsReady] = useTable(
    accountId ? tables.alert.where(r => r.accountId.eq(BigInt(accountId))) : tables.alert,
    {
      onUpdate: (_oldAlert, newAlert) => {
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
  const [chartQuoteBySymbol, setChartQuoteBySymbol] = useState({});
  const [loading, setLoading] = useState({});
  const [errors, setErrors] = useState({});

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
  const registerReducer = useReducer(reducers.register);
  const loginReducer = useReducer(reducers.login);
  const setTelegramChatIdReducer = useReducer(reducers.setTelegramChatId);

  // ─── Profile check on connection ────────────────────────────────────────────

  useEffect(() => {
    if (!isActive || !identity) {
      setProfilePhone(null);
      setProfileChecked(false);
      setAccountId(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const conn = getConnection();
        if (!conn) {
          if (!cancelled) setProfilePhone('');
          return;
        }
        const [phone, acctId] = await Promise.all([
          conn.procedures.getMyPhone({}),
          conn.procedures.getMyAccountId({}),
        ]);
        if (cancelled) return;
        if (phone && acctId) {
          setProfilePhone(phone);
          setAccountId(acctId);
        } else {
          setProfilePhone('');
          setAccountId(null);
        }
      } catch (e) {
        console.error('Profile check failed:', e);
        if (!cancelled) {
          setProfilePhone('');
          setAccountId(null);
        }
      } finally {
        if (!cancelled) setProfileChecked(true);
      }
    })();

    return () => { cancelled = true; };
  }, [isActive, identity, getConnection]);

  // ─── Login / Register ────────────────────────────────────────────────────────

  const submitLogin = useCallback(
    async (phone, password, isRegister) => {
      const digits = phone.replace(/\D/g, '');
      if (digits.length < 10 || digits.length > 15) {
        setLoginError('Enter a valid phone number (10–15 digits)');
        return;
      }
      if (!password || password.length < 4) {
        setLoginError('Password must be at least 4 characters');
        return;
      }

      setLoginError(null);

      try {
        if (isRegister) {
          registerReducer({ phone, password });
        } else {
          loginReducer({ phone, password });
        }

        // Wait a moment for the reducer to process, then check profile
        await new Promise(r => setTimeout(r, 1000));

        const conn = getConnection();
        if (conn) {
          const [ph, acctId] = await Promise.all([
            conn.procedures.getMyPhone({}),
            conn.procedures.getMyAccountId({}),
          ]);
          if (ph && acctId) {
            setProfilePhone(ph);
            setAccountId(acctId);
            posthog.capture({
              distinctId: identity?.toHexString() ?? 'anonymous',
              event: isRegister ? 'account registered' : 'account login',
              properties: { phone_length: digits.length },
            });
          } else {
            setLoginError(isRegister
              ? 'Registration failed. Phone may already be in use.'
              : 'Login failed. Check your credentials.');
          }
        }
      } catch (e) {
        console.error(e);
        setLoginError(e?.message || 'Authentication failed');
      }
    },
    [registerReducer, loginReducer, getConnection, identity],
  );

  // ─── Telegram Chat ID ───────────────────────────────────────────────────────

  const [telegramChatId, setTelegramChatId] = useState(null);

  useEffect(() => {
    if (!isActive || !identity || !accountId) {
      setTelegramChatId(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const conn = getConnection();
        if (!conn) return;
        const chatId = await conn.procedures.getMyTelegramChatId({});
        if (cancelled) return;
        setTelegramChatId(chatId || '');
      } catch (e) {
        console.error('getMyTelegramChatId failed:', e);
        if (!cancelled) setTelegramChatId('');
      }
    })();

    return () => { cancelled = true; };
  }, [isActive, identity, accountId, getConnection]);

  const submitTelegramChatId = useCallback(
    (chatId) => {
      const trimmed = chatId.trim();
      if (!trimmed) {
        toast.error('Please enter a Telegram Chat ID');
        return;
      }
      try {
        setTelegramChatIdReducer({ chatId: trimmed });
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

  const hasFetchedInitial = useRef(false);
  useEffect(() => {
    if (!isActive || !watchlistReady || hasFetchedInitial.current) return;
    hasFetchedInitial.current = true;
    for (const item of watchlistItems) {
      fetchChartForSymbol(item.symbol);
    }
  }, [isActive, watchlistReady, watchlistItems, fetchChartForSymbol]);

  // ─── Public API ─────────────────────────────────────────────────────────────

  const watchlist = watchlistItems.map(item => item.symbol);

  const finiteOrUndef = (v) => {
    if (v == null) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };

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
      open: openFromQuote ?? openFromFirstBar,
      fiftyTwoWeekHigh: q?.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: q?.fiftyTwoWeekLow,
    };
  }

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
    needsLogin: profileChecked && profilePhone === '',
    profilePhone: profilePhone && profilePhone.length > 0 ? profilePhone : null,
    submitLogin,
    loginError,
    telegramChatId: telegramChatId || null,
    submitTelegramChatId,
  };
}
