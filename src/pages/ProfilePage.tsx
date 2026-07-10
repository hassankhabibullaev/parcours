import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { useAuth } from '../components/AuthProvider';
import { setSfxEnabled, sfxEnabled } from '../lib/sound';
import {
  USER_LEVELS,
  lookupSpeechEnabled,
  setLookupSpeechEnabled,
  setTitleSpeechEnabled,
  setUserLevel,
  titleSpeechEnabled,
  useUserLevel,
} from '../lib/settings';
import SectionTabs from '../components/SectionTabs';

type Tab = 'profile' | 'settings';

/**
 * Profile — two tabs. Profile is the who-and-how-far view (email, progress,
 * log out); Settings holds the level preference and a short list of practical
 * toggles. The active tab lives in the URL (`?tab=settings`).
 */
export default function ProfilePage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'settings' ? 'settings' : 'profile';

  return (
    <>
      <h2 className="page-heading">Profile</h2>
      <SectionTabs<Tab>
        ariaLabel="Profile"
        tabs={[
          { key: 'profile', label: 'Profile' },
          { key: 'settings', label: 'Settings' },
        ]}
        active={tab}
        onSelect={(t) => setParams(t === 'settings' ? { tab: 'settings' } : {}, { replace: true })}
      />
      {tab === 'profile' ? <ProfileTab /> : <SettingsTab />}
    </>
  );
}

function ProfileTab() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const words = useLiveQuery(() => db.savedWords.toArray(), []) ?? [];
  const progress = useLiveQuery(() => db.articleProgress.toArray(), []) ?? [];
  const rounds = useLiveQuery(() => db.practiceResults.toArray(), []) ?? [];

  const [loggingOut, setLoggingOut] = useState(false);

  const read = progress.filter((p) => p.read === 1).length;
  const learnt = words.filter((w) => w.learned === 1).length;

  const stats: { label: string; value: string | number }[] = [
    { label: 'Articles read', value: read },
    { label: 'Words saved', value: words.length },
    { label: 'Words learnt', value: learnt },
    { label: 'Practice rounds', value: rounds.length },
  ];

  async function handleLogOut() {
    if (loggingOut) return;
    if (!window.confirm('Log out? Your progress is saved to your account and returns when you sign back in.')) {
      return;
    }
    setLoggingOut(true);
    await signOut();
  }

  return (
    <>
      <div className="section-label">Account</div>
      {user ? (
        <div className="card account-card">
          <div className="account-row">
            <span className="account-row__label">Email</span>
            <span className="account-row__value">{user.email}</span>
          </div>
        </div>
      ) : (
        <div className="card">
          <p style={{ margin: '0 0 4px', fontWeight: 700 }}>You’re browsing as a guest</p>
          <p style={{ margin: '0 0 12px', color: 'var(--ink-soft)', fontSize: 14 }}>
            Reading and conjugation practice are open to everyone. Sign in with your email — no
            password — to save words, track what you’ve read, and sync across devices.
          </p>
          <button className="btn btn--accent" onClick={() => navigate('/signin')}>
            Log In
          </button>
        </div>
      )}

      <div className="section-label">Progress</div>
      <div className="settings-stats">
        {stats.map((s) => (
          <div className="settings-stat" key={s.label}>
            <span className="settings-stat__value">{s.value}</span>
            <span className="settings-stat__label">{s.label}</span>
          </div>
        ))}
      </div>

      {user && (
        <button
          className="btn btn--ghost settings-logout"
          onClick={handleLogOut}
          disabled={loggingOut}
        >
          {loggingOut ? 'Logging out…' : 'Log Out'}
        </button>
      )}
    </>
  );
}

function SettingsTab() {
  const level = useUserLevel();
  const [sound, setSound] = useState(sfxEnabled);
  const [titles, setTitles] = useState(titleSpeechEnabled);
  const [lookups, setLookups] = useState(lookupSpeechEnabled);

  const toggles: {
    title: string;
    hint: string;
    on: boolean;
    set: (on: boolean) => void;
  }[] = [
    {
      title: 'Sound effects',
      hint: 'Clicks, chimes and typing sounds',
      on: sound,
      set: (on) => {
        setSfxEnabled(on);
        setSound(on);
      },
    },
    {
      title: 'Read titles aloud',
      hint: 'Pronounce an article’s headline when it opens',
      on: titles,
      set: (on) => {
        setTitleSpeechEnabled(on);
        setTitles(on);
      },
    },
    {
      title: 'Pronounce looked-up words',
      hint: 'Say a word aloud when its dictionary card opens',
      on: lookups,
      set: (on) => {
        setLookupSpeechEnabled(on);
        setLookups(on);
      },
    },
  ];

  return (
    <>
      <div className="section-label">Current level</div>
      <div className="card">
        <p style={{ margin: '0 0 10px', color: 'var(--ink-soft)', fontFamily: 'var(--sans)', fontSize: 13 }}>
          Sets which articles Home suggests and the Reading list shows first. Leave it unset to
          browse every level.
        </p>
        <div className="level-counts" role="group" aria-label="Current level">
          <button
            type="button"
            className={`level-count${!level ? ' level-count--active' : ''}`}
            aria-pressed={!level}
            onClick={() => void setUserLevel('')}
          >
            Not set
          </button>
          {USER_LEVELS.map((lvl) => (
            <button
              key={lvl}
              type="button"
              className={`level-count${level === lvl ? ' level-count--active' : ''}`}
              aria-pressed={level === lvl}
              onClick={() => void setUserLevel(level === lvl ? '' : lvl)}
            >
              <span
                className="level-count__dot"
                style={{ ['--lc' as string]: `var(--level-${lvl.toLowerCase()})` }}
              />
              {lvl}
            </button>
          ))}
        </div>
      </div>

      <div className="section-label">Sound</div>
      <div className="card account-card">
        {toggles.map((t) => (
          <button
            key={t.title}
            type="button"
            className="setting-toggle"
            onClick={() => t.set(!t.on)}
            aria-pressed={t.on}
          >
            <span>
              <span className="setting-toggle__title">{t.title}</span>
              <span className="setting-toggle__hint">{t.hint}</span>
            </span>
            <span className={`switch${t.on ? ' switch--on' : ''}`} aria-hidden>
              <span className="switch__knob" />
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
