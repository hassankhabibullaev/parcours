import { useEffect, useState } from 'react';
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { DeskIcon, NewspaperIcon, LexiconIcon, PracticeIcon, SettingsIcon } from './icons';
import { autoSync } from '../lib/sync';
import { uiClick, wordTap } from '../lib/sound';

// Five tabs, Home centered.
const TABS = [
  { to: '/reading', label: 'Reading', icon: NewspaperIcon, end: false },
  { to: '/vocabulary', label: 'Vocabulary', icon: LexiconIcon, end: false },
  { to: '/', label: 'Home', icon: DeskIcon, end: true },
  { to: '/practice', label: 'Practice', icon: PracticeIcon, end: false },
  { to: '/settings', label: 'Settings', icon: SettingsIcon, end: false },
];

export default function Layout() {
  const location = useLocation();

  // Background sync on load and whenever the app is refocused (no-op until linked).
  useEffect(() => {
    autoSync();
    const onVisible = () => {
      if (document.visibilityState === 'visible') autoSync();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // Hide-on-scroll masthead: slides up + fades when scrolling down, returns on
  // scroll up, always shown near the top. rAF-throttled; small deltas ignored so
  // momentum jitter doesn't flip it.
  const [headerHidden, setHeaderHidden] = useState(false);
  useEffect(() => {
    let lastY = window.scrollY;
    let ticking = false;
    const update = () => {
      ticking = false;
      const y = Math.max(0, window.scrollY);
      const delta = y - lastY;
      if (y < 48) setHeaderHidden(false);
      else if (delta > 6) setHeaderHidden(true);
      else if (delta < -6) setHeaderHidden(false);
      lastY = y;
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // A route change resets scroll to the top on most pages — show the header again.
  useEffect(() => {
    setHeaderHidden(false);
  }, [location.pathname]);

  // One click sound for every button/link, delegated so no component has to
  // remember it. Article word tokens (.w) get the softer look-up tap instead;
  // accent keys and match tiles are excluded — they play their own sounds.
  useEffect(() => {
    const onClick = (e: Event) => {
      const el = (e.target as Element | null)?.closest?.('button, a');
      if (!el) return;
      if (el.classList.contains('accent-key') || el.classList.contains('match-tile')) return;
      if (el.classList.contains('w')) wordTap();
      else uiClick();
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  return (
    <>
      <header className={`masthead${headerHidden ? ' masthead--hidden' : ''}`}>
        <h1 className="masthead__title">
          <Link to="/">
            <img className="masthead__logo" src="/icons/icon-192.png" alt="" />
            Parcours
          </Link>
        </h1>
      </header>
      <main className="page">
        <Outlet />
      </main>
      <nav className="tabbar">
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `tabbar__item${isActive ? ' tabbar__item--active' : ''}`
            }
          >
            <Icon />
            {label}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
