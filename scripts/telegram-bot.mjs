import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvToken() {
  try {
    const envPath = resolve(__dirname, "..", ".env");
    const lines = readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const match = line.match(/^\s*TELEGRAM_BOT_TOKEN\s*=\s*(.+)/);
      if (match) return match[1].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    // .env not found or unreadable — fall through to env var
  }
  return undefined;
}

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || loadEnvToken();
if (!BOT_TOKEN) {
  console.error(
    "Missing TELEGRAM_BOT_TOKEN. Set it as an environment variable or add it to .env",
  );
  process.exit(1);
}

const API = `https://api.telegram.org/bot${BOT_TOKEN}`;
let offset = 0;
let running = true;

async function skipOldUpdates() {
  try {
    const res = await fetch(`${API}/getUpdates?offset=-1`);
    if (!res.ok) return;
    const { result } = await res.json();
    if (result?.length) {
      offset = result[result.length - 1].update_id + 1;
    }
  } catch (err) {
    console.warn("skipOldUpdates error:", err.message);
  }
}

async function sendMessage(chatId, text, replyMarkup) {
  const body = { chat_id: chatId, text, parse_mode: "HTML" };
  if (replyMarkup) body.reply_markup = replyMarkup;
  const res = await fetch(`${API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error(`sendMessage failed (${res.status}):`, await res.text());
  }
}

async function poll() {
  while (running) {
    try {
      const url = `${API}/getUpdates?offset=${offset}&timeout=30`;
      const res = await fetch(url);
      if (!res.ok) {
        console.error(`getUpdates failed (${res.status}):`, await res.text());
        await sleep(5000);
        continue;
      }

      const { result } = await res.json();
      if (!result?.length) continue;

      offset = result[result.length - 1].update_id + 1;

      for (const update of result) {
        const msg = update.message;
        if (!msg?.text) continue;

        if (msg.text.startsWith("/start")) {
          const chatId = msg.chat.id;
          const name = msg.from?.first_name || "there";
          console.log(`/start from ${name} (chat ${chatId})`);

          await sendMessage(
            chatId,
            `👋 <b>Welcome to Stock Tracker Bot!</b>\n\n` +
              `Your Chat ID is:\n<code>${chatId}</code>\n\n` +
              `Paste this ID into the <b>Telegram Settings</b> ` +
              `section in the app to receive price alerts.`,
            {
              inline_keyboard: [
                [{ text: "📋 Copy Chat ID", copy_text: { text: String(chatId) } }],
              ],
            },
          );
        }
      }
    } catch (err) {
      if (!running) break;
      console.error("Polling error:", err.message);
      await sleep(5000);
    }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function shutdown() {
  console.log("\nShutting down bot…");
  running = false;
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log("Telegram bot started — waiting for /start messages…");
skipOldUpdates().then(poll);
