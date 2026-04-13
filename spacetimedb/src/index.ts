import { schema, t, table, SenderError } from "spacetimedb/server";
import { ScheduleAt } from "spacetimedb";

// ─── Tables ───────────────────────────────────────────────────────────────────

const stockPrice = table(
  { name: "stock_price", public: true },
  {
    symbol: t.string().primaryKey(),
    name: t.string(),
    exchange: t.string(),
    currency: t.string(),
    price: t.f64(),
    previousClose: t.f64(),
    change: t.f64(),
    changePercent: t.f64(),
    dayHigh: t.f64(),
    dayLow: t.f64(),
    volume: t.f64(),
    lastUpdated: t.timestamp(),
  },
);

const watchlistItem = table(
  { name: "watchlist_item", public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    accountId: t.u64(),
    symbol: t.string(),
  },
);

const alert = table(
  { name: "alert", public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    accountId: t.u64(),
    symbol: t.string(),
    targetPrice: t.f64(),
    alertType: t.string(),
    active: t.bool(),
    createdAt: t.timestamp(),
    triggeredAt: t.timestamp().optional(),
  },
);

const priceFetchSchedule = table(
  { name: "price_fetch_schedule", scheduled: (): any => fetchPrices },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  },
);

/**
 * User account keyed by auto-incrementing ID. Phone is unique across accounts.
 * Private so clients cannot subscribe to it.
 */
const account = table(
  { name: "account", public: false },
  {
    id: t.u64().primaryKey().autoInc(),
    phone: t.string(),
    password: t.string(),
    telegramChatId: t.string().optional(),
    registeredAt: t.timestamp(),
  },
);

/**
 * Links a SpacetimeDB identity (one per device) to an account.
 * Multiple identities can point to the same accountId (multi-device).
 */
const identityLink = table(
  { name: "identity_link", public: false },
  {
    identity: t.identity().primaryKey(),
    accountId: t.u64(),
  },
);

const botConfig = table(
  { name: "bot_config", public: false },
  {
    key: t.string().primaryKey(),
    value: t.string(),
  },
);

const spacetimedb = schema({
  stockPrice,
  watchlistItem,
  alert,
  priceFetchSchedule,
  account,
  identityLink,
  botConfig,
});
export default spacetimedb;

// ─── Helpers ──────────────────────────────────────────────────────────────────

type ReducerContext = Parameters<Parameters<typeof spacetimedb.reducer>[1]>[0];

function getAccountId(ctx: ReducerContext): bigint {
  const link = ctx.db.identityLink.identity.find(ctx.sender);
  if (!link) throw new SenderError("Not logged in");
  return link.accountId;
}

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

export const init = spacetimedb.init((ctx) => {
  ctx.db.priceFetchSchedule.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.interval(5_000_000n),
  });
  console.info(
    "Stock Tracker module initialized. Price fetch scheduled every 5s.",
  );
});

// ─── Auth Reducers ────────────────────────────────────────────────────────────

export const register = spacetimedb.reducer(
  { phone: t.string(), password: t.string() },
  (ctx, { phone, password }) => {
    const phoneNorm = normalizePhone(phone);
    if (!phoneNorm) throw new SenderError("Phone must not be empty");
    if (phoneNorm.length < 10 || phoneNorm.length > 15) {
      throw new SenderError("Phone must be 10–15 digits");
    }
    if (!password || password.length < 4) {
      throw new SenderError("Password must be at least 4 characters");
    }

    // Check if phone is already taken
    for (const a of ctx.db.account.iter()) {
      if (a.phone === phoneNorm) {
        throw new SenderError("Phone number already registered. Please login.");
      }
    }

    // Check if this identity is already linked
    const existingLink = ctx.db.identityLink.identity.find(ctx.sender);
    if (existingLink) {
      throw new SenderError("This device is already logged in");
    }

    const acct = ctx.db.account.insert({
      id: 0n,
      phone: phoneNorm,
      password,
      telegramChatId: undefined,
      registeredAt: ctx.timestamp,
    });

    ctx.db.identityLink.insert({
      identity: ctx.sender,
      accountId: acct.id,
    });

    console.info(
      `Account registered: phone ${phoneNorm} -> account ${acct.id} (identity ${ctx.sender.toHexString().substring(0, 8)})`,
    );
  },
);

