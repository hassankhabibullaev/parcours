import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import { AuthError, isValidEmail } from '../lib/auth';
import { ArrowLeftIcon } from '../components/icons';

const RESEND_COOLDOWN_S = 30;

/**
 * Full-screen sign-in page (no nav). One unified email + code form: enter an
 * email, receive a one-time code, type it in — a first-time email gets an
 * account created on the spot, a known one logs in. No passwords, no separate
 * register screen. Reachable by choice — a guest can always dismiss it and
 * keep browsing. On success (or if an already-signed-in user lands here) it
 * returns to wherever they came from.
 */
export default function SignInPage() {
  const { user, requestCode, verifyCode } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  // Leave the sign-in page as soon as there's a session: either the submit just
  // established one, or the learner was already signed in and navigated here.
  useEffect(() => {
    if (user) navigate(from, { replace: true });
  }, [user, from, navigate]);

  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The server hands the code back when no mail provider is configured
  // (always in dev) — show it so sign-in still works end to end.
  const [devCode, setDevCode] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement | null>(null);

  // Resend cooldown ticker.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  const canSend = isValidEmail(email);
  const canVerify = /^\d{6}$/.test(code.trim());

  async function sendCode() {
    if (!canSend || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { devCode: dc } = await requestCode(email);
      setDevCode(dc ?? null);
      setStep('code');
      setCode('');
      setCooldown(RESEND_COOLDOWN_S);
      requestAnimationFrame(() => codeRef.current?.focus());
    } catch (err) {
      setError(
        err instanceof AuthError ? err.message : 'Something went wrong. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitCode() {
    if (!canVerify || busy) return;
    setBusy(true);
    setError(null);
    try {
      await verifyCode(email, code);
      // The user effect above redirects once the session lands.
    } catch (err) {
      setError(
        err instanceof AuthError ? err.message : 'Something went wrong. Please try again.',
      );
      setBusy(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (step === 'email') void sendCode();
    else void submitCode();
  }

  function changeEmail() {
    setStep('email');
    setCode('');
    setError(null);
    setDevCode(null);
  }

  return (
    <div className="auth-screen">
      {/* The way back out — sign-in is always optional, so the arrow returns
          to wherever the learner came from (guest mode included). */}
      <button
        type="button"
        className="auth-back"
        onClick={() => navigate(from, { replace: true })}
        aria-label="Go back"
        title="Go back"
      >
        <ArrowLeftIcon />
      </button>
      <div className="auth-card">
        <div className="auth-brand">
          <img className="auth-brand__logo" src="/icons/icon-192.png" alt="" />
          <span className="auth-brand__word">Parcours</span>
        </div>

        <form onSubmit={handleSubmit}>
          {step === 'email' ? (
            <>
              <label className="auth-label" htmlFor="auth-email">
                Email
              </label>
              <input
                id="auth-email"
                className="text-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                inputMode="email"
              />
              <p className="auth-hint">
                We'll email you a one-time code — new emails get an account automatically.
              </p>
            </>
          ) : (
            <>
              <p className="auth-sent">
                Enter the 6-digit code sent to <strong>{email}</strong>
              </p>
              {devCode && (
                <p className="auth-help">
                  Email delivery isn't set up on this server yet — your code is{' '}
                  <strong>{devCode}</strong>
                </p>
              )}
              <label className="auth-label" htmlFor="auth-code">
                Code
              </label>
              <input
                id="auth-code"
                ref={codeRef}
                className="text-input auth-code-input"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                placeholder="••••••"
              />
            </>
          )}

          {error && <p className="auth-error">{error}</p>}

          <button
            className="btn btn--accent auth-submit"
            type="submit"
            disabled={busy || (step === 'email' ? !canSend : !canVerify)}
          >
            {step === 'email'
              ? busy
                ? 'Sending code…'
                : 'Send code'
              : busy
                ? 'Signing in…'
                : 'Sign in'}
          </button>
        </form>

        {step === 'code' && (
          <div className="auth-alt">
            {/* The seconds are zero-padded and tabular so the label keeps one
                width for the whole countdown — nothing shifts as it ticks. */}
            <button
              type="button"
              className="auth-link"
              disabled={cooldown > 0 || busy}
              onClick={() => void sendCode()}
            >
              {cooldown > 0 ? `Resend code (${String(cooldown).padStart(2, '0')}s)` : 'Resend code'}
            </button>
            <button type="button" className="auth-link" onClick={changeEmail}>
              Use a different email
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
