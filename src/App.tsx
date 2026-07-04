import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import ReadingPage from './pages/ReadingPage';
import ArticlePage from './pages/ArticlePage';
import VocabularyPage from './pages/VocabularyPage';
import MatchSessionPage from './pages/MatchSessionPage';
import PracticePage from './pages/PracticePage';
import ConjugationPage from './pages/ConjugationPage';
import ConjugationDrillPage from './pages/ConjugationDrillPage';

export default function App() {
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
        <Route path="conjugation" element={<ConjugationPage />} />
        <Route path="conjugation/:tense" element={<ConjugationDrillPage />} />
      </Route>
    </Routes>
  );
}
