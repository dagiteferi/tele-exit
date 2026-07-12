import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Tele-Exit auth context.
 *
 * SECURITY NOTE — token storage:
 *   The backend is expected to return a JWT on POST /auth/register and
 *   POST /auth/login. The production-safe pattern is an httpOnly cookie
 *   set by the backend so JS cannot read it. Until the backend is wired,
 *   we keep the token in localStorage for the frontend to build against.
 *   Tradeoff: localStorage is readable by any script running on the page,
 *   so it is vulnerable to XSS. Do NOT log the token, do NOT put it in
 *   URLs, and switch to an httpOnly cookie the moment the backend supports
 *   it. The `Authorization: Bearer <token>` header is still attached on
 *   every fetch either way — see src/lib/api.ts.
 */

export type Role = "student" | "admin";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  fieldOfStudy?: string;
  examDate?: string; // ISO
}

interface AuthState {
  user: User | null;
  token: string | null;
  ready: boolean;
  login: (user: User, token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

const TOKEN_KEY = "tx.token";
const USER_KEY = "tx.user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Read from browser storage in effect to avoid SSR hydration mismatches.
    try {
      const t = localStorage.getItem(TOKEN_KEY);
      const u = localStorage.getItem(USER_KEY);
      if (t && u) {
        setToken(t);
        setUser(JSON.parse(u));
      }
    } catch {
      // ignore; unauthenticated
    }
    setReady(true);
  }, []);

  const login = useCallback((nextUser: User, nextToken: string) => {
    setUser(nextUser);
    setToken(nextToken);
    try {
      localStorage.setItem(TOKEN_KEY, nextToken);
      localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    } catch {
      // storage disabled; session lives in memory only
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo(
    () => ({ user, token, ready, login, logout }),
    [user, token, ready, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
