import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { useAuth } from '../components/AuthProvider';
import { setSfxEnabled, sfxEnabled } from '../lib/sound';

export default function SettingsPage() {
  const { user, signOut } = useAuth();

  const words = useLiveQuery(() => db.savedWords.toArray(), []) ?? [];
  const progress = useLiveQuery(() => db.articleProgress.toArray(), []) ?? [];
  const rounds = useLiveQuery(() => db.practiceResults.toArray(), []) ?? [];

  const [sound, setSound] = useState(sfxEnabled);
  const [loggingOut, setLoggingOut] = useState(false);

  const read = progress.filter((p) => p.read === 1).length;
  const learnt = words.filter((w) => w.learned === 1).length;

  const stats: { label: string; value: string | number }[] = [
    { label: 'Articles read', value: read },
    { label: 'Words saved', value: words.length },
    { label: 'Words learnt', value: learnt },
    { label: 'Practice rounds', value: rounds.length },
  ];

  function toggleSound() {
    const next = !sound;
    setSfxEnabled(next);
    setSound(next);
  }

  async function handleLogOut() {
    if (loggingOut) return;
    if (!window.confirm('Log out? Your progress is saved to your email and returns when you sign back in.')) {
      return;
    }
    setLoggingOut(true);
    await signOut();
  }

  return (
    <>
      <h2 className="page-heading">Settings</h2>
      <p className="page-subheading">Your account and progress.</p>

      <div className="section-label">Account</div>
      <div className="card account-card">
        <div className="account-row">
          <span className="account-row__label">Name</span>
          <span className="account-row__value">{user?.name || '—'}</span>
        </div>
        <div className="account-row">
          <span className="account-row__label">Username</span>
          <span className="account-row__value">{user?.username || '—'}</span>
        </div>
      </div>

      <div className="section-label">Progress</div>
      <div className="settings-stats">
        {stats.map((s) => (
          <div className="settings-stat" key={s.label}>
            <span className="settings-stat__value">{s.value}</span>
            <span className="settings-stat__label">{s.label}</span>
          </div>
        ))}
      </div>

      <div className="section-label">Preferences</div>
      <div className="card">
        <button
          type="button"
          className="setting-toggle"
          onClick={toggleSound}
          aria-pressed={sound}
        >
          <span>
            <span className="setting-toggle__title">Sound effects</span>
            <span className="setting-toggle__hint">Clicks, chimes and typing sounds</span>
          </span>
          <span className={`switch${sound ? ' switch--on' : ''}`} aria-hidden>
            <span className="switch__knob" />
          </span>
        </button>
      </div>

      <button
        className="btn btn--ghost settings-logout"
        onClick={handleLogOut}
        disabled={loggingOut}
      >
        {loggingOut ? 'Logging out…' : 'Log Out'}
      </button>
    </>
  );
}
