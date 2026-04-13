import React, { useState, useRef, useEffect } from 'react';
import { Search, Plus, Loader } from 'lucide-react';
import { searchStocks } from '../services/stockApi';
import posthog from '../posthog';

export default function StockSearch({ onAdd, watchlist }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target) &&
        !inputRef.current.contains(e.target)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSearch = (value) => {
    setQuery(value);
    clearTimeout(debounceRef.current);

    if (value.length < 2) {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const matches = await searchStocks(value);
      setResults(matches);
      setShowDropdown(true);
      setSearching(false);
      posthog.capture({
        distinctId: 'anonymous',
        event: 'stock searched',
        properties: {
          query: value,
          result_count: matches.length,
        },
      });
    }, 300);
  };

  const handleAdd = (stock) => {
    onAdd(stock.symbol);
    setQuery('');
    setResults([]);
    setShowDropdown(false);
    posthog.capture({
      distinctId: 'anonymous',
      event: 'stock search result selected',
      properties: {
        symbol: stock.symbol,
        name: stock.name,
        exchange: stock.exchange,
      },
    });
  };

  return (
    <div className="stock-search">
      <div className="search-input-wrapper">
        <Search size={18} className="search-icon" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search NSE & BSE stocks (e.g., RELIANCE, TCS, INFY)..."
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={() => query.length >= 2 && setShowDropdown(true)}
          className="search-input"
        />
        {searching && <Loader size={16} className="spinning search-spinner" />}
      </div>

      {showDropdown && results.length > 0 && (
        <div className="search-dropdown" ref={dropdownRef}>
          {results.map((stock) => {
            const isAdded = watchlist.includes(stock.symbol);
            return (
              <div
                key={`${stock.symbol}-${stock.exchange}`}
                className={`search-result ${isAdded ? 'added' : ''}`}
                onClick={() => !isAdded && handleAdd(stock)}
              >
                <div className="search-result-info">
                  <span className="search-result-symbol">{stock.symbol}</span>
                  <span className="search-result-name">{stock.name}</span>
                </div>
                <div className="search-result-actions">
                  <span className={`exchange-badge ${stock.exchange.toLowerCase()}`}>
                    {stock.exchange}
                  </span>
                  {stock.type && (
                    <span className="type-badge">{stock.type}</span>
                  )}
                  {isAdded ? (
                    <span className="added-label">Added</span>
                  ) : (
                    <button className="add-btn" title="Add to watchlist">
                      <Plus size={16} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showDropdown && !searching && results.length === 0 && query.length >= 2 && (
        <div className="search-dropdown" ref={dropdownRef}>
          <div className="search-empty">No stocks found for "{query}"</div>
        </div>
      )}
    </div>
  );
}
