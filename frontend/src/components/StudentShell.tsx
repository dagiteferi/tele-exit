import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { type ReactNode } from "react";
import { useAuth } from "@/lib/auth";

const NAV = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/exams", label: "Exams" },
  { to: "/progress",  label: "Progress" },
  { to: "/calendar",  label: "Calendar" },
  { to: "/settings",  label: "Settings" },
] as const;

/**
 * Shared shell for authenticated student screens. The Live Call screen
 * intentionally does NOT use this shell — it has its own chrome-free layout.
 */
export function StudentShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="hairline-b sticky top-0 z-20 bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-5 py-4">
          <Link to="/dashboard" className="flex items-center gap-2">
            <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--amber)]" />
            <span className="font-display text-lg text-primary">Tele-Exit</span>
          </Link>

          <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => {
              const active =
                pathname === item.to || (item.to !== "/dashboard" && pathname.startsWith(item.to));
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={
                    "rounded-md px-3 py-2 text-sm transition-colors " +
                    (active
                      ? "text-primary font-medium"
                      : "text-muted-foreground hover:text-primary")
                  }
                >
                  <span className="relative">
                    {item.label}
                    {active && (
                      <span
                        aria-hidden
                        className="absolute -bottom-1 left-0 right-0 h-[2px] rounded-full bg-[var(--amber)]"
                      />
                    )}
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {user?.name}
            </span>
            <button
              type="button"
              onClick={() => {
                logout();
                navigate({ to: "/login" });
              }}
              className="rounded-md border border-input px-3 py-2 text-sm text-primary transition-colors hover:bg-secondary"
            >
              Sign out
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        <nav aria-label="Primary" className="flex gap-1 overflow-x-auto px-3 pb-2 md:hidden">
          {NAV.map((item) => {
            const active =
              pathname === item.to || (item.to !== "/dashboard" && pathname.startsWith(item.to));
            return (
              <Link
                key={item.to}
                to={item.to}
                className={
                  "shrink-0 rounded-full px-3 py-1.5 text-sm " +
                  (active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground")
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main id="main" className="mx-auto max-w-6xl px-5 py-8 md:py-12">
        {children}
      </main>
    </div>
  );
}