export const login = spacetimedb.reducer(
  { phone: t.string(), password: t.string() },
  (ctx, { phone, password }) => {
    const phoneNorm = normalizePhone(phone);
    if (!phoneNorm) throw new SenderError("Phone must not be empty");

    let acct: ReturnType<typeof ctx.db.account.id.find> | null = null;
    for (const a of ctx.db.account.iter()) {
      if (a.phone === phoneNorm) {
        acct = a;
        break;
      }
    }

    if (!acct) {
      throw new SenderError("Account not found. Please register first.");
    }

    if (acct.password !== password) {
      throw new SenderError("Incorrect password");
    }

    // Link this identity to the account (or update if already linked elsewhere)
    const existingLink = ctx.db.identityLink.identity.find(ctx.sender);
    if (existingLink) {
      if (existingLink.accountId === acct.id) {
        return; // already logged in to this account
      }
      ctx.db.identityLink.identity.update({
        identity: ctx.sender,
        accountId: acct.id,
      });
    } else {
      ctx.db.identityLink.insert({
        identity: ctx.sender,
        accountId: acct.id,
      });
    }

    console.info(
      `Login: phone ${phoneNorm} -> account ${acct.id} (identity ${ctx.sender.toHexString().substring(0, 8)})`,
    );
  },
);

// ─── Watchlist Reducers ───────────────────────────────────────────────────────

export const addToWatchlist = spacetimedb.reducer(
  { symbol: t.string() },
  (ctx, { symbol }) => {
    const aid = getAccountId(ctx);
    const sym = symbol.trim().toUpperCase();
    if (!sym) throw new SenderError("Symbol must not be empty");

    for (const item of ctx.db.watchlistItem.iter()) {
      if (item.accountId === aid && item.symbol === sym) {
        return;
      }
    }

    ctx.db.watchlistItem.insert({ id: 0n, accountId: aid, symbol: sym });
    console.info(`Account ${aid} added ${sym}`);
  },
);

export const removeFromWatchlist = spacetimedb.reducer(
  { symbol: t.string() },
  (ctx, { symbol }) => {
    const aid = getAccountId(ctx);
    const sym = symbol.trim().toUpperCase();

    for (const item of ctx.db.watchlistItem.iter()) {
      if (item.accountId === aid && item.symbol === sym) {
        ctx.db.watchlistItem.id.delete(item.id);
      }
    }

    for (const a of ctx.db.alert.iter()) {
      if (a.accountId === aid && a.symbol === sym) {
        ctx.db.alert.id.delete(a.id);
      }
    }

    let othersWatch = false;
    for (const item of ctx.db.watchlistItem.iter()) {
      if (item.symbol === sym) {
        othersWatch = true;
        break;
      }
    }
    if (!othersWatch) {
      const priceRow = ctx.db.stockPrice.symbol.find(sym);
      if (priceRow) ctx.db.stockPrice.symbol.delete(sym);
    }
  },
);

// ─── Alert Reducers ───────────────────────────────────────────────────────────

export const addAlert = spacetimedb.reducer(
  { symbol: t.string(), targetPrice: t.f64(), alertType: t.string() },
  (ctx, { symbol, targetPrice, alertType }) => {
    const aid = getAccountId(ctx);
    const sym = symbol.trim().toUpperCase();
    if (!sym) throw new SenderError("Symbol must not be empty");
    if (targetPrice <= 0)
      throw new SenderError("Target price must be positive");
    if (alertType !== "above" && alertType !== "below") {
      throw new SenderError('alertType must be "above" or "below"');
    }

    ctx.db.alert.insert({
      id: 0n,
      accountId: aid,
      symbol: sym,
      targetPrice,
      alertType,
      active: true,
      createdAt: ctx.timestamp,
      triggeredAt: undefined,
    });
  },
);

export const removeAlert = spacetimedb.reducer(
  { alertId: t.u64() },
  (ctx, { alertId }) => {
    const aid = getAccountId(ctx);
    const a = ctx.db.alert.id.find(alertId);
    if (!a) return;
    if (a.accountId !== aid) throw new SenderError("Not your alert");
    ctx.db.alert.id.delete(alertId);
  },
);

