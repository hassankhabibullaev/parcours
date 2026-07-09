import { useState, type FormEvent } from 'react';
import { useAuth } from '../components/AuthProvider';
import { AuthError, isValidPassword, isValidUsername } from '../lib/auth';

type Mode = 'login' | 'signup';

/**
 * Full-screen sign-in gate (no nav). Two modes: Log in (username + password) and
 * Sign up (name + username + password). Credentials are verified by the account
 * backend, so a taken username or wrong password is reported inline.
 */
export default function SignInPage() {
  const { logIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForgot, setShowForgot] = useState(false);

  const nameOk = mode === 'login' || name.trim().length > 0;
  const canSubmit = nameOk && isValidUsername(username) && isValidPassword(password);

  function switchMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
    setError(null);
    setShowForgot(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signup') await signUp(name, username, password);
      else await logIn(username, password);
    } catch (err) {
      setError(
        err instanceof AuthError
          ? err.message
          : 'Something went wrong. Please try again.',
      );
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <img className="auth-brand__logo" src="/icons/icon-192.png" alt="" />
          <span className="auth-brand__word">Parcours</span>
        </div>

        <form onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <>
              <label className="auth-label" htmlFor="auth-name">
                Your name
              </label>
              <input
                id="auth-name"
                className="text-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                autoCapitalize="words"
              />
            </>
          )}

          <label className="auth-label" htmlFor="auth-username">
            Username
          </label>
          <input
            id="auth-username"
            className="text-input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />

          <label className="auth-label" htmlFor="auth-password">
            Password
          </label>
          <input
            id="auth-password"
            className="text-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          />

          {error && <p className="auth-error">{error}</p>}

          <button
            className="btn btn--accent auth-submit"
            type="submit"
            disabled={!canSubmit || busy}
          >
            {busy
              ? mode === 'signup'
                ? 'Creating account…'
                : 'Logging in…'
              : mode === 'signup'
                ? 'Create account'
                : 'Log in'}
          </button>
        </form>

        <div className="auth-alt">
          {mode === 'login' ? (
            <>
              <p className="auth-switch">
                Don’t have an account?{' '}
                <button
                  type="button"
                  className="auth-link auth-link--strong"
                  onClick={() => switchMode('signup')}
                >
                  Register
                </button>
              </p>
              <button
                type="button"
                className="auth-link"
                onClick={() => setShowForgot((v) => !v)}
              >
                Forgot password?
              </button>
              {showForgot && (
                <p className="auth-help">
                  Contact the author at{' '}
                  <a href="https://t.me/khassanboi" target="_blank" rel="noreferrer">
                    t.me/khassanboi
                  </a>{' '}
                  and provide your username.
                </p>
              )}
            </>
          ) : (
            <p className="auth-switch">
              Already have an account?{' '}
              <button
                type="button"
                className="auth-link auth-link--strong"
                onClick={() => switchMode('login')}
              >
                Log in
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
