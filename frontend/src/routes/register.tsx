import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { useAuth } from "@/lib/auth";
import { registerStudent } from "@/lib/api";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Create your Tele-Exit account" },
      { name: "description", content: "Set your exam date and start preparing with one-on-one practice calls." },
    ],
  }),
  component: RegisterPage,
});

const FIELDS = [
  "Software Engineering",
  "Computer Science",
  "Electrical Engineering",
  "Mechanical Engineering",
  "Civil Engineering",
  "Medicine",
  "Nursing",
  "Pharmacy",
  "Accounting",
  "Economics",
  "Law",
  "Other",
];

const schema = z.object({
  name: z.string().trim().min(2, "Please enter your full name").max(100),
  email: z.string().trim().email("That doesn't look like a valid email").max(255),
  password: z.string().min(8, "Use at least 8 characters").max(200),
  fieldOfStudy: z.string().min(2, "Pick your field of study"),
  examDate: z.string().refine((s) => {
    const d = new Date(s);
    return !Number.isNaN(d.getTime()) && d.getTime() > Date.now() - 864e5;
  }, "Choose a valid exam date"),
  reportFrequency: z.enum(["weekly", "monthly"]),
});

function RegisterPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [values, setValues] = useState({
    name: "",
    email: "",
    password: "",
    fieldOfStudy: FIELDS[0],
    examDate: "",
    reportFrequency: "weekly" as "weekly" | "monthly",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fieldErrors[issue.path.join(".")] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const { user, token } = await registerStudent(parsed.data);
      login(user, token);
      navigate({ to: user.role === "admin" ? "/admin/questions" : "/dashboard" });
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : "Couldn't create your account — try again in a moment.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Set your exam date and we'll build practice around it."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="text-primary underline underline-offset-4">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <Field label="Full name" htmlFor="name" error={errors.name}>
          <input
            id="name"
            autoComplete="name"
            value={values.name}
            onChange={(e) => setValues({ ...values, name: e.target.value })}
            className={inputClass}
          />
        </Field>

        <Field label="Email" htmlFor="email" error={errors.email}>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={values.email}
            onChange={(e) => setValues({ ...values, email: e.target.value })}
            className={inputClass}
          />
        </Field>

        <Field label="Password" htmlFor="password" error={errors.password} hint="At least 8 characters.">
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            value={values.password}
            onChange={(e) => setValues({ ...values, password: e.target.value })}
            className={inputClass}
          />
        </Field>

        <Field label="Field of study" htmlFor="field" error={errors.fieldOfStudy}>
          <select
            id="field"
            value={values.fieldOfStudy}
            onChange={(e) => setValues({ ...values, fieldOfStudy: e.target.value })}
            className={inputClass}
          >
            {FIELDS.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </Field>

        <Field label="Exam date" htmlFor="examDate" error={errors.examDate}>
          <input
            id="examDate"
            type="date"
            value={values.examDate}
            onChange={(e) => setValues({ ...values, examDate: e.target.value })}
            className={inputClass}
          />
        </Field>

        <fieldset>
          <legend className="mb-2 block text-sm font-medium text-primary">Report frequency</legend>
          <div role="radiogroup" className="grid grid-cols-2 gap-2">
            {(["weekly", "monthly"] as const).map((f) => {
              const active = values.reportFrequency === f;
              return (
                <button
                  type="button"
                  key={f}
                  role="radio"
                  aria-checked={active}
                  onClick={() => setValues({ ...values, reportFrequency: f })}
                  className={
                    "rounded-md border px-4 py-3 text-sm capitalize transition-colors " +
                    (active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input text-primary hover:bg-secondary")
                  }
                >
                  {f}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            How often you'd like a progress summary emailed to you.
          </p>
        </fieldset>

        {submitError && (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {submitError}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-primary px-5 py-3 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {submitting ? "Creating your account…" : "Create account"}
        </button>
      </form>
    </AuthLayout>
  );
}

// -- shared layout & fields --------------------------------------------------

const inputClass =
  "block w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-[var(--amber-strong)] focus:outline-none";

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto grid max-w-5xl gap-16 px-5 py-10 md:grid-cols-2 md:py-16">
        <div className="hidden md:block">
          <Link to="/" className="flex items-center gap-2">
            <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--amber)]" />
            <span className="font-display text-lg text-primary">Tele-Exit</span>
          </Link>
          <blockquote className="mt-16 font-display text-2xl leading-relaxed text-primary">
            "The night before the exam, you want someone patient sitting next
            to you. That's the whole idea."
          </blockquote>
          <p className="mt-4 eyebrow">Why Tele-Exit</p>
        </div>

        <div>
          <Link to="/" className="mb-8 flex items-center gap-2 md:hidden">
            <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--amber)]" />
            <span className="font-display text-lg text-primary">Tele-Exit</span>
          </Link>
          <h1 className="font-display text-3xl text-primary">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <p className="mt-6 text-sm text-muted-foreground">{footer}</p>}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
  error,
  hint,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
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
