import React, { useState } from 'react';

export default function AlertForm({ symbol, currentPrice, onSubmit }) {
  const [targetPrice, setTargetPrice] = useState('');
  const [type, setType] = useState('above');

  const handleSubmit = (e) => {
    e.preventDefault();
    const price = parseFloat(targetPrice);
    if (isNaN(price) || price <= 0) return;
    onSubmit(price, type);
    setTargetPrice('');
  };

  return (
    <form className="alert-form" onSubmit={handleSubmit}>
      <div className="alert-form-row">
        <div className="alert-form-group">
          <label>Alert when price goes</label>
          <div className="alert-type-toggle">
            <button
              type="button"
              className={`toggle-btn ${type === 'above' ? 'active above' : ''}`}
              onClick={() => setType('above')}
            >
              Above
            </button>
            <button
              type="button"
              className={`toggle-btn ${type === 'below' ? 'active below' : ''}`}
              onClick={() => setType('below')}
            >
              Below
            </button>
          </div>
        </div>
        <div className="alert-form-group">
          <label>Target Price (₹)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={targetPrice}
            onChange={(e) => setTargetPrice(e.target.value)}
            placeholder={currentPrice?.toFixed(2)}
            className="alert-price-input"
            required
          />
        </div>
        <button type="submit" className="btn btn-primary btn-submit">
          Set Alert
        </button>
      </div>
      <p className="alert-form-hint">
        Current price: ₹{currentPrice?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
      </p>
    </form>
  );
}
