import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getMyProfile, updateSettings } from "@/lib/api";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { StudentShell } from "@/components/StudentShell";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Tele-Exit" },
      { name: "description", content: "Adjust how often you get progress reports and manage your account." },
    ],
  }),
  component: () => (
    <ProtectedRoute role="student">
      <StudentShell>
        <SettingsPage />
      </StudentShell>
    </ProtectedRoute>
  ),
});

function SettingsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["profile"], queryFn: getMyProfile });
  const [saving, setSaving] = useState<"weekly" | "monthly" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function setFrequency(freq: "weekly" | "monthly") {
    if (!q.data) return;
    setError(null);
    setSaving(freq);
    try {
      await updateSettings({ reportFrequency: freq });
      qc.setQueryData(["profile"], { ...q.data, reportFrequency: freq });
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that change — try again.");
    } finally {
      setSaving(null);
    }
  }

  const freq = q.data?.reportFrequency;

  return (
    <div className="space-y-12">
      <header>
        <p className="eyebrow">Settings</p>
        <h1 className="mt-2 font-display text-3xl text-primary">Your preferences</h1>
      </header>

      <section className="max-w-xl space-y-3">
        <h2 className="font-display text-xl text-primary">Progress reports</h2>
        <p className="text-sm text-muted-foreground">
          A short summary of what you've practiced and where you're improving.
        </p>
        <div role="radiogroup" aria-label="Report frequency" className="mt-3 grid grid-cols-2 gap-2">
          {(["weekly", "monthly"] as const).map((f) => {
            const active = freq === f;
            return (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={saving !== null || q.isLoading}
                onClick={() => setFrequency(f)}
                className={
                  "rounded-md border px-4 py-3 text-sm capitalize transition-colors " +
                  (active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input text-primary hover:bg-secondary")
                }
              >
                {saving === f ? "Saving…" : f}
              </button>
            );
          })}
        </div>
        {saved && (
          <p role="status" className="text-xs text-[var(--sage)]">Saved.</p>
        )}
        {error && (
          <p role="alert" className="text-xs text-destructive">{error}</p>
        )}
      </section>

      <section className="max-w-xl">
        <h2 className="font-display text-xl text-primary">Account</h2>
        <dl className="mt-4 divide-y divide-[color:var(--hairline)] border-t border-b border-hairline">
          <Row label="Name" value={user?.name ?? "—"} />
          <Row label="Email" value={user?.email ?? "—"} />
          <Row label="Field of study" value={q.data?.fieldOfStudy ?? "—"} />
          <Row
            label="Exam date"
            value={
              q.data?.examDate
                ? new Date(q.data.examDate).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
                : "—"
            }
          />
        </dl>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-primary">{value}</dd>
    </div>
  );
}
