import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { fetchMe } from "./api";
import {
  TOKEN_KEY,
  USER_KEY,
  clearStoredSession,
  getStoredToken,
} from "./auth-storage";

/**
 * Tele-Exit auth context.
 *
 * SECURITY NOTE — token storage:
 *   Backend returns a JWT on POST /auth/register and POST /auth/login.
 *   The production-safe pattern is an httpOnly cookie set by the backend.
 *   Until that exists, the token lives in localStorage so the SPA can send
 *   `Authorization: Bearer <token>`. localStorage is XSS-readable — never
 *   log the token, never put it in URLs. On load we revalidate via GET /auth/me
 *   and clear the session if the token is invalid/expired.
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function restore() {
      try {
        const t = localStorage.getItem(TOKEN_KEY);
        if (!t) return;
        // Prefer cached user for instant UI, then confirm with /auth/me.
        const cached = localStorage.getItem(USER_KEY);
        if (cached && !cancelled) {
          try {
            setToken(t);
            setUser(JSON.parse(cached) as User);
          } catch {
            // bad cache; continue to network validation
          }
        }
        const me = await fetchMe(t);
        if (cancelled) return;
        setToken(t);
        setUser(me);
        try {
          localStorage.setItem(USER_KEY, JSON.stringify(me));
        } catch {
          // ignore
        }
      } catch {
        if (!cancelled) {
          setToken(null);
          setUser(null);
          clearStoredSession();
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    void restore();
    return () => {
      cancelled = true;
    };
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
    clearStoredSession();
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

export { getStoredToken };
