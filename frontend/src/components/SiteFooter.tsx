import { Link } from "@tanstack/react-router";

const FOOTER_NAV = [
  { label: "Home", to: "/" as const, hash: undefined as string | undefined },
  { label: "About", to: "/" as const, hash: "about" },
  { label: "Contact", to: "/" as const, hash: "contact" },
  { label: "Log in", to: "/login" as const, hash: undefined },
  { label: "Create account", to: "/register" as const, hash: undefined },
];

/**
 * Navy footer (matches primary button). About copy, nav list, contact.
 */
export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-primary text-primary-foreground">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 py-14 md:grid-cols-[1.4fr_0.7fr_0.9fr]">
        <div>
          <BrandMark inverted />
          <p className="mt-5 max-w-md text-sm leading-relaxed text-primary-foreground/80">
            Tele-Exit is a one-on-one live video call with an AI study partner.
            You work through real previous-year exit exam questions together —
            talking through your thinking, getting things explained when you're
            stuck, and steadily closing the gaps before your exam date.
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--amber)]">
            Explore
          </p>
          <ul className="mt-4 space-y-2.5 text-sm">
            {FOOTER_NAV.map((item) => (
              <li key={item.label}>
                <Link
                  to={item.to}
                  hash={item.hash}
                  className="text-primary-foreground/80 transition-colors hover:text-primary-foreground"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--amber)]">
            Contact
          </p>
          <ul className="mt-4 space-y-2.5 text-sm text-primary-foreground/80">
            <li>
              <a
                href="mailto:hello@tele-exit.et"
                className="transition-colors hover:text-primary-foreground"
              >
                hello@tele-exit.et
              </a>
            </li>
            <li>
              <a
                href="tel:+251911000000"
                className="transition-colors hover:text-primary-foreground"
              >
                +251 911 000 000
              </a>
            </li>
            <li>Addis Ababa, Ethiopia</li>
          </ul>
          <nav aria-label="Legal" className="mt-6 flex gap-4 text-xs text-primary-foreground/60">
            <a href="#privacy" className="transition-colors hover:text-primary-foreground">
              Privacy
            </a>
            <a href="#terms" className="transition-colors hover:text-primary-foreground">
              Terms
            </a>
          </nav>
        </div>
      </div>

      <div className="border-t border-primary-foreground/10">
        <p className="mx-auto max-w-6xl px-5 py-5 text-center text-xs text-primary-foreground/55">
          © {year} Tele-Exit · Made for students in Ethiopia
        </p>
      </div>
    </footer>
  );
}

export function BrandMark({
  className = "",
  inverted = false,
}: {
  className?: string;
  inverted?: boolean;
}) {
  return (
    <Link
      to="/"
      className={`inline-flex items-center ${className}`}
      aria-label="Tele-Exit home"
    >
      <img
        src={inverted ? "/logo-light.svg" : "/logo.svg"}
        alt="Tele-Exit"
        width={160}
        height={32}
        decoding="async"
        fetchPriority="high"
        className="h-8 w-auto"
      />
    </Link>
  );
}
