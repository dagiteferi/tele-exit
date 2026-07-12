import { Link } from "@tanstack/react-router";
import { lazy, Suspense, type ReactNode } from "react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

const ChatbotWidget = lazy(() =>
  import("@/components/ChatbotWidget").then((m) => ({ default: m.ChatbotWidget })),
);

export const authInputClass =
  "block w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors hover:border-primary/30 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25 aria-[invalid=true]:border-destructive aria-[invalid=true]:focus:ring-destructive/25";

/**
 * Auth shell with the same sticky nav + footer as the home page.
 * Left quote column stays fixed; form column is vertically centered.
 */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
  stepLabel,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** e.g. "Step 2 of 3" for the register wizard */
  stepLabel?: string;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <SiteHeader />

      <div className="mx-auto flex w-full max-w-5xl flex-1 items-center px-5 py-10 md:py-12">
        <div className="grid w-full gap-16 md:grid-cols-2 md:items-center">
          <div className="hidden md:block">
            <blockquote className="font-display text-2xl leading-relaxed text-primary">
              "The night before the exam, you want someone patient sitting next
              to you. That's the whole idea."
            </blockquote>
            <p className="mt-4 eyebrow">Why Tele-Exit</p>
          </div>

          <div>
            {stepLabel && (
              <p className="mb-3 text-xs font-medium tracking-wide text-muted-foreground">
                {stepLabel}
              </p>
            )}
            <h1 className="font-display text-3xl text-primary">{title}</h1>
            {subtitle && (
              <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
            )}
            <div className="mt-8">{children}</div>
            {footer && (
              <p className="mt-6 text-sm text-muted-foreground">{footer}</p>
            )}
          </div>
        </div>
      </div>

      <SiteFooter />
      <Suspense fallback={null}>
        <ChatbotWidget />
      </Suspense>
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  children,
  error,
  hint,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
  error?: string;
  hint?: string;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-primary">
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p className="mt-1 text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function AuthSwitchLink({
  prompt,
  to,
  label,
}: {
  prompt: string;
  to: "/login" | "/register";
  label: string;
}) {
  return (
    <>
      {prompt}{" "}
      <Link
        to={to}
        className="text-primary underline underline-offset-4 transition-colors hover:text-primary/80"
      >
        {label}
      </Link>
    </>
  );
}
