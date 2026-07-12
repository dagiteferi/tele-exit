import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { useAuth } from "@/lib/auth";
import { loginStudent } from "@/lib/api";
import {
  AuthLayout,
  AuthSwitchLink,
  Field,
  authInputClass,
} from "@/components/AuthLayout";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Tele-Exit" },
      { name: "description", content: "Log back in to keep preparing for your exit exam." },
    ],
  }),
  component: LoginPage,
});

const schema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(1, "Enter your password").max(200),
});

function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [values, setValues] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      for (const i of parsed.error.issues) fe[i.path.join(".")] = i.message;
      setErrors(fe);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const { user, token } = await loginStudent(parsed.data.email, parsed.data.password);
      login(user, token);
      navigate({ to: user.role === "admin" ? "/admin/users" : "/dashboard" });
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : "Couldn't sign you in — check your email and password, then try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Pick up right where you left off."
      footer={
        <AuthSwitchLink prompt="New to Tele-Exit?" to="/register" label="Create an account" />
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <Field label="Email" htmlFor="email" error={errors.email}>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={values.email}
            aria-invalid={Boolean(errors.email)}
            onChange={(e) => setValues({ ...values, email: e.target.value })}
            className={authInputClass}
          />
        </Field>

        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <label htmlFor="password" className="block text-sm font-medium text-primary">
              Password
            </label>
            <a
              href="#forgot-password"
              className="text-xs text-muted-foreground transition-colors hover:text-primary"
            >
              Forgot password?
            </a>
          </div>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={values.password}
            aria-invalid={Boolean(errors.password)}
            onChange={(e) => setValues({ ...values, password: e.target.value })}
            className={authInputClass}
          />
          {errors.password && (
            <p role="alert" className="mt-1 text-xs text-destructive">
              {errors.password}
            </p>
          )}
        </div>

        {submitError && (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {submitError}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-primary px-5 py-3 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {submitting ? "Signing in…" : "Log in"}
        </button>
      </form>
    </AuthLayout>
  );
}
