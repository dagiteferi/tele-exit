import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { getMyProfile, sendProgressReport } from "@/lib/api";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { StudentShell } from "@/components/StudentShell";
import { ReadinessRing } from "@/components/ReadinessRing";

export const Route = createFileRoute("/progress")({
  head: () => ({
    meta: [
      { title: "Your progress — Tele-Exit" },
      {
        name: "description",
        content: "See how your accuracy is trending across each topic.",
      },
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

function formatDay(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** Prefer real session activity for the sparkline when scores are still 0. */
function activityTrend(summaries: { questionsVisited: number; questionsCorrect: number; questionsAttempted: number }[]) {
  if (summaries.length === 0) return [0.15, 0.18, 0.16, 0.2, 0.22, 0.19, 0.24, 0.28];
  const chronological = [...summaries].reverse();
  const pts = chronological.slice(-8).map((s) => {
    if (s.questionsAttempted > 0) return s.questionsCorrect / s.questionsAttempted;
    return Math.min(1, s.questionsVisited / 20);
  });
  while (pts.length < 8) pts.unshift(pts[0] ?? 0.2);
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
        res.emailSent
          ? `Report sent to ${res.emailTo}.`
          : res.deliveryDetail ||
              (res.emailTo
                ? `Report ready for ${res.emailTo}, but email was not delivered (Gmail not connected).`
                : "Report preview ready — email delivery is not connected."),
      );
      void qc.invalidateQueries({ queryKey: ["calendar"] });
      void qc.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (err: Error) => setReportNote(err.message),
  });

  if (q.isLoading || !q.data) {
    return <ProgressSkeleton />;
  }
  if (q.error) {
    return (
      <p
        role="alert"
        className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
      >
        Couldn't load your progress — try again in a moment.
      </p>
    );
  }

  const p = q.data;
  const topics = Object.values(p.topicScores).sort((a, b) => a.accuracy - b.accuracy);
  const scoredTopics = topics.filter((t) => t.attempted > 0);
  const overall =
    scoredTopics.length === 0
      ? 0
      : scoredTopics.reduce((s, t) => s + t.accuracy, 0) / scoredTopics.length;
  const practice = p.practiceProgress;
  const summaries = p.sessionSummaries || [];
  const totalVisited = Math.max(
    practice.reduce((s, item) => s + item.questionsVisited, 0),
    summaries.reduce((s, item) => s + item.questionsVisited, 0),
  );
  const sessionsDone = p.sessionsCompleted || summaries.length;
  const readinessPct = Math.round(p.readiness * 100);
  const trend = activityTrend(summaries);
  const weak = p.weakTopics
    .map((key) => p.topicScores[key])
    .filter(Boolean)
    .slice(0, 4);
  const resume = practice[0];

  return (
    <div className="space-y-8 md:space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-hairline pb-6">
        <div>
          <p className="eyebrow">Progress</p>
          <h1 className="mt-1 font-display text-3xl tracking-tight text-primary md:text-4xl">
            Study analytics
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Sessions, coverage, and topic accuracy that drive your readiness score.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/dashboard"
            className="rounded-md border border-input px-3.5 py-2 text-sm text-primary transition-colors hover:bg-secondary"
          >
            Dashboard
          </Link>
          <button
            type="button"
            disabled={report.isPending}
            onClick={() => report.mutate()}
            className="rounded-md bg-primary px-3.5 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {report.isPending ? "Sending…" : "Send my report"}
          </button>
        </div>
      </header>
      {reportNote && (
        <p className="rounded-md border border-hairline bg-[var(--surface)] px-3 py-2 text-sm text-muted-foreground">
          {reportNote}
        </p>
      )}

      {/* KPI strip */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="flex items-center gap-4 rounded-xl border border-hairline bg-[var(--surface)] px-4 py-4">
          <ReadinessRing value={p.readiness} size={72} stroke={7} compact caption="" />
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Readiness</p>
            <p className="mt-0.5 font-display text-2xl text-primary">{readinessPct}%</p>
            <p className="text-xs text-muted-foreground">
              {readinessPct === 0 ? "Grows after scored practice" : "From topic accuracy"}
            </p>
          </div>
        </article>
        <Kpi label="Questions visited" value={String(totalVisited)} hint="Opened across practice" />
        <Kpi label="Sessions completed" value={String(sessionsDone)} hint="Saved wrap-ups" />
        <Kpi
          label="Overall accuracy"
          value={`${Math.round(overall * 100)}%`}
          hint={
            scoredTopics.length === 0
              ? "Score answers in practice to unlock"
              : `Across ${scoredTopics.length} topic${scoredTopics.length === 1 ? "" : "s"}`
          }
        />
      </section>

      {/* Resume + trend */}
      <section className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
        <Panel
          title="In progress"
          subtitle="Resume from your last stop point."
          action={
            resume ? (
              <Link
                to="/exams/$examId"
                params={{ examId: resume.examId }}
                search={{ mode: "practice" }}
                className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground"
              >
                Resume Q{resume.questionNumber}
              </Link>
            ) : null
          }
        >
          {practice.length === 0 ? (
            <EmptyHint>
              No open practice exams. Browse exams to start tracking coverage and stop points.
            </EmptyHint>
          ) : (
            <ul className="space-y-4">
              {practice.map((item) => {
                const total = Math.max(item.questionTotal, 1);
                const visited = Math.min(item.questionsVisited, total);
                const pct = Math.round((visited / total) * 100);
                return (
                  <li key={item.attemptId} className="rounded-lg border border-hairline px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-primary">{item.examTitle}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Stopped at Q{item.questionNumber} of {total}
                          <span aria-hidden className="mx-1.5">
                            ·
                          </span>
                          {visited} visited
                        </p>
                      </div>
                      <Link
                        to="/exams/$examId"
                        params={{ examId: item.examId }}
                        search={{ mode: "practice" }}
                        className="shrink-0 text-xs text-primary underline-offset-4 hover:underline"
                      >
                        Continue
                      </Link>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-hairline">
                      <div
                        className="h-full rounded-full bg-amber"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-right text-[11px] tabular-nums text-muted-foreground">
                      {pct}% coverage
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="Activity trend" subtitle="Recent wrap-ups and scored attempts.">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-display text-3xl text-primary">{Math.round(overall * 100)}%</p>
            <p className="text-xs text-muted-foreground">
              {summaries.length > 0 ? `${summaries.length} wrap-up(s)` : "Awaiting scored work"}
            </p>
          </div>
          <div className="mt-4">
            <Sparkline values={trend} height={88} />
          </div>
          {weak.length > 0 && (
            <ul className="mt-4 space-y-2 border-t border-hairline pt-4">
              {weak.map((t) => (
                <li key={t.topic} className="flex justify-between gap-2 text-xs">
                  <span className="truncate text-primary">{t.topic}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {Math.round(t.accuracy * 100)}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </section>

      {/* Session history */}
      <Panel
        title="Session history"
        subtitle="What you covered with the coach or on your own."
        action={
          <Link
            to="/session-recap"
            className="text-xs text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
          >
            Last recap
          </Link>
        }
      >
        {summaries.length === 0 ? (
          <EmptyHint>
            No wrap-ups yet. End a study call or finish practice to save session data here.
          </EmptyHint>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                <tr className="border-b border-hairline">
                  <th className="pb-2 pr-4 font-normal">Exam</th>
                  <th className="pb-2 pr-4 font-normal">Summary</th>
                  <th className="pb-2 pr-4 font-normal">Stats</th>
                  <th className="pb-2 font-normal">When</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((s) => (
                  <tr key={s.id} className="border-b border-hairline align-top last:border-0">
                    <td className="py-3.5 pr-4 font-medium text-primary">
                      {s.examTitle || "Study session"}
                      {s.topics.length > 0 && (
                        <p className="mt-1 text-xs font-normal text-muted-foreground">
                          {s.topics.slice(0, 3).join(" · ")}
                        </p>
                      )}
                    </td>
                    <td className="max-w-md py-3.5 pr-4 text-muted-foreground">
                      <p className="line-clamp-2 leading-relaxed">{s.summaryText}</p>
                    </td>
                    <td className="py-3.5 pr-4 tabular-nums text-muted-foreground">
                      {s.questionsVisited} visited
                      {s.questionsAttempted
                        ? ` · ${s.questionsCorrect}/${s.questionsAttempted}`
                        : ""}
                    </td>
                    <td className="py-3.5 whitespace-nowrap text-muted-foreground">
                      {formatDay(s.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* Topics */}
      <Panel
        title="Topic breakdown"
        subtitle="Accuracy by topic from scored answers."
        action={
          <Link
            to="/exams"
            className="text-xs text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
          >
            Practice more
          </Link>
        }
      >
        {scoredTopics.length === 0 ? (
          <EmptyHint>
            No scored topics yet. In practice, check answers or finish an exam so accuracy can
            populate this table.
          </EmptyHint>
        ) : (
          <ul className="space-y-4">
            {topics.map((t) => (
              <li key={t.topic}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate text-primary">{t.topic}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {Math.round(t.accuracy * 100)}%
                    <span className="ml-1.5 text-xs">· {t.attempted} attempts</span>
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-hairline">
                  <div
                    className="h-full rounded-full bg-amber"
                    style={{ width: `${Math.round(t.accuracy * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <article className="rounded-xl border border-hairline bg-[var(--surface)] px-4 py-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-3xl leading-none text-primary">{value}</p>
      <p className="mt-2 text-xs leading-snug text-muted-foreground">{hint}</p>
    </article>
  );
}

function Panel({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-hairline bg-card p-5 md:p-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-primary">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function EmptyHint({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-hairline bg-[var(--surface)] px-4 py-5 text-sm leading-relaxed text-muted-foreground">
      {children}
    </p>
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
    <svg viewBox={`0 0 ${w} ${height}`} className="h-24 w-full text-amber" aria-hidden>
      <polyline fill="none" stroke="currentColor" strokeWidth="2.25" points={pts} />
    </svg>
  );
}

function ProgressSkeleton() {
  return (
    <div className="animate-pulse space-y-8">
      <div className="flex justify-between border-b border-hairline pb-6">
        <div className="space-y-2">
          <div className="h-3 w-20 rounded bg-secondary" />
          <div className="h-9 w-48 rounded bg-secondary" />
        </div>
        <div className="h-9 w-32 rounded bg-secondary" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-xl bg-secondary" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-48 rounded-xl bg-secondary" />
        <div className="h-48 rounded-xl bg-secondary" />
      </div>
    </div>
  );
}