export const toggleAlert = spacetimedb.reducer(
  { alertId: t.u64() },
  (ctx, { alertId }) => {
    const aid = getAccountId(ctx);
    const a = ctx.db.alert.id.find(alertId);
    if (!a) throw new SenderError("Alert not found");
    if (a.accountId !== aid) throw new SenderError("Not your alert");
    ctx.db.alert.id.update({
      ...a,
      active: !a.active,
      triggeredAt: !a.active ? undefined : a.triggeredAt,
    });
  },
);

// ─── Profile Procedures ──────────────────────────────────────────────────────

export const getMyPhone = spacetimedb.procedure(t.string(), (ctx, _args) =>
  ctx.withTx((tx) => {
    const link = tx.db.identityLink.identity.find(ctx.sender);
    if (!link) return "";
    const acct = tx.db.account.id.find(link.accountId);
    return acct?.phone ?? "";
  }),
);

export const getMyAccountId = spacetimedb.procedure(t.string(), (ctx, _args) =>
  ctx.withTx((tx) => {
    const link = tx.db.identityLink.identity.find(ctx.sender);
    if (!link) return "";
    return link.accountId.toString();
  }),
);

export const getMyTelegramChatId = spacetimedb.procedure(
  t.string(),
  (ctx, _args) =>
    ctx.withTx((tx) => {
      const link = tx.db.identityLink.identity.find(ctx.sender);
      if (!link) return "";
      const acct = tx.db.account.id.find(link.accountId);
      return acct?.telegramChatId ?? "";
    }),
);

// ─── Telegram Chat ID ────────────────────────────────────────────────────────

export const setTelegramChatId = spacetimedb.reducer(
  { chatId: t.string() },
  (ctx, { chatId }) => {
    const trimmed = chatId.trim();
    if (!trimmed) throw new SenderError("Chat ID must not be empty");

    const aid = getAccountId(ctx);
    const acct = ctx.db.account.id.find(aid);
    if (!acct) throw new SenderError("Account not found");

    ctx.db.account.id.update({
      ...acct,
      telegramChatId: trimmed,
    });
    console.info(`Account ${aid} set Telegram chat ID`);
  },
);

// ─── Bot Config ──────────────────────────────────────────────────────────────

export const setBotConfig = spacetimedb.reducer(
  { key: t.string(), value: t.string() },
  (ctx, { key, value }) => {
    const trimmedKey = key.trim();
    const trimmedValue = value.trim();
    if (!trimmedKey || !trimmedValue) {
      throw new SenderError("Key and value must not be empty");
    }

    const existing = ctx.db.botConfig.key.find(trimmedKey);
    if (existing) {
      ctx.db.botConfig.key.update({ key: trimmedKey, value: trimmedValue });
    } else {
      ctx.db.botConfig.insert({ key: trimmedKey, value: trimmedValue });
    }
    console.info(
      `Bot config "${trimmedKey}" updated by ${ctx.sender.toHexString().substring(0, 8)}`,
    );
  },
);

// ─── Scheduled Procedure: fetch_prices ───────────────────────────────────────

const YAHOO_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  Accept: "application/json",
};

