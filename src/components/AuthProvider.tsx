import { createContext, useContext, useState, type ReactNode } from 'react';
import {
  getStoredUser,
  signIn as authSignIn,
  signOut as authSignOut,
  type User,
} from '../lib/auth';

interface AuthValue {
  user: User | null;
  signIn: (name: string, email: string) => Promise<void>;
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

  async function signIn(name: string, email: string): Promise<void> {
    const signedIn = await authSignIn(name, email);
    setUser(signedIn);
  }

  async function signOut(): Promise<void> {
    // Drop the authed UI first so its live queries unmount before the local
    // store is wiped, then clear the identity and data.
    setUser(null);
    await authSignOut();
  }

  return <AuthContext.Provider value={{ user, signIn, signOut }}>{children}</AuthContext.Provider>;
}
