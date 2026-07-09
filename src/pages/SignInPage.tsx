import { useState, type FormEvent } from 'react';
import { useAuth } from '../components/AuthProvider';
import { isValidEmail } from '../lib/auth';

/**
 * Full-screen sign-in gate (no nav). Name + email only — the email is the key
 * that restores and syncs progress; there is no password and no verification.
 */
export default function SignInPage() {
  const { signIn } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0 && isValidEmail(email);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(name, email);
    } catch {
      setError('Could not sign in — check your connection and try again.');
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
        <p className="auth-lede">
          Learn French, one edition at a time. Sign in to save your progress and pick it up on any
          device.
        </p>

        <form onSubmit={handleSubmit}>
          <label className="auth-label" htmlFor="auth-name">
            Your name
          </label>
          <input
            id="auth-name"
            className="text-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Camille"
            autoComplete="name"
            autoCapitalize="words"
          />

          <label className="auth-label" htmlFor="auth-email">
            Email
          </label>
          <input
            id="auth-email"
            className="text-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="camille@example.com"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode="email"
          />

          <p className="auth-fineprint">
            Your email just labels your progress — no password, no verification.
          </p>

          {error && <p className="auth-error">{error}</p>}

          <button className="btn btn--accent auth-submit" type="submit" disabled={!canSubmit || busy}>
            {busy ? 'Signing in…' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
