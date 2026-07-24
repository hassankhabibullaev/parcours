import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import SignInPage from './pages/SignInPage';
import HomePage from './pages/HomePage';
import ReadingPage from './pages/ReadingPage';
import ArticlePage from './pages/ArticlePage';
import BookPage from './pages/BookPage';
import BookChapterPage from './pages/BookChapterPage';
import VocabularyPage from './pages/VocabularyPage';
import MatchSessionPage from './pages/MatchSessionPage';
import BlankSessionPage from './pages/BlankSessionPage';
import ListenSessionPage from './pages/ListenSessionPage';
import ChooseSessionPage from './pages/ChooseSessionPage';
import ConjugationPage from './pages/ConjugationPage';
import TenseGuidePage from './pages/TenseGuidePage';
import VerbPage from './pages/VerbPage';
import StudyPage from './pages/StudyPage';
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
        {/* Books before the article catch-all: /reading/book/… is a book's
            contents page or one chapter (1-based), /reading/:id an article. */}
        <Route path="reading/book/:bookId" element={<BookPage />} />
        <Route path="reading/book/:bookId/:chapter" element={<BookChapterPage />} />
        <Route path="reading/:id" element={<ArticlePage />} />
        <Route path="vocabulary" element={<VocabularyPage />} />
        {/* The four vocab modes, each mirrored on both shelves (:shelf is
            'learning' | 'learned'). */}
        <Route path="vocabulary/match/:shelf" element={<MatchSessionPage />} />
        <Route path="vocabulary/blank/:shelf" element={<BlankSessionPage />} />
        <Route path="vocabulary/listen/:shelf" element={<ListenSessionPage />} />
        <Route path="vocabulary/choose/:shelf" element={<ChooseSessionPage />} />
        {/* Legacy pre-mirror drill routes. */}
        <Route path="vocabulary/learn" element={<Navigate to="/vocabulary/match/learning" replace />} />
        <Route path="vocabulary/practice" element={<Navigate to="/vocabulary/blank/learning" replace />} />
        <Route path="vocabulary/remember" element={<Navigate to="/vocabulary/match/learned" replace />} />
        <Route path="conjugation" element={<ConjugationPage />} />
        <Route path="conjugation/guide/:tense" element={<TenseGuidePage />} />
        <Route path="conjugation/verb/:infinitive" element={<VerbPage />} />
        <Route path="conjugation/study/:infinitive" element={<StudyPage />} />
        <Route path="conjugation/focus/:infinitive" element={<ConjugationDrillPage />} />
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
