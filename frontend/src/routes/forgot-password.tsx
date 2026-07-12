import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { requestPasswordReset } from "@/lib/api";
import {
  AuthLayout,
  AuthSwitchLink,
  Field,
  authInputClass,
} from "@/components/AuthLayout";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Forgot password — Tele-Exit" },
      {
        name: "description",
        content: "Request a link to reset your Tele-Exit password.",
      },
    ],
  }),
  component: ForgotPasswordPage,
});

const schema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    const parsed = schema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || "Enter a valid email");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await requestPasswordReset(parsed.data.email);
      setMessage(res.message);
      setSent(true);
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : "Couldn't send the reset email — try again in a moment.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title={sent ? "Check your email" : "Forgot password"}
      subtitle={
        sent
          ? "If that address is registered, a reset link is on its way."
          : "Enter your account email and we’ll send a reset link."
      }
      footer={<AuthSwitchLink prompt="Remembered it?" to="/login" label="Back to log in" />}
    >
      {sent ? (
        <div className="space-y-4">
          <p className="rounded-md border border-hairline bg-[var(--surface)] px-3 py-3 text-sm text-muted-foreground">
            {message}
          </p>
          <p className="text-sm text-muted-foreground">
            Open the link in the email (expires in 1 hour), then choose a new password.
          </p>
          <Link
            to="/login"
            className="inline-flex rounded-md bg-primary px-4 py-2.5 text-sm text-primary-foreground"
          >
            Back to log in
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <Field label="Email" htmlFor="email" error={error || undefined}>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              aria-invalid={Boolean(error)}
              onChange={(e) => setEmail(e.target.value)}
              className={authInputClass}
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
            {submitting ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
