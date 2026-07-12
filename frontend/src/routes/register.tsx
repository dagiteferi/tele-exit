import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { useAuth } from "@/lib/auth";
import { registerStudent } from "@/lib/api";
import {
  AuthLayout,
  AuthSwitchLink,
  Field,
  authInputClass,
} from "@/components/AuthLayout";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Tele-Exit" },
      {
        name: "description",
        content: "Set your exam date and start preparing with one-on-one practice calls.",
      },
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

const step1Schema = z.object({
  name: z.string().trim().min(2, "Please enter your full name").max(100),
  email: z.string().trim().email("That doesn't look like a valid email").max(255),
  password: z.string().min(8, "Use at least 8 characters").max(200),
});

const step2Schema = z.object({
  fieldOfStudy: z.string().min(2, "Pick your field of study"),
  examDate: z.string().refine((s) => {
    const d = new Date(s);
    return !Number.isNaN(d.getTime()) && d.getTime() > Date.now() - 864e5;
  }, "Choose a valid exam date"),
});

const step3Schema = z.object({
  reportFrequency: z.enum(["weekly", "monthly"]),
});

const fullSchema = step1Schema.merge(step2Schema).merge(step3Schema);

type Values = z.infer<typeof fullSchema>;

function RegisterPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [values, setValues] = useState<Values>({
    name: "",
    email: "",
    password: "",
    fieldOfStudy: FIELDS[0],
    examDate: "",
    reportFrequency: "weekly",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function patch(partial: Partial<Values>) {
    setValues((v) => ({ ...v, ...partial }));
  }

  function validateStep(current: 1 | 2 | 3): boolean {
    const schema =
      current === 1 ? step1Schema : current === 2 ? step2Schema : step3Schema;
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fieldErrors[issue.path.join(".")] = issue.message;
      }
      setErrors(fieldErrors);
      return false;
    }
    setErrors({});
    return true;
  }

  function goNext() {
    if (!validateStep(step)) return;
    setStep((s) => (s < 3 ? ((s + 1) as 1 | 2 | 3) : s));
  }

  function goBack() {
    setErrors({});
    setSubmitError(null);
    setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s));
  }

  async function handleCreate() {
    setSubmitError(null);
    if (!validateStep(3)) return;
    const parsed = fullSchema.safeParse(values);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fieldErrors[issue.path.join(".")] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
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

  const titles = {
    1: "Create your account",
    2: "Your exam details",
    3: "Almost done",
  } as const;

  const subtitles = {
    1: "We'll use this to sign you in and keep your progress safe.",
    2: "Set your exam date and we'll build practice around it.",
    3: "Choose how often you'd like a progress summary, then review.",
  } as const;

  return (
    <AuthLayout
      title={titles[step]}
      subtitle={subtitles[step]}
      stepLabel={`Step ${step} of 3`}
      footer={
        <AuthSwitchLink prompt="Already have an account?" to="/login" label="Log in" />
      }
    >
      <div className="space-y-5">
        {step === 1 && (
          <>
            <Field label="Full name" htmlFor="name" error={errors.name}>
              <input
                id="name"
                autoComplete="name"
                value={values.name}
                aria-invalid={Boolean(errors.name)}
                onChange={(e) => patch({ name: e.target.value })}
                className={authInputClass}
              />
            </Field>
            <Field label="Email" htmlFor="email" error={errors.email}>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={values.email}
                aria-invalid={Boolean(errors.email)}
                onChange={(e) => patch({ email: e.target.value })}
                className={authInputClass}
              />
            </Field>
            <Field
              label="Password"
              htmlFor="password"
              error={errors.password}
              hint="At least 8 characters."
            >
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                value={values.password}
                aria-invalid={Boolean(errors.password)}
                onChange={(e) => patch({ password: e.target.value })}
                className={authInputClass}
              />
            </Field>
          </>
        )}

        {step === 2 && (
          <>
            <Field label="Field of study" htmlFor="field" error={errors.fieldOfStudy}>
              <select
                id="field"
                value={values.fieldOfStudy}
                aria-invalid={Boolean(errors.fieldOfStudy)}
                onChange={(e) => patch({ fieldOfStudy: e.target.value })}
                className={authInputClass}
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
                aria-invalid={Boolean(errors.examDate)}
                onChange={(e) => patch({ examDate: e.target.value })}
                className={authInputClass}
              />
            </Field>
          </>
        )}

        {step === 3 && (
          <>
            <fieldset>
              <legend className="mb-2 block text-sm font-medium text-primary">
                Report frequency
              </legend>
              <div role="radiogroup" className="grid grid-cols-2 gap-2">
                {(["weekly", "monthly"] as const).map((f) => {
                  const active = values.reportFrequency === f;
                  return (
                    <button
                      type="button"
                      key={f}
                      role="radio"
                      aria-checked={active}
                      onClick={() => patch({ reportFrequency: f })}
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
              {errors.reportFrequency && (
                <p className="mt-1 text-xs text-destructive" role="alert">
                  {errors.reportFrequency}
                </p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                How often you'd like a progress summary emailed to you.
              </p>
            </fieldset>

            <div className="rounded-lg border border-hairline bg-[color:var(--surface)] px-4 py-4 text-sm">
              <p className="eyebrow">Review</p>
              <dl className="mt-3 space-y-2 text-muted-foreground">
                <div className="flex justify-between gap-4">
                  <dt>Name</dt>
                  <dd className="text-right text-primary">{values.name || "—"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Email</dt>
                  <dd className="text-right text-primary">{values.email || "—"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Field</dt>
                  <dd className="text-right text-primary">{values.fieldOfStudy}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Exam date</dt>
                  <dd className="text-right text-primary">
                    {values.examDate
                      ? new Date(values.examDate).toLocaleDateString(undefined, {
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Reports</dt>
                  <dd className="text-right capitalize text-primary">
                    {values.reportFrequency}
                  </dd>
                </div>
              </dl>
            </div>
          </>
        )}

        {submitError && (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {submitError}
          </p>
        )}

        <div className="flex items-center gap-3 pt-1">
          {step > 1 && (
            <button
              type="button"
              onClick={goBack}
              className="rounded-md px-3 py-3 text-sm text-primary transition-colors hover:bg-secondary"
            >
              Back
            </button>
          )}
          {step < 3 ? (
            <button
              type="button"
              onClick={goNext}
              className="ml-auto rounded-md bg-primary px-5 py-3 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting}
              onClick={handleCreate}
              className="ml-auto rounded-md bg-primary px-5 py-3 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {submitting ? "Creating your account…" : "Create account"}
            </button>
          )}
        </div>
      </div>
    </AuthLayout>
  );
}
