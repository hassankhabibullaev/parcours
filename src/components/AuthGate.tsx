import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';

/**
 * Guest gating. The app is fully browsable without an account (read articles,
 * conjugation practice), but anything that writes personal progress — marking an
 * article read, saving a word, practising the saved vocabulary — needs a signed-in
 * account. Those call sites wrap their action in `requireAuth(reason)`: if the
 * learner is signed in it returns true and the action proceeds; otherwise it pops
 * a modal explaining what an account unlocks and offering the sign-in page. The
 * learner can dismiss it and keep browsing.
 */

export type GateReason = 'read' | 'vocab' | 'practice';

const COPY: Record<GateReason, { title: string; body: string }> = {
  read: {
    title: 'Keep track of your reading',
    body: 'Log in or create a free account to mark articles as read and remember where you left off. It only takes a moment.',
  },
  vocab: {
    title: 'Save words to your vocabulary',
    body: 'Log in or create a free account to build a personal word list you can practise later. It only takes a moment.',
  },
  practice: {
    title: 'Practise your vocabulary',
    body: 'Log in or create a free account to save words and drill them here. Conjugation practice stays open to everyone.',
  },
};

interface AuthGateValue {
  /**
   * True when a user is signed in. When signed out, shows the sign-in prompt for
   * `reason` and returns false, so a caller can early-return from its handler.
   */
  requireAuth: (reason: GateReason) => boolean;
}

const AuthGateContext = createContext<AuthGateValue | null>(null);

export function useAuthGate(): AuthGateValue {
  const value = useContext(AuthGateContext);
  if (!value) throw new Error('useAuthGate must be used within <AuthGateProvider>');
  return value;
}

export function AuthGateProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [reason, setReason] = useState<GateReason | null>(null);

  const requireAuth = useCallback(
    (r: GateReason) => {
      if (user) return true;
      setReason(r);
      return false;
    },
    [user],
  );

  return (
    <AuthGateContext.Provider value={{ requireAuth }}>
      {children}
      {reason && <AuthRequiredModal reason={reason} onClose={() => setReason(null)} />}
    </AuthGateContext.Provider>
  );
}

function AuthRequiredModal({ reason, onClose }: { reason: GateReason; onClose: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { title, body } = COPY[reason];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function goToSignIn() {
    onClose();
    navigate('/signin', { state: { from: location.pathname + location.search } });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal__close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h3 className="modal__heading">{title}</h3>
        <p className="modal__lede">{body}</p>
        <div className="modal__actions modal__actions--stack">
          <button className="btn btn--accent" onClick={goToSignIn}>
            Log in or sign up
          </button>
          <button className="btn btn--ghost" onClick={onClose}>
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Inline sign-in prompt for a whole page a guest can't use directly (the vocab
 * drills, reachable by URL). Sends them to sign-in and remembers the way back.
 */
export function GuestNotice({ message }: { message: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <div className="card">
      <p style={{ margin: '0 0 12px' }}>{message}</p>
      <button
        className="btn btn--accent"
        onClick={() => navigate('/signin', { state: { from: location.pathname + location.search } })}
      >
        Log in or sign up
      </button>
    </div>
  );
}
