import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import SignInPage from './pages/SignInPage';
import HomePage from './pages/HomePage';
import ReadingPage from './pages/ReadingPage';
import ArticlePage from './pages/ArticlePage';
import VocabularyPage from './pages/VocabularyPage';
import MatchSessionPage from './pages/MatchSessionPage';
import PracticePage from './pages/PracticePage';
import ConjugationPage from './pages/ConjugationPage';
import TenseGuidePage from './pages/TenseGuidePage';
import VerbPage from './pages/VerbPage';
import ConjugationDrillPage from './pages/ConjugationDrillPage';
import ProfilePage from './pages/ProfilePage';

export default function App() {
  // The app is browsable without an account (see components/AuthGate). Signing in
  // is a route, not a wall: guests land on the app and only hit the sign-in page
  // when they choose to, or when a personal-progress action asks them to.
  return (
    <Routes>
      <Route path="/signin" element={<SignInPage />} />
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="reading" element={<ReadingPage />} />
        <Route path="reading/:id" element={<ArticlePage />} />
        <Route path="vocabulary" element={<VocabularyPage />} />
        <Route path="vocabulary/learn" element={<MatchSessionPage kind="learn" />} />
        <Route path="vocabulary/practice" element={<PracticePage />} />
        <Route path="vocabulary/remember" element={<MatchSessionPage kind="remember" />} />
        <Route path="conjugation" element={<ConjugationPage />} />
        <Route path="conjugation/guide/:tense" element={<TenseGuidePage />} />
        <Route path="conjugation/verb/:infinitive" element={<VerbPage />} />
        <Route path="conjugation/:tense" element={<ConjugationDrillPage />} />
        <Route path="profile" element={<ProfilePage />} />
        {/* Legacy routes from the pre-rename layout. */}
        <Route path="practice" element={<Navigate to="/conjugation?tab=practice" replace />} />
        <Route path="settings" element={<Navigate to="/profile" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
