import { NavLink, Outlet, Link } from 'react-router-dom';
import { DeskIcon, NewspaperIcon, LexiconIcon, ConjugationIcon } from './icons';

const TABS = [
  { to: '/', label: 'Home', icon: DeskIcon, end: true },
  { to: '/reading', label: 'Reading', icon: NewspaperIcon, end: false },
  { to: '/vocabulary', label: 'Vocabulary', icon: LexiconIcon, end: false },
  { to: '/conjugation', label: 'Conjugation', icon: ConjugationIcon, end: false },
];

export default function Layout() {
  return (
    <>
      <header className="masthead">
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
