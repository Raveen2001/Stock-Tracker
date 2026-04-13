import React, { useState } from "react";
import { Loader2, Smartphone } from "lucide-react";

/**
 * Blocking modal until the user registers a phone number (stored privately on SpacetimeDB).
 */
export default function PhonePrompt({ onSubmit }) {
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = phone.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      onSubmit(trimmed);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="phone-prompt-overlay" role="dialog" aria-modal="true" aria-labelledby="phone-prompt-title">
      <div className="phone-prompt-card">
        <div className="phone-prompt-icon-wrap" aria-hidden>
          <Smartphone size={28} />
        </div>
        <h2 id="phone-prompt-title" className="phone-prompt-title">
          Continue with your phone number
        </h2>
        <p className="phone-prompt-desc">
          We use this to sync your watchlist across devices. Your number is stored privately on the server and is not
          visible to other users.
        </p>
        <form className="phone-prompt-form" onSubmit={handleSubmit}>
          <label htmlFor="phone-prompt-input" className="phone-prompt-label">
            Phone number
          </label>
          <input
            id="phone-prompt-input"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            placeholder="e.g. 9876543210"
            className="phone-prompt-input"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={submitting}
            required
          />
          <button type="submit" className="phone-prompt-submit" disabled={submitting || !phone.trim()}>
            {submitting ? (
              <>
                <Loader2 size={18} className="spinning" aria-hidden />
                Saving…
              </>
            ) : (
              "Continue"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
