// Popular NSE & BSE stocks for quick search (client-side only)
const POPULAR_STOCKS = [
  { symbol: 'RELIANCE.NS', name: 'Reliance Industries', exchange: 'NSE' },
  { symbol: 'TCS.NS', name: 'Tata Consultancy Services', exchange: 'NSE' },
  { symbol: 'INFY.NS', name: 'Infosys', exchange: 'NSE' },
  { symbol: 'HDFCBANK.NS', name: 'HDFC Bank', exchange: 'NSE' },
  { symbol: 'ICICIBANK.NS', name: 'ICICI Bank', exchange: 'NSE' },
  { symbol: 'HINDUNILVR.NS', name: 'Hindustan Unilever', exchange: 'NSE' },
  { symbol: 'SBIN.NS', name: 'State Bank of India', exchange: 'NSE' },
  { symbol: 'BHARTIARTL.NS', name: 'Bharti Airtel', exchange: 'NSE' },
  { symbol: 'ITC.NS', name: 'ITC Limited', exchange: 'NSE' },
  { symbol: 'KOTAKBANK.NS', name: 'Kotak Mahindra Bank', exchange: 'NSE' },
  { symbol: 'LT.NS', name: 'Larsen & Toubro', exchange: 'NSE' },
  { symbol: 'AXISBANK.NS', name: 'Axis Bank', exchange: 'NSE' },
  { symbol: 'WIPRO.NS', name: 'Wipro', exchange: 'NSE' },
  { symbol: 'BAJFINANCE.NS', name: 'Bajaj Finance', exchange: 'NSE' },
  { symbol: 'MARUTI.NS', name: 'Maruti Suzuki', exchange: 'NSE' },
  { symbol: 'TATAMOTORS.NS', name: 'Tata Motors', exchange: 'NSE' },
  { symbol: 'SUNPHARMA.NS', name: 'Sun Pharma', exchange: 'NSE' },
  { symbol: 'TITAN.NS', name: 'Titan Company', exchange: 'NSE' },
  { symbol: 'ASIANPAINT.NS', name: 'Asian Paints', exchange: 'NSE' },
  { symbol: 'ULTRACEMCO.NS', name: 'UltraTech Cement', exchange: 'NSE' },
  { symbol: 'HCLTECH.NS', name: 'HCL Technologies', exchange: 'NSE' },
  { symbol: 'ADANIENT.NS', name: 'Adani Enterprises', exchange: 'NSE' },
  { symbol: 'ADANIPORTS.NS', name: 'Adani Ports', exchange: 'NSE' },
  { symbol: 'POWERGRID.NS', name: 'Power Grid Corp', exchange: 'NSE' },
  { symbol: 'NTPC.NS', name: 'NTPC Limited', exchange: 'NSE' },
  { symbol: 'ONGC.NS', name: 'Oil & Natural Gas Corp', exchange: 'NSE' },
  { symbol: 'COALINDIA.NS', name: 'Coal India', exchange: 'NSE' },
  { symbol: 'TATASTEEL.NS', name: 'Tata Steel', exchange: 'NSE' },
  { symbol: 'JSWSTEEL.NS', name: 'JSW Steel', exchange: 'NSE' },
  { symbol: 'TECHM.NS', name: 'Tech Mahindra', exchange: 'NSE' },
  { symbol: 'RELIANCE.BO', name: 'Reliance Industries', exchange: 'BSE' },
  { symbol: 'TCS.BO', name: 'Tata Consultancy Services', exchange: 'BSE' },
  { symbol: 'INFY.BO', name: 'Infosys', exchange: 'BSE' },
  { symbol: 'HDFCBANK.BO', name: 'HDFC Bank', exchange: 'BSE' },
  { symbol: 'ICICIBANK.BO', name: 'ICICI Bank', exchange: 'BSE' },
  { symbol: 'SBIN.BO', name: 'State Bank of India', exchange: 'BSE' },
];

export async function searchStocks(query) {
  if (!query || query.length < 1) return [];

  const q = query.toUpperCase().trim();

  const matches = POPULAR_STOCKS.filter(
    s =>
      s.symbol.toUpperCase().includes(q) ||
      s.name.toUpperCase().includes(q)
  );

  const suggestions = [...matches];

  // Only add dynamic .NS/.BO entries when the query looks like a complete symbol
  // (no spaces, at least 2 chars) AND no popular stock already starts with this exact symbol
  const looksComplete = !q.includes(' ') && q.length >= 2;
  const exactMatchExists = suggestions.some(s => s.symbol.startsWith(`${q}.`));
  if (!q.includes('.') && looksComplete && !exactMatchExists) {
    suggestions.push({ symbol: `${q}.NS`, name: q, exchange: 'NSE' });
    suggestions.push({ symbol: `${q}.BO`, name: q, exchange: 'BSE' });
  }

  const seen = new Set();
  return suggestions.filter(s => {
    if (seen.has(s.symbol)) return false;
    seen.add(s.symbol);
    return true;
  });
}
