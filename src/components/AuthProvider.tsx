import { createContext, useContext, useState, type ReactNode } from 'react';
import {
  getStoredUser,
  requestCode as authRequestCode,
  verifyCode as authVerifyCode,
  signOut as authSignOut,
  type User,
} from '../lib/auth';

interface AuthValue {
  user: User | null;
  /** Email a one-time code; resolves with the code itself when mail isn't configured. */
  requestCode: (email: string) => Promise<{ devCode?: string }>;
  /** Verify the code — signs in, creating the account on first use. */
  verifyCode: (email: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within <AuthProvider>');
  return value;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => getStoredUser());

  async function requestCode(email: string): Promise<{ devCode?: string }> {
    return authRequestCode(email);
  }

  async function verifyCode(email: string, code: string): Promise<void> {
    setUser(await authVerifyCode(email, code));
  }

  async function signOut(): Promise<void> {
    // Drop the authed UI first so its live queries unmount before the local
    // store is wiped, then clear the identity and data.
    setUser(null);
    await authSignOut();
  }

  return (
    <AuthContext.Provider value={{ user, requestCode, verifyCode, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
