import { BarChart3, Bell, LayoutGrid, Wifi, WifiOff } from "lucide-react";
import React, { useState } from "react";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./App.css";
import AlertsPanel from "./components/AlertsPanel";
import StockCard from "./components/StockCard";
import StockSearch from "./components/StockSearch";
import { useStockTracker } from "./hooks/useStockTracker";

function App() {
  const [activeTab, setActiveTab] = useState("watchlist");
  const {
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
    refreshStock,
  } = useStockTracker();

  const activeAlertCount = alerts.filter((a) => a.active).length;

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <div className="logo">
            <BarChart3 size={28} />
            <h1>Stock Tracker</h1>
            <span className="subtitle">NSE & BSE</span>
          </div>
          <div className="header-stats">
            <span className={`stat ws-status ${wsStatus}`}>
              {wsStatus === "connected" ? (
                <Wifi size={14} />
              ) : (
                <WifiOff size={14} />
              )}
              {wsStatus === "connected"
                ? "Live"
                : wsStatus === "connecting"
                  ? "Connecting..."
                  : "Offline"}
            </span>
            <span className="stat">
              <LayoutGrid size={14} /> {watchlist.length} stocks
            </span>
            <span className="stat">
              <Bell size={14} /> {activeAlertCount} alerts
            </span>
          </div>
        </div>
      </header>

      <main className="app-main">
        <StockSearch onAdd={addToWatchlist} watchlist={watchlist} />

        <div className="tabs">
          <button
            className={`tab ${activeTab === "watchlist" ? "active" : ""}`}
            onClick={() => setActiveTab("watchlist")}
          >
            <LayoutGrid size={16} /> Watchlist ({watchlist.length})
          </button>
          <button
            className={`tab ${activeTab === "alerts" ? "active" : ""}`}
            onClick={() => setActiveTab("alerts")}
          >
            <Bell size={16} /> Alerts
            {activeAlertCount > 0 && (
              <span className="alert-count-badge">{activeAlertCount}</span>
            )}
          </button>
        </div>

        {activeTab === "watchlist" && (
          <div className="watchlist">
            {watchlist.length === 0 ? (
              <div className="empty-state">
                <BarChart3 size={60} strokeWidth={1} />
                <h2>Your watchlist is empty</h2>
                <p>Search for stocks above and add them to start tracking</p>
              </div>
            ) : (
              <div className="stock-grid">
                {watchlist.map((symbol) => (
                  <StockCard
                    key={symbol}
                    data={stockData[symbol]}
                    chartData={chartData[symbol]}
                    loading={loading[symbol]}
                    error={errors[symbol]}
                    alerts={alerts}
                    onRemove={() => removeFromWatchlist(symbol)}
                    onAddAlert={addAlert}
                    onRefresh={() => refreshStock(symbol)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "alerts" && (
          <AlertsPanel
            alerts={alerts}
            stockData={stockData}
            onRemove={removeAlert}
            onToggle={toggleAlert}
          />
        )}
      </main>

      <footer className="app-footer">
        <p>Market hours: Mon-Fri 9:15 AM - 3:30 PM IST.</p>
      </footer>

      <ToastContainer
        position="top-right"
        autoClose={5000}
        newestOnTop
        theme="dark"
      />
    </div>
  );
}

export default App;
