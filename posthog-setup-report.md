<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into the Stock Tracker application. A new `src/posthog.js` singleton was created to initialize the PostHog Node SDK (using the edge-compatible entrypoint), reading credentials from environment variables. Event capture was added to `src/hooks/useStockTracker.js` for all major user actions — watchlist management, alert lifecycle, chart refreshes, and error tracking — using the SpacetimeDB identity as the distinct ID. Search events were instrumented in `src/components/StockSearch.jsx`. Exception capture via `posthog.captureException` was also added to the chart fetch error handler.

| Event | Description | File |
|---|---|---|
| `stock added` | User adds a stock symbol to their watchlist | `src/hooks/useStockTracker.js` |
| `stock removed` | User removes a stock symbol from their watchlist | `src/hooks/useStockTracker.js` |
| `alert created` | User creates a price alert for a stock | `src/hooks/useStockTracker.js` |
| `alert removed` | User deletes a price alert | `src/hooks/useStockTracker.js` |
| `alert toggled` | User enables or disables a price alert | `src/hooks/useStockTracker.js` |
| `alert triggered` | Server fires a price alert when target price is reached | `src/hooks/useStockTracker.js` |
| `chart refreshed` | User manually refreshes intraday chart data for a stock | `src/hooks/useStockTracker.js` |
| `chart fetch failed` | Fetching chart data for a symbol resulted in an error | `src/hooks/useStockTracker.js` |
| `stock searched` | User performs a stock search query (after debounce) | `src/components/StockSearch.jsx` |
| `stock search result selected` | User selects a stock from search results to add to watchlist | `src/components/StockSearch.jsx` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard — Analytics basics**: https://eu.posthog.com/project/157690/dashboard/616522
- **Watchlist Activity: Stocks Added vs Removed**: https://eu.posthog.com/project/157690/insights/lRHy8Hy5
- **Stock Search → Watchlist Conversion Funnel**: https://eu.posthog.com/project/157690/insights/5v1Oimww
- **Alert Lifecycle: Created, Triggered & Removed**: https://eu.posthog.com/project/157690/insights/O9Teokx7
- **Search Engagement: Queries vs Selections**: https://eu.posthog.com/project/157690/insights/8yAOekL9
- **Chart Fetch Errors by Symbol**: https://eu.posthog.com/project/157690/insights/30dNaNa7

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
