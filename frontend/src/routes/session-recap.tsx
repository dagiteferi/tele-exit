import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  acceptCalendarSuggestion,
  sendProgressReport,
  type SessionWrapUp,
} from "@/lib/api";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { StudentShell } from "@/components/StudentShell";

const RECAP_KEY = "tele-exit-session-recap";

export const Route = createFileRoute("/session-recap")({
  head: () => ({
    meta: [
      { title: "Session recap — Tele-Exit" },
      { name: "description", content: "Your study session summary, calendar suggestions, and progress report." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <ProtectedRoute role="student">
      <StudentShell>
        <SessionRecapPage />
      </StudentShell>
    </ProtectedRoute>
  ),
});

function readRecap(): SessionWrapUp | null {
  try {
    const raw = sessionStorage.getItem(RECAP_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SessionWrapUp;
  } catch {
    return null;
  }
}

function SessionRecapPage() {
  const qc = useQueryClient();
  const initial = useMemo(() => readRecap(), []);
  const [recap, setRecap] = useState<SessionWrapUp | null>(initial);
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [reportNote, setReportNote] = useState<string | null>(null);

  const accept = useMutation({
    mutationFn: (id: string) => acceptCalendarSuggestion(id),
    onSuccess: (event) => {
      setAccepted((prev) => ({ ...prev, [event.id]: true }));
      void qc.invalidateQueries({ queryKey: ["calendar"] });
      void qc.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  const report = useMutation({
    mutationFn: () => sendProgressReport(),
    onSuccess: (res) => {
      setReportNote(
        res.emailTo
          ? `Report sent to ${res.emailTo}.`
          : "Report queued — check your account email in Settings.",
      );
      void qc.invalidateQueries({ queryKey: ["calendar"] });
      void qc.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (err: Error) => setReportNote(err.message),
  });

  if (!recap) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          No session recap yet — finish a practice session or end a study call first.
        </p>
        <Link to="/progress" className="text-sm text-primary underline underline-offset-4">
          Go to Progress
        </Link>
      </div>
    );
  }

  const s = recap.summary;

  return (
    <div className="space-y-10">
      <header>
        <p className="eyebrow">Session complete</p>
        <h1 className="mt-2 font-display text-3xl text-primary">Here’s what you did</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{s.summaryText}</p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <Stat label="Questions visited" value={String(s.questionsVisited)} />
        <Stat
          label="Answered"
          value={
            s.questionsAttempted
              ? `${s.questionsCorrect}/${s.questionsAttempted}`
              : "—"
          }
        />
        <Stat label="Readiness" value={`${recap.readinessPercent}%`} />
      </section>

      {s.topics.length > 0 && (
        <section>
          <h2 className="font-display text-xl text-primary">Topics covered</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {s.topics.map((t) => (
              <li
                key={t}
                className="rounded-full border border-[color:var(--hairline)] px-3 py-1 text-xs text-muted-foreground"
              >
                {t}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="font-display text-xl text-primary">AI calendar recommendations</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Based on what you practiced and your weaker topics. Accept to add to Google Calendar.
        </p>
        {recap.recommendations.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No suggestions this time.</p>
        ) : (
          <ul className="mt-5 space-y-3">
            {recap.recommendations.map((r) => {
              const done = accepted[r.id] || r.status === "accepted";
              return (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[color:var(--hairline)] px-4 py-3"
                >
                  <div>
                    <p className="font-medium text-primary">{r.topic}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(r.startIso).toLocaleString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                      <span aria-hidden className="mx-1.5">
                        ·
                      </span>
                      {r.durationMinutes} min
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={done || accept.isPending}
                    onClick={() => accept.mutate(r.id)}
                    className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
                  >
                    {done ? "Added to calendar" : "Accept → Google Calendar"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="surface-card space-y-4 p-6">
        <h2 className="font-display text-xl text-primary">Email my report</h2>
        <p className="text-sm text-muted-foreground">
          Send a progress report to your account email, and queue follow-up study blocks for weak topics.
        </p>
        <button
          type="button"
          disabled={report.isPending}
          onClick={() => report.mutate()}
          className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
        >
          {report.isPending ? "Sending…" : "Send my report"}
        </button>
        {reportNote && <p className="text-sm text-muted-foreground">{reportNote}</p>}
      </section>

      <div className="flex flex-wrap gap-4 text-sm">
        <Link to="/progress" className="text-primary underline underline-offset-4">
          View Progress
        </Link>
        <Link to="/calendar" className="text-primary underline underline-offset-4">
          Open Calendar
        </Link>
        <Link to="/dashboard" className="text-primary underline underline-offset-4">
          Dashboard
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-card p-5">
      <p className="eyebrow">{label}</p>
      <p className="mt-2 font-display text-3xl text-primary">{value}</p>
    </div>
  );
}
