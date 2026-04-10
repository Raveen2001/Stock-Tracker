import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { fetchStockChart, StockWebSocket } from "../services/stockApi";

const STORAGE_KEY = "stock-tracker-watchlist";
const ALERTS_KEY = "stock-tracker-alerts";

function loadFromStorage(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

export function useStockTracker() {
  const [watchlist, setWatchlist] = useState(() =>
    loadFromStorage(STORAGE_KEY, []),
  );
  const [alerts, setAlerts] = useState(() => loadFromStorage(ALERTS_KEY, []));
  const [stockData, setStockData] = useState({});
  const [chartData, setChartData] = useState({});
  const [loading, setLoading] = useState({});
  const [errors, setErrors] = useState({});
  const [wsStatus, setWsStatus] = useState("disconnected");

  const wsRef = useRef(null);
  const triggeredAlertsRef = useRef(new Set());
  const alertsRef = useRef(alerts);

  useEffect(() => {
    alertsRef.current = alerts;
  }, [alerts]);

  useEffect(() => {
    saveToStorage(STORAGE_KEY, watchlist);
  }, [watchlist]);

  useEffect(() => {
    saveToStorage(ALERTS_KEY, alerts);
  }, [alerts]);

  // Request notification permission
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // ─── Alert checker ───
  const checkAlerts = useCallback((symbol, price) => {
    alertsRef.current.forEach((alert) => {
      if (!alert.active || alert.symbol !== symbol) return;
      if (triggeredAlertsRef.current.has(alert.id)) return;

      let triggered = false;
      let message = "";

      if (alert.type === "above" && price >= alert.targetPrice) {
        triggered = true;
        message = `${symbol} reached ₹${price.toLocaleString("en-IN")} (target: ₹${alert.targetPrice.toLocaleString("en-IN")} ↑)`;
      } else if (alert.type === "below" && price <= alert.targetPrice) {
        triggered = true;
        message = `${symbol} dropped to ₹${price.toLocaleString("en-IN")} (target: ₹${alert.targetPrice.toLocaleString("en-IN")} ↓)`;
      }

      if (triggered) {
        triggeredAlertsRef.current.add(alert.id);

        toast.success(message, { position: "top-right", autoClose: 10000 });

        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("Stock Alert!", {
            body: message,
            icon: "/favicon.ico",
          });
        }

        setAlerts((prev) =>
          prev.map((a) =>
            a.id === alert.id
              ? { ...a, active: false, triggeredAt: new Date().toISOString() }
              : a,
          ),
        );
      }
    });
  }, []);

  // ─── WebSocket for live price updates ───
  useEffect(() => {
    const ws = new StockWebSocket(
      (update) => {
        setStockData((prev) => {
          const existing = prev[update.symbol];
          if (!existing) return prev;

          return {
            ...prev,
            [update.symbol]: {
              ...existing,
              currentPrice: update.price,
              change: parseFloat(update.change?.toFixed(2)) ?? existing.change,
              changePercent:
                parseFloat(update.changePercent?.toFixed(2)) ??
                existing.changePercent,
              dayHigh: update.dayHigh || existing.dayHigh,
              dayLow: update.dayLow || existing.dayLow,
              volume: update.volume || existing.volume,
              lastUpdated: new Date().toLocaleTimeString("en-IN"),
            },
          };
        });

        checkAlerts(update.symbol, update.price);
      },
      (status) => setWsStatus(status),
    );

    wsRef.current = ws;
    return () => ws.close();
  }, [checkAlerts]);

  // Subscribe when watchlist changes
  useEffect(() => {
    if (!wsRef.current) return;
    if (watchlist.length > 0) {
      wsRef.current.subscribe(watchlist);
    }
  }, [watchlist]);

  // ─── Fetch initial chart + quote data ───
  const fetchStock = useCallback(async (symbol) => {
    setLoading((prev) => ({ ...prev, [symbol]: true }));
    setErrors((prev) => ({ ...prev, [symbol]: null }));

    try {
      const { quote, priceHistory } = await fetchStockChart(symbol);
      setStockData((prev) => ({ ...prev, [symbol]: quote }));
      setChartData((prev) => ({ ...prev, [symbol]: priceHistory }));
      return quote;
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [symbol]: err.message || "Failed to fetch data",
      }));
      return null;
    } finally {
      setLoading((prev) => ({ ...prev, [symbol]: false }));
    }
  }, []);

  // Fetch all on mount
  useEffect(() => {
    watchlist.forEach((symbol) => fetchStock(symbol));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addToWatchlist = useCallback(
    (symbol) => {
      setWatchlist((prev) => {
        if (prev.includes(symbol)) return prev;
        return [...prev, symbol];
      });
      fetchStock(symbol);
      if (wsRef.current) wsRef.current.subscribe(symbol);
    },
    [fetchStock],
  );

  const removeFromWatchlist = useCallback((symbol) => {
    setWatchlist((prev) => prev.filter((s) => s !== symbol));
    setStockData((prev) => {
      const n = { ...prev };
      delete n[symbol];
      return n;
    });
    setChartData((prev) => {
      const n = { ...prev };
      delete n[symbol];
      return n;
    });
    setAlerts((prev) => prev.filter((a) => a.symbol !== symbol));
    if (wsRef.current) wsRef.current.unsubscribe(symbol);
  }, []);

  const addAlert = useCallback((symbol, targetPrice, type) => {
    const newAlert = {
      id: Date.now().toString(),
      symbol,
      targetPrice: parseFloat(targetPrice),
      type,
      active: true,
      createdAt: new Date().toISOString(),
      triggeredAt: null,
    };
    setAlerts((prev) => [...prev, newAlert]);
    toast.info(
      `Alert set: ${symbol} ${type === "above" ? "≥" : "≤"} ₹${parseFloat(targetPrice).toLocaleString("en-IN")}`,
      { autoClose: 3000 },
    );
  }, []);

  const removeAlert = useCallback((alertId) => {
    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    triggeredAlertsRef.current.delete(alertId);
  }, []);

  const toggleAlert = useCallback((alertId) => {
    setAlerts((prev) =>
      prev.map((a) => {
        if (a.id !== alertId) return a;
        const newActive = !a.active;
        if (newActive) triggeredAlertsRef.current.delete(alertId);
        return {
          ...a,
          active: newActive,
          triggeredAt: newActive ? null : a.triggeredAt,
        };
      }),
    );
  }, []);

  return {
    watchlist,
    alerts,
    stockData,
    chartData,
    loading,
    errors,
    wsStatus,
    addToWatchlist,
    removeFromWatchlist,
    addAlert,
    removeAlert,
    toggleAlert,
    refreshStock: fetchStock,
  };
}
