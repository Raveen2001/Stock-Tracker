import React, { useState } from "react";
import { Loader2, LogIn, UserPlus } from "lucide-react";

export default function LoginForm({ onSubmit, error }) {
  const [isRegister, setIsRegister] = useState(false);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmedPhone = phone.trim();
    const trimmedPassword = password.trim();
    if (!trimmedPhone || !trimmedPassword || submitting) return;
    setSubmitting(true);
    try {
      onSubmit(trimmedPhone, trimmedPassword, isRegister);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="phone-prompt-overlay" role="dialog" aria-modal="true" aria-labelledby="login-title">
      <div className="phone-prompt-card">
        <div className="phone-prompt-icon-wrap" aria-hidden>
          {isRegister ? <UserPlus size={28} /> : <LogIn size={28} />}
        </div>
        <h2 id="login-title" className="phone-prompt-title">
          {isRegister ? "Create your account" : "Welcome back"}
        </h2>
        <p className="phone-prompt-desc">
          {isRegister
            ? "Sign up with your phone number and a password to get started."
            : "Log in to access your watchlist and alerts across devices."}
        </p>

        {error && <p className="login-error">{error}</p>}

        <form className="phone-prompt-form" onSubmit={handleSubmit}>
          <label htmlFor="login-phone" className="phone-prompt-label">
            Phone number
          </label>
          <input
            id="login-phone"
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

          <label htmlFor="login-password" className="phone-prompt-label">
            Password
          </label>
          <input
            id="login-password"
            type="password"
            autoComplete={isRegister ? "new-password" : "current-password"}
            placeholder={isRegister ? "Create a password" : "Enter your password"}
            className="phone-prompt-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
            required
            minLength={4}
          />

          <button
            type="submit"
            className="phone-prompt-submit"
            disabled={submitting || !phone.trim() || !password.trim()}
          >
            {submitting ? (
              <>
                <Loader2 size={18} className="spinning" aria-hidden />
                {isRegister ? "Creating…" : "Logging in…"}
              </>
            ) : isRegister ? (
              "Create Account"
            ) : (
              "Log In"
            )}
          </button>
        </form>

        <p className="login-toggle">
          {isRegister ? "Already have an account?" : "Don't have an account?"}{" "}
          <button
            type="button"
            className="login-toggle-btn"
            onClick={() => setIsRegister(!isRegister)}
          >
            {isRegister ? "Log in" : "Register"}
          </button>
        </p>
      </div>
    </div>
  );
}
