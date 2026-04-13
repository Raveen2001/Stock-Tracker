import React, { useState } from "react";
import { Loader2, MessageCircle, Check, ExternalLink } from "lucide-react";

export default function TelegramSettings({
  telegramChatId,
  onSave,
}) {
  const [chatId, setChatId] = useState(telegramChatId ?? "");
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const isDirty = chatId.trim() !== (telegramChatId ?? "");

  const handleSave = async (e) => {
    e.preventDefault();
    const trimmed = chatId.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      onSave(trimmed);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="telegram-settings">
      <div className="telegram-settings-header">
        <MessageCircle size={18} />
        <h4>Telegram Notifications</h4>
      </div>
      <p className="telegram-settings-desc">
        Get alert notifications on Telegram when a price target is hit.
      </p>
      <form className="telegram-settings-form" onSubmit={handleSave}>
        <input
          type="text"
          inputMode="numeric"
          placeholder="Your Telegram Chat ID"
          className="telegram-settings-input"
          value={chatId}
          onChange={(e) => setChatId(e.target.value)}
          disabled={saving}
        />
        <button
          type="submit"
          className="telegram-settings-btn"
          disabled={saving || !isDirty || !chatId.trim()}
        >
          {saving ? (
            <Loader2 size={16} className="spinning" />
          ) : justSaved ? (
            <>
              <Check size={16} /> Saved
            </>
          ) : (
            "Save"
          )}
        </button>
      </form>
      <p className="telegram-settings-help">
        <span className="telegram-settings-help-steps">
          <strong>1.</strong> Open{" "}
          <a
            href="https://t.me/raveen_stock_tracker_bot"
            target="_blank"
            rel="noopener noreferrer"
          >
            @raveen_stock_tracker_bot <ExternalLink size={12} />
          </a>{" "}
          on Telegram and send <code>/start</code>.
          <br />
          <strong>2.</strong> Message{" "}
          <a
            href="https://t.me/userinfobot"
            target="_blank"
            rel="noopener noreferrer"
          >
            @userinfobot <ExternalLink size={12} />
          </a>{" "}
          to get your Chat ID.
          <br />
          <strong>3.</strong> Paste the Chat ID above and click Save.
        </span>
      </p>
    </div>
  );
}
