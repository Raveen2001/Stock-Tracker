import {
  BarChart3,
  Bell,
  Info,
  LayoutGrid,
  Loader2,
  Wifi,
  WifiOff,
} from "lucide-react";
import React, { useState } from "react";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./App.css";
import AlertsPanel from "./components/AlertsPanel";
import LoginForm from "./components/LoginForm";
import StockCard from "./components/StockCard";
import StockSearch from "./components/StockSearch";
import TelegramSettings from "./components/TelegramSettings";
import { useStockTracker } from "./hooks/useStockTracker";

function App() {
  const [activeTab, setActiveTab] = useState("watchlist");
  const {
    watchlist,
    watchlistReady,
    alerts,
    stockData,
    chartData,
    loading,
    errors,
    isConnected,
    addToWatchlist,
    removeFromWatchlist,
    addAlert,
    removeAlert,
    toggleAlert,
    refreshStock,
    profileResolved,
    needsLogin,
    submitLogin,
    loginError,
    telegramChatId,
    submitTelegramChatId,
  } = useStockTracker();

  const activeAlertCount = alerts.filter((a) => a.active).length;

  return (
    <div className="app">
      {profileResolved && needsLogin ? (
        <LoginForm onSubmit={submitLogin} error={loginError} />
      ) : null}
      <header className="app-header">
        <div className="header-content">
          <div className="logo">
            <BarChart3 size={28} />
            <h1>Stock Tracker</h1>
            <span className="subtitle">NSE & BSE</span>
          </div>
          <div className="header-stats">
            <span
              className={`stat ws-status ${isConnected ? "connected" : "disconnected"}`}
            >
              {isConnected ? <Wifi size={14} /> : <WifiOff size={14} />}
              {isConnected ? "Live" : "Connecting..."}
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
        {!profileResolved ? (
          <div
            className="home-initial-loading"
            role="status"
            aria-live="polite"
          >
            <Loader2
              size={40}
              className="home-initial-loading-icon spinning"
              aria-hidden
            />
            <p className="home-initial-loading-title">
              {isConnected ? "Loading your profile…" : "Connecting…"}
            </p>
            <p className="home-initial-loading-hint">
              {isConnected
                ? "Checking your account."
                : "Establishing a live connection to SpacetimeDB."}
            </p>
          </div>
        ) : needsLogin ? null : !watchlistReady ? (
          <div
            className="home-initial-loading"
            role="status"
            aria-live="polite"
          >
            <Loader2
              size={40}
              className="home-initial-loading-icon spinning"
              aria-hidden
            />
            <p className="home-initial-loading-title">
              {isConnected ? "Loading your watchlist…" : "Connecting…"}
            </p>
            <p className="home-initial-loading-hint">
              {isConnected
                ? "Syncing symbols from the server."
                : "Establishing a live connection to SpacetimeDB."}
            </p>
          </div>
        ) : (
          <>
            <StockSearch onAdd={addToWatchlist} watchlist={watchlist} />

            <TelegramSettings
              telegramChatId={telegramChatId}
              onSave={submitTelegramChatId}
            />

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
                    <p>
                      Search for stocks above and add them to start tracking
                    </p>
                  </div>
                ) : (
                  <div className="stock-grid">
                    {watchlist.map((symbol) => (
                      <StockCard
                        key={symbol}
                        symbol={symbol}
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

            <div className="data-refresh-notice" role="status">
              <Info
                size={16}
                className="data-refresh-notice-icon"
                aria-hidden
              />
              <p>
                Live prices are fetched from the server about every{" "}
                <strong>5 seconds</strong> while you&apos;re connected. Expand a
                card and use <strong>refresh</strong> to reload that
                stock&apos;s intraday chart.
              </p>
            </div>
          </>
        )}
      </main>

      <footer className="app-footer">
        <p>Market hours: Mon-Fri 9:15 AM - 3:30 PM IST.</p>
      </footer>

      <ToastContainer
        position="top-right"
        autoClose={5000}
        newestOnTop
        theme="light"
      />
    </div>
  );
}

export default App;
