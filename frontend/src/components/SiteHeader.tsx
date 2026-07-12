import { Link, useRouterState } from "@tanstack/react-router";
import { BrandMark } from "@/components/SiteFooter";

const NAV_LINKS = [
  { label: "Home", to: "/" as const, hash: undefined as string | undefined },
  { label: "About", to: "/" as const, hash: "about" },
  { label: "Contact", to: "/" as const, hash: "contact" },
];

/**
 * Sticky marketing header: logo left, page links center, auth actions right.
 * About / Contact scroll to sections on the home page.
 */
export function SiteHeader() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const hash = useRouterState({ select: (s) => s.location.hash.replace(/^#/, "") });

  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
        <BrandMark className="shrink-0" />

        <nav aria-label="Primary" className="hidden items-center gap-1 sm:flex">
          {NAV_LINKS.map((item) => {
            const active = item.hash
              ? pathname === "/" && hash === item.hash
              : pathname === "/" && (!hash || hash === "");
            return (
              <Link
                key={item.label}
                to={item.to}
                hash={item.hash}
                className={
                  "rounded-md px-3 py-2 text-sm transition-colors hover:bg-secondary hover:text-primary " +
                  (active ? "font-medium text-primary" : "text-muted-foreground")
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            to="/login"
            className="rounded-md px-3 py-2 text-sm text-primary transition-colors hover:bg-secondary"
          >
            Log in
          </Link>
          <Link
            to="/register"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Create account
          </Link>
        </div>
      </div>

      <nav
        aria-label="Primary mobile"
        className="flex gap-1 overflow-x-auto border-t border-hairline px-3 pb-2 pt-1 sm:hidden"
      >
        {NAV_LINKS.map((item) => (
          <Link
            key={item.label}
            to={item.to}
            hash={item.hash}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-primary"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