export const fetchPrices = spacetimedb.procedure(
  { arg: priceFetchSchedule.rowType },
  t.unit(),
  (ctx, _arg) => {
    const symbols = new Set<string>();
    ctx.withTx((tx) => {
      for (const item of tx.db.watchlistItem.iter()) {
        symbols.add(item.symbol);
      }
      for (const a of tx.db.alert.iter()) {
        if (a.active) symbols.add(a.symbol);
      }
    });

    if (symbols.size === 0) return {};

    const results: Array<{
      symbol: string;
      name: string;
      exchange: string;
      currency: string;
      price: number;
      previousClose: number;
      change: number;
      changePercent: number;
      dayHigh: number;
      dayLow: number;
      volume: number;
    }> = [];

    for (const sym of symbols) {
      try {
        const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1m&range=1d`;
        const response = ctx.http.fetch(url, { headers: YAHOO_HEADERS });
        if (response.status !== 200) {
          console.warn(`Yahoo returned ${response.status} for ${sym}`);
          continue;
        }
        const data = response.json() as any;
        const meta = data?.chart?.result?.[0]?.meta;
        if (!meta) {
          console.warn(`No meta for ${sym}`);
          continue;
        }
        const price: number = meta.regularMarketPrice ?? 0;
        const previousClose: number =
          meta.chartPreviousClose ?? meta.previousClose ?? price;
        const change = price - previousClose;
        const changePercent =
          previousClose > 0 ? (change / previousClose) * 100 : 0;

        results.push({
          symbol: meta.symbol ?? sym,
          name: meta.shortName ?? meta.longName ?? sym,
          exchange: meta.exchangeName ?? "",
          currency: meta.currency ?? "INR",
          price,
          previousClose,
          change: parseFloat(change.toFixed(4)),
          changePercent: parseFloat(changePercent.toFixed(4)),
          dayHigh: meta.regularMarketDayHigh ?? price,
          dayLow: meta.regularMarketDayLow ?? price,
          volume: meta.regularMarketVolume ?? 0,
        });
      } catch (e) {
        console.error(`Failed to fetch ${sym}:`, e);
      }
    }

    if (results.length === 0) return {};

    const triggeredAlerts: Array<{
      accountId: bigint;
      symbol: string;
      alertType: string;
      targetPrice: number;
      currentPrice: number;
      currency: string;
      chatId: string;
    }> = [];

    ctx.withTx((tx) => {
      const now = tx.timestamp;

      for (const r of results) {
        const existing = tx.db.stockPrice.symbol.find(r.symbol);
        if (existing) {
          tx.db.stockPrice.symbol.update({ ...r, lastUpdated: now });
        } else {
          tx.db.stockPrice.insert({ ...r, lastUpdated: now });
        }

        for (const a of tx.db.alert.iter()) {
          if (!a.active || a.symbol !== r.symbol) continue;

          const triggered =
            (a.alertType === "above" && r.price >= a.targetPrice) ||
            (a.alertType === "below" && r.price <= a.targetPrice);

          if (triggered) {
            tx.db.alert.id.update({ ...a, active: false, triggeredAt: now });
            console.info(
              `Alert triggered: ${r.symbol} ${a.alertType} ${a.targetPrice} (current: ${r.price})`,
            );

            const acct = tx.db.account.id.find(a.accountId);
            if (acct?.telegramChatId) {
              triggeredAlerts.push({
                accountId: a.accountId,
                symbol: r.symbol,
                alertType: a.alertType,
                targetPrice: a.targetPrice,
                currentPrice: r.price,
                currency: r.currency,
                chatId: acct.telegramChatId,
              });
            }
          }
        }
      }
    });

    let botToken: string | undefined;
    let watchlistUpdatesEnabled = false;
    ctx.withTx((tx) => {
      botToken = tx.db.botConfig.key.find("telegram_bot_token")?.value;
      watchlistUpdatesEnabled =
        tx.db.botConfig.key.find("telegram_watchlist_updates")?.value ===
        "true";
    });

    if (!botToken) return {};

    for (const ta of triggeredAlerts) {
      try {
        const dot = ta.alertType === "above" ? "🟢" : "🔴";
        const direction =
          ta.alertType === "above" ? "rose above" : "dropped below";
        const shortSym = ta.symbol.replace(".NS", "").replace(".BO", "");

        const text =
          `${dot} <b>Alert Triggered</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `<b>${shortSym}</b> ${direction} your target\n\n` +
          `🎯  Target      <code>${ta.currency} ${ta.targetPrice.toLocaleString()}</code>\n` +
          `💰  Current    <code>${ta.currency} ${ta.currentPrice.toLocaleString()}</code>`;

        const res = ctx.http.fetch(
          `https://api.telegram.org/bot${botToken}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: ta.chatId,
              text,
              parse_mode: "HTML",
            }),
          },
        );

        if (res.status !== 200) {
          console.warn(
            `Telegram send failed for account ${ta.accountId}: HTTP ${res.status}`,
          );
        }
      } catch (e) {
        console.error(`Telegram send error for account ${ta.accountId}:`, e);
      }
    }

    if (watchlistUpdatesEnabled) {
      const accountWatchlists = new Map<
        bigint,
        { chatId: string; symbols: string[] }
      >();
      ctx.withTx((tx) => {
        for (const acct of tx.db.account.iter()) {
          if (!acct.telegramChatId) continue;
          const syms: string[] = [];
          for (const item of tx.db.watchlistItem.iter()) {
            if (item.accountId === acct.id) {
              syms.push(item.symbol);
            }
          }
          if (syms.length > 0) {
            accountWatchlists.set(acct.id, {
              chatId: acct.telegramChatId,
              symbols: syms,
            });
          }
        }
      });

      for (const [, user] of accountWatchlists) {
        const lines = user.symbols.map((sym) => {
          const r = results.find((res) => res.symbol === sym);
          const shortSym = sym.replace(".NS", "").replace(".BO", "");
          if (!r) return `⚪ ${shortSym} — no data`;
          const dot = r.change >= 0 ? "🟢" : "🔴";
          const sign = r.change >= 0 ? "+" : "";
          return `${dot} <b>${shortSym}</b>  <code>${r.currency} ${r.price.toFixed(2)}</code>  ${sign}${r.changePercent.toFixed(2)}%`;
        });

        const text = `📊 <b>Watchlist</b>\n\n` + lines.join("\n");

        try {
          ctx.http.fetch(
            `https://api.telegram.org/bot${botToken}/sendMessage`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: user.chatId,
                text,
                parse_mode: "HTML",
              }),
            },
          );
        } catch (e) {
          console.error(`Telegram watchlist update failed:`, e);
        }
      }
    }

    return {};
  },
);

