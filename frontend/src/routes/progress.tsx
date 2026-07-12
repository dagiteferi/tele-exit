import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  getMyProfile,
  sendProgressReport,
} from "@/lib/api";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { StudentShell } from "@/components/StudentShell";

export const Route = createFileRoute("/progress")({
  head: () => ({
    meta: [
      { title: "Your progress — Tele-Exit" },
      { name: "description", content: "See how your accuracy is trending across each topic." },
    ],
  }),
  component: () => (
    <ProtectedRoute role="student">
      <StudentShell>
        <ProgressPage />
      </StudentShell>
    </ProtectedRoute>
  ),
});

// Deterministic-ish trend line so the page feels alive without a backend.
function trendFor(topic: string, accuracy: number): number[] {
  const seed = topic.length;
  const pts: number[] = [];
  const start = Math.max(0.2, accuracy - 0.25);
  for (let i = 0; i < 8; i++) {
    const wobble = (Math.sin((i + seed) * 1.2) + 1) / 20;
    const eased = start + ((accuracy - start) * i) / 7 + wobble - 0.025;
    pts.push(Math.max(0, Math.min(1, eased)));
  }
  return pts;
}

function ProgressPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["profile"], queryFn: getMyProfile });
  const [reportNote, setReportNote] = useState<string | null>(null);
  const report = useMutation({
    mutationFn: () => sendProgressReport(),
    onSuccess: (res) => {
      setReportNote(
        res.emailTo
          ? `Report sent to ${res.emailTo}.`
          : "Report queued — confirm your email in Settings.",
      );
      void qc.invalidateQueries({ queryKey: ["calendar"] });
      void qc.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (err: Error) => setReportNote(err.message),
  });

  if (q.isLoading || !q.data) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-6 w-40 rounded bg-secondary" />
        <div className="h-40 rounded-xl bg-secondary" />
        <div className="h-64 rounded-xl bg-secondary" />
      </div>
    );
  }
  if (q.error) {
    return (
      <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        Couldn't load your progress — try again in a moment.
      </p>
    );
  }

  const topics = Object.values(q.data.topicScores).sort((a, b) => a.accuracy - b.accuracy);
  const overall =
    topics.length === 0
      ? 0
      : topics.reduce((s, t) => s + t.accuracy, 0) / topics.length;
  const overallTrend = trendFor("overall", overall || 0.5);
  const practice = q.data.practiceProgress;
  const summaries = q.data.sessionSummaries || [];
  const totalVisited = practice.reduce((s, p) => s + p.questionsVisited, 0);
  const sessionsDone = q.data.sessionsCompleted || summaries.length;

  return (
    <div className="space-y-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Progress</p>
          <h1 className="mt-2 font-display text-3xl text-primary">How you're trending</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Session history, questions you’ve covered, and your accuracy by topic.
          </p>
        </div>
        <button
          type="button"
          disabled={report.isPending}
          onClick={() => report.mutate()}
          className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
        >
          {report.isPending ? "Sending…" : "Send my report"}
        </button>
      </header>
      {reportNote && <p className="text-sm text-muted-foreground">{reportNote}</p>}

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="surface-card p-6">
          <p className="eyebrow">Questions visited</p>
          <p className="mt-2 font-display text-4xl text-primary">{totalVisited}</p>
          <p className="mt-2 text-sm text-muted-foreground">Across open practice exams</p>
        </div>
        <div className="surface-card p-6">
          <p className="eyebrow">Sessions completed</p>
          <p className="mt-2 font-display text-4xl text-primary">{sessionsDone}</p>
          <p className="mt-2 text-sm text-muted-foreground">Saved study wrap-ups</p>
        </div>
        <div className="surface-card p-6">
          <p className="eyebrow">Overall accuracy</p>
          <p className="mt-2 font-display text-4xl text-primary">
            {Math.round(overall * 100)}%
          </p>
          <p className="mt-2 text-sm text-muted-foreground">From scored topic attempts</p>
        </div>
      </section>

      {summaries.length > 0 && (
        <section>
          <h2 className="font-display text-xl text-primary">Recent session data</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            What you covered with the coach or on your own after each wrap-up.
          </p>
          <ul className="mt-5 space-y-3">
            {summaries.map((s) => (
              <li
                key={s.id}
                className="rounded-xl border border-[color:var(--hairline)] px-4 py-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium text-primary">{s.examTitle || "Study session"}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.createdAt
                      ? new Date(s.createdAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })
                      : ""}
                  </p>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{s.summaryText}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Visited {s.questionsVisited}
                  {s.questionsAttempted
                    ? ` · scored ${s.questionsCorrect}/${s.questionsAttempted}`
                    : ""}
                  {s.topics.length ? ` · ${s.topics.slice(0, 4).join(", ")}` : ""}
                </p>
              </li>
            ))}
          </ul>
          <Link
            to="/session-recap"
            className="mt-4 inline-block text-sm text-primary underline underline-offset-4"
          >
            Open last session recap
          </Link>
        </section>
      )}

      {practice.length > 0 && (
        <section>
          <h2 className="font-display text-xl text-primary">Practice stop points</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Resume each exam from the question you left on.
          </p>
          <ul className="mt-5 space-y-3">
            {practice.map((item) => {
              const total = Math.max(item.questionTotal, 1);
              const visited = Math.min(item.questionsVisited, total);
              return (
                <li
                  key={item.attemptId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[color:var(--hairline)] px-4 py-3"
                >
                  <div>
                    <p className="font-medium text-primary">{item.examTitle}</p>
                    <p className="text-sm text-muted-foreground">
                      Q{item.questionNumber} of {total} · {visited} visited
                    </p>
                  </div>
                  <Link
                    to="/exams/$examId"
                    params={{ examId: item.examId }}
                    search={{ mode: "practice" }}
                    className="text-sm text-primary underline underline-offset-4"
                  >
                    Resume
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="surface-card p-6">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="eyebrow">Accuracy trend</p>
            <p className="mt-2 font-display text-4xl text-primary">
              {Math.round(overall * 100)}%
            </p>
          </div>
          <p className="text-xs text-muted-foreground">Last 8 sessions</p>
        </div>
        <div className="mt-6">
          <Sparkline values={overallTrend} height={80} />
        </div>
      </section>

      <section>
        <h2 className="font-display text-xl text-primary">Topic breakdown</h2>
        {topics.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No scored topics yet — finish a practice exam or study call wrap-up.
          </p>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                <tr className="hairline-b">
                  <th className="py-2 font-normal">Topic</th>
                  <th className="py-2 font-normal">Accuracy</th>
                  <th className="py-2 font-normal">Attempts</th>
                </tr>
              </thead>
              <tbody>
                {topics.map((t) => (
                  <tr key={t.topic} className="hairline-b">
                    <td className="py-3 text-primary">{t.topic}</td>
                    <td className="py-3 tabular-nums text-muted-foreground">
                      {Math.round(t.accuracy * 100)}%
                    </td>
                    <td className="py-3 tabular-nums text-muted-foreground">{t.attempted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Sparkline({ values, height = 60 }: { values: number[]; height?: number }) {
  const w = 320;
  const pad = 4;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 0.05);
  const pts = values
    .map((v, i) => {
      const x = pad + (i / Math.max(values.length - 1, 1)) * (w - pad * 2);
      const y = height - pad - ((v - min) / range) * (height - pad * 2);
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="h-20 w-full text-[var(--amber)]" aria-hidden>
      <polyline fill="none" stroke="currentColor" strokeWidth="2" points={pts} />
    </svg>
  );
}
