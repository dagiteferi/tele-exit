import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { resetPassword } from "@/lib/api";
import {
  AuthLayout,
  AuthSwitchLink,
  Field,
  PasswordInput,
} from "@/components/AuthLayout";

const searchSchema = z.object({
  token: z.string().optional().catch(""),
});

export const Route = createFileRoute("/reset-password")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Reset password — Tele-Exit" },
      { name: "description", content: "Choose a new Tele-Exit password." },
    ],
  }),
  component: ResetPasswordPage,
});

const schema = z
  .object({
    password: z.string().min(6, "Use at least 6 characters").max(200),
    confirm: z.string().min(1, "Confirm your password"),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Passwords don’t match",
    path: ["confirm"],
  });

function ResetPasswordPage() {
  const { token } = Route.useSearch();
  const navigate = useNavigate();
  const [values, setValues] = useState({ password: "", confirm: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const missingToken = !token || token.length < 10;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (missingToken) {
      setSubmitError("This reset link is missing or incomplete. Request a new one.");
      return;
    }
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
      await resetPassword(token, parsed.data.password);
      setDone(true);
      window.setTimeout(() => navigate({ to: "/login" }), 1600);
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : "Couldn't reset that password — request a new link.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title={done ? "Password updated" : "Choose a new password"}
      subtitle={
        done
          ? "You can log in with your new password."
          : "Enter a new password for your Tele-Exit account."
      }
      footer={<AuthSwitchLink prompt="Back to" to="/login" label="Log in" />}
    >
      {done ? (
        <div className="space-y-4">
          <p className="rounded-md border border-hairline bg-[var(--surface)] px-3 py-3 text-sm text-muted-foreground">
            Your password was changed. Redirecting to log in…
          </p>
          <Link
            to="/login"
            className="inline-flex rounded-md bg-primary px-4 py-2.5 text-sm text-primary-foreground"
          >
            Log in now
          </Link>
        </div>
      ) : missingToken ? (
        <div className="space-y-4">
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            This reset link is missing or incomplete.
          </p>
          <Link
            to="/forgot-password"
            className="inline-flex rounded-md bg-primary px-4 py-2.5 text-sm text-primary-foreground"
          >
            Request a new link
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <Field label="New password" htmlFor="password" error={errors.password}>
            <PasswordInput
              id="password"
              autoComplete="new-password"
              value={values.password}
              aria-invalid={Boolean(errors.password)}
              onChange={(e) => setValues({ ...values, password: e.target.value })}
            />
          </Field>
          <Field label="Confirm password" htmlFor="confirm" error={errors.confirm}>
            <PasswordInput
              id="confirm"
              autoComplete="new-password"
              value={values.confirm}
              aria-invalid={Boolean(errors.confirm)}
              onChange={(e) => setValues({ ...values, confirm: e.target.value })}
            />
          </Field>

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
            className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Update password"}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
