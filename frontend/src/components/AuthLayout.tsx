import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export const authInputClass =
  "block w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors hover:border-primary/30 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25 aria-[invalid=true]:border-destructive aria-[invalid=true]:focus:ring-destructive/25";

export function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  className = authInputClass,
  "aria-invalid": ariaInvalid,
  placeholder,
  required,
  minLength,
  name,
}: {
  id?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  autoComplete?: string;
  className?: string;
  "aria-invalid"?: boolean;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  name?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        value={value}
        onChange={onChange}
        aria-invalid={ariaInvalid}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        className={`${className} pr-11`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground transition-colors hover:text-primary"
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 3l18 18M10.5 10.7a3 3 0 0 0 4.1 4.1M9.4 5.5A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a18.4 18.4 0 0 1-4.2 4.8M6.1 6.1C3.7 7.8 2 12 2 12s3.5 7 10 7c1.5 0 2.9-.3 4.1-.8"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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
