import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth";

const NAV = [
  { to: "/admin/users", label: "Users" },
  { to: "/admin/questions", label: "Exams" },
] as const;

export function AdminShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-dvh bg-[color:var(--surface)] text-foreground">
      <header className="border-b border-hairline bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
          <div className="flex items-center gap-6">
            <div className="flex items-baseline gap-3">
              <span className="text-sm font-semibold text-primary">Tele-Exit</span>
              <span className="text-xs uppercase tracking-wider text-muted-foreground">Admin</span>
            </div>
            <nav className="hidden items-center gap-1 sm:flex">
              {NAV.map((item) => {
                const active = pathname.startsWith(item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={
                      "rounded-md px-3 py-1.5 text-sm " +
                      (active ? "bg-secondary text-primary font-medium" : "text-muted-foreground hover:text-primary")
                    }
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="hidden sm:inline">{user?.email}</span>
            <button
              type="button"
              onClick={() => {
                logout();
                navigate({ to: "/login" });
              }}
              className="rounded border border-input px-2 py-1 text-primary hover:bg-secondary"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
    </div>
  );
}
