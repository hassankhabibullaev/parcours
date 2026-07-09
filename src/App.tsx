import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { useAuth } from './components/AuthProvider';
import SignInPage from './pages/SignInPage';
import HomePage from './pages/HomePage';
import ReadingPage from './pages/ReadingPage';
import ArticlePage from './pages/ArticlePage';
import VocabularyPage from './pages/VocabularyPage';
import MatchSessionPage from './pages/MatchSessionPage';
import PracticePage from './pages/PracticePage';
import PracticeHubPage from './pages/PracticeHubPage';
import ConjugationDrillPage from './pages/ConjugationDrillPage';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  const { user } = useAuth();

  // Signed out → the full-screen sign-in gate (no nav). The session persists in
  // localStorage, so this only shows on first use or after an explicit log out.
  if (!user) return <SignInPage />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="reading" element={<ReadingPage />} />
        <Route path="reading/:id" element={<ArticlePage />} />
        <Route path="vocabulary" element={<VocabularyPage />} />
        <Route path="vocabulary/learn" element={<MatchSessionPage kind="learn" />} />
        <Route path="vocabulary/practice" element={<PracticePage />} />
        <Route path="vocabulary/remember" element={<MatchSessionPage kind="remember" />} />
        <Route path="practice" element={<PracticeHubPage />} />
        <Route path="conjugation" element={<Navigate to="/practice?tab=conjugation" replace />} />
        <Route path="conjugation/:tense" element={<ConjugationDrillPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
