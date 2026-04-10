import React from 'react';
import { Bell, BellOff, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';

export default function AlertsPanel({ alerts, stockData, onRemove, onToggle }) {
  if (alerts.length === 0) {
    return (
      <div className="alerts-panel empty">
        <BellOff size={40} strokeWidth={1.5} />
        <p>No alerts set yet</p>
        <p className="hint">Expand a stock card and click "Set Alert" to get started</p>
      </div>
    );
  }

  const activeAlerts = alerts.filter((a) => a.active);
  const triggeredAlerts = alerts.filter((a) => !a.active);

  return (
    <div className="alerts-panel">
      <h3>
        <Bell size={18} /> All Alerts ({alerts.length})
      </h3>

      {activeAlerts.length > 0 && (
        <div className="alerts-group">
          <h4 className="alerts-group-title active">Active ({activeAlerts.length})</h4>
          {activeAlerts.map((alert) => {
            const stock = stockData[alert.symbol];
            const currentPrice = stock?.currentPrice;
            const progress = currentPrice && alert.targetPrice
              ? alert.type === 'above'
                ? Math.min(100, (currentPrice / alert.targetPrice) * 100)
                : Math.min(100, (alert.targetPrice / currentPrice) * 100)
              : 0;

            return (
              <div key={alert.id} className="alert-panel-item active">
                <div className="alert-panel-main">
                  <div className="alert-panel-info">
                    <span className="alert-panel-symbol">
                      {alert.symbol.replace('.NS', '').replace('.BO', '')}
                    </span>
                    <span className={`alert-type-badge ${alert.type}`}>
                      {alert.type === 'above' ? '↑' : '↓'} ₹{alert.targetPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="alert-panel-actions">
                    <button onClick={() => onToggle(alert.id)} className="icon-btn" title="Pause alert">
                      <ToggleRight size={20} className="toggle-on" />
                    </button>
                    <button onClick={() => onRemove(alert.id)} className="icon-btn danger" title="Delete">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                {currentPrice && (
                  <div className="alert-progress">
                    <div className="progress-bar">
                      <div
                        className={`progress-fill ${alert.type}`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <span className="progress-label">
                      Current: ₹{currentPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {triggeredAlerts.length > 0 && (
        <div className="alerts-group">
          <h4 className="alerts-group-title triggered">Triggered ({triggeredAlerts.length})</h4>
          {triggeredAlerts.map((alert) => (
            <div key={alert.id} className="alert-panel-item triggered">
              <div className="alert-panel-main">
                <div className="alert-panel-info">
                  <span className="alert-panel-symbol">
                    {alert.symbol.replace('.NS', '').replace('.BO', '')}
                  </span>
                  <span className={`alert-type-badge ${alert.type}`}>
                    {alert.type === 'above' ? '↑' : '↓'} ₹{alert.targetPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                  <span className="triggered-time">
                    {alert.triggeredAt && new Date(alert.triggeredAt).toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="alert-panel-actions">
                  <button onClick={() => onToggle(alert.id)} className="icon-btn" title="Re-enable">
                    <ToggleLeft size={20} className="toggle-off" />
                  </button>
                  <button onClick={() => onRemove(alert.id)} className="icon-btn danger" title="Delete">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
