import React, { useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Trash2,
  Bell,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import StockChart from './StockChart';
import AlertForm from './AlertForm';
import ConfirmDialog from './ConfirmDialog';

export default function StockCard({
  symbol,
  data,
  chartData,
  loading,
  error,
  alerts,
  onRemove,
  onAddAlert,
  onRefresh,
}) {
  const [expanded, setExpanded] = useState(false);
  const [showAlertForm, setShowAlertForm] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  if (error) {
    return (
      <div className="stock-card stock-card-error">
        <div className="stock-card-header">
          <div>
            <h3 className="stock-symbol">{data?.symbol || symbol || 'Unknown'}</h3>
            <p className="stock-error-msg">{error}</p>
          </div>
          <div className="stock-actions">
            <button onClick={onRefresh} className="icon-btn" title="Retry">
              <RefreshCw size={16} />
            </button>
            <button onClick={() => setConfirmRemove(true)} className="icon-btn danger" title="Remove">
              <Trash2 size={16} />
            </button>
          </div>
        </div>
        {confirmRemove && (
          <ConfirmDialog
            message={`Remove ${data?.symbol || symbol || 'this stock'} from your watchlist?`}
            onConfirm={() => { setConfirmRemove(false); onRemove(); }}
            onCancel={() => setConfirmRemove(false)}
          />
        )}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="stock-card stock-card-loading">
        <div className="skeleton-line wide" />
        <div className="skeleton-line medium" />
        <div className="skeleton-line narrow" />
      </div>
    );
  }

  const isPositive = data.change >= 0;
  const stockAlerts = alerts.filter((a) => a.symbol === data.symbol);

  return (
    <div className={`stock-card ${isPositive ? 'positive' : 'negative'}`}>
      <div className="stock-card-header" onClick={() => setExpanded(!expanded)}>
        <div className="stock-info">
          <div className="stock-title-row">
            <h3 className="stock-symbol">{data.symbol}</h3>
            <span className={`exchange-badge ${data.exchange?.toLowerCase()}`}>
              {data.exchange}
            </span>
            {loading && <RefreshCw size={14} className="spinning" />}
          </div>
          <p className="stock-name">{data.name}</p>
          <p className="stock-price-meta">
            {data.lastUpdated
              ? `Live price updated ${data.lastUpdated}`
              : 'Live price · waiting for first update…'}
          </p>
        </div>

        <div className="stock-price-section">
          <div className="stock-price">
            ₹{data.currentPrice?.toLocaleString('en-IN', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
          <div className={`stock-change ${isPositive ? 'up' : 'down'}`}>
            {isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            <span>
              {isPositive ? '+' : ''}
              {data.change?.toFixed(2)} ({isPositive ? '+' : ''}
              {data.changePercent?.toFixed(2)}%)
            </span>
          </div>
        </div>

        <div className="expand-icon">
          {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
      </div>

      {expanded && (
        <div className="stock-card-body">
          <div className="stock-details">
            <div className="detail-item">
              <span className="detail-label">Open</span>
              <span className="detail-value">
                ₹{data.open?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || 'N/A'}
              </span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Day High</span>
              <span className="detail-value">
                ₹{data.dayHigh?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || 'N/A'}
              </span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Day Low</span>
              <span className="detail-value">
                ₹{data.dayLow?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || 'N/A'}
              </span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Prev Close</span>
              <span className="detail-value">
                ₹{data.previousClose?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || 'N/A'}
              </span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Volume</span>
              <span className="detail-value">
                {data.volume?.toLocaleString('en-IN') || 'N/A'}
              </span>
            </div>
            <div className="detail-item">
              <span className="detail-label">52W High</span>
              <span className="detail-value">
                ₹{data.fiftyTwoWeekHigh?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || 'N/A'}
              </span>
            </div>
            <div className="detail-item">
              <span className="detail-label">52W Low</span>
              <span className="detail-value">
                ₹{data.fiftyTwoWeekLow?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || 'N/A'}
              </span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Currency</span>
              <span className="detail-value">{data.currency || 'INR'}</span>
            </div>
          </div>

          {chartData && chartData.length > 0 && (
            <StockChart data={chartData} isPositive={isPositive} />
          )}

          <div className="stock-alerts-section">
            <div className="alerts-header">
              <h4>
                <Bell size={14} /> Price Alerts ({stockAlerts.length})
              </h4>
              <button
                className="btn btn-sm btn-primary"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAlertForm(!showAlertForm);
                }}
              >
                {showAlertForm ? 'Cancel' : '+ Set Alert'}
              </button>
            </div>

            {showAlertForm && (
              <AlertForm
                symbol={data.symbol}
                currentPrice={data.currentPrice}
                onSubmit={(target, type) => {
                  onAddAlert(data.symbol, target, type);
                  setShowAlertForm(false);
                }}
              />
            )}

            {stockAlerts.length > 0 && (
              <div className="alerts-list">
                {stockAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`alert-item ${alert.active ? 'active' : 'triggered'}`}
                  >
                    <div className="alert-info">
                      <span className={`alert-type ${alert.type}`}>
                        {alert.type === 'above' ? '↑ Above' : '↓ Below'}
                      </span>
                      <span className="alert-target">
                        ₹{alert.targetPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <span className={`alert-status ${alert.active ? '' : 'done'}`}>
                      {alert.active ? 'Active' : 'Triggered'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="stock-card-footer">
            <span className="last-updated">
              Live price: {data.lastUpdated || '—'}
            </span>
            <div className="stock-actions">
              <button
                onClick={onRefresh}
                className="icon-btn"
                title="Reload intraday chart (live price updates automatically)"
              >
                <RefreshCw size={16} />
              </button>
              <button onClick={() => setConfirmRemove(true)} className="icon-btn danger" title="Remove">
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmRemove && (
        <ConfirmDialog
          message={`Remove ${data?.symbol || symbol} from your watchlist?`}
          onConfirm={() => { setConfirmRemove(false); onRemove(); }}
          onCancel={() => setConfirmRemove(false)}
        />
      )}
    </div>
  );
}