// ─── On-Demand Procedure: fetch_chart ────────────────────────────────────────

export const fetchChart = spacetimedb.procedure(
  { symbol: t.string(), interval: t.string(), range: t.string() },
  t.string(),
  (ctx, { symbol, interval, range }) => {
    const sym = symbol.trim().toUpperCase();
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=${interval}&range=${range}`;

    const response = ctx.http.fetch(url, { headers: YAHOO_HEADERS });
    if (response.status !== 200) {
      throw new SenderError(`Yahoo returned ${response.status} for ${sym}`);
    }

    const data = response.json() as any;
    const result = data?.chart?.result?.[0];
    if (!result) throw new SenderError(`No chart data available for ${sym}`);

    const meta = result.meta;
    const quotes = result.indicators?.quote?.[0] ?? {};
    const timestamps: number[] = result.timestamp ?? [];

    const openSeries = quotes.open as number[] | undefined;
    const sessionOpenFromBars =
      Array.isArray(openSeries) && openSeries.length > 0
        ? openSeries.find(
            (v: number) => v != null && Number.isFinite(Number(v)),
          )
        : undefined;

    const currentPrice: number = meta.regularMarketPrice;
    const previousClose: number =
      meta.chartPreviousClose ?? meta.previousClose;
    const change = currentPrice - previousClose;
    const changePercent =
      previousClose > 0 ? (change / previousClose) * 100 : 0;

    const priceHistory = timestamps
      .map((ts: number, i: number) => ({
        time: new Date(ts * 1000).toLocaleString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        }),
        price: (quotes.close?.[i] ?? quotes.open?.[i] ?? null) as
          | number
          | null,
        timestamp: ts,
        barOpen: openSeries?.[i] ?? null,
      }))
      .filter((p: { price: number | null }) => p.price != null);

    const payload = {
      quote: {
        symbol: meta.symbol,
        name: meta.shortName ?? meta.longName ?? sym,
        exchange: meta.exchangeName,
        currency: meta.currency,
        currentPrice,
        previousClose,
        open: sessionOpenFromBars,
        change: parseFloat(change.toFixed(2)),
        changePercent: parseFloat(changePercent.toFixed(2)),
        dayHigh: meta.regularMarketDayHigh,
        dayLow: meta.regularMarketDayLow,
        volume: meta.regularMarketVolume,
        fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
        lastUpdated: new Date().toLocaleTimeString("en-IN"),
      },
      priceHistory,
    };

    return JSON.stringify(payload);
  },
);
