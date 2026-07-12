import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { getMyCalendar, getMyProfile } from "@/lib/api";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { StudentShell } from "@/components/StudentShell";
import { ReadinessRing } from "@/components/ReadinessRing";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Your dashboard — Tele-Exit" },
      {
        name: "description",
        content: "See your exam readiness, focus areas, and upcoming practice sessions.",
      },
    ],
  }),
  component: () => (
    <ProtectedRoute role="student">
      <StudentShell>
        <Dashboard />
      </StudentShell>
    </ProtectedRoute>
  ),
});

function daysUntil(iso: string): number {
  const diff = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 864e5));
}

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatExamDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function Dashboard() {
  const profile = useQuery({ queryKey: ["profile"], queryFn: getMyProfile });
  const calendar = useQuery({ queryKey: ["calendar"], queryFn: getMyCalendar });

  if (profile.isLoading || !profile.data) {
    return <DashboardSkeleton />;
  }
  if (profile.error) {
    return (
      <p
        role="alert"
        className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
      >
        Couldn't reach your profile — try refreshing in a moment.
      </p>
    );
  }

  const p = profile.data;
  const days = daysUntil(p.examDate);
  const upcoming = (calendar.data ?? []).slice(0, 4);
  const firstName = p.user.name.split(" ")[0] || "there";
  const readinessPct = Math.round(p.readiness * 100);
  const questionsVisited = p.practiceProgress.reduce((s, item) => s + item.questionsVisited, 0);
  const sessionsDone = p.sessionsCompleted || p.sessionSummaries?.length || 0;
  const resume = p.practiceProgress[0];
  const focusAreas = p.weakTopics.map((key) => p.topicScores[key]).filter(Boolean);
  const recent =
    p.sessionSummaries?.length > 0
      ? p.sessionSummaries.slice(0, 5).map((s) => ({
          id: s.id,
          title: s.examTitle || "Study session",
          detail: s.questionsAttempted
            ? `${s.questionsCorrect}/${s.questionsAttempted} correct · ${s.questionsVisited} visited`
            : `${s.questionsVisited} questions visited`,
          when: s.createdAt,
        }))
      : p.recentSessions.map((s) => ({
          id: s.id,
          title: s.topic,
          detail: `${s.correct}/${s.attempted} correct`,
          when: s.date,
        }));

  return (
    <div className="space-y-8 md:space-y-10">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-hairline pb-6">
        <div>
          <p className="eyebrow">{timeGreeting()}</p>
          <h1 className="mt-1 font-display text-3xl tracking-tight text-primary md:text-4xl">
            {firstName}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {p.fieldOfStudy}
            <span aria-hidden className="mx-2 text-hairline">
              ·
            </span>
            Exam {formatExamDate(p.examDate)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/progress"
            className="rounded-md border border-input px-3.5 py-2 text-sm text-primary transition-colors hover:bg-secondary"
          >
            View progress
          </Link>
          <Link
            to="/exams"
            className="rounded-md bg-primary px-3.5 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Browse exams
          </Link>
        </div>
      </header>

      {/* KPI strip */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="flex items-center gap-4 rounded-xl border border-hairline bg-[var(--surface)] px-4 py-4">
          <ReadinessRing value={p.readiness} size={72} stroke={7} compact caption="" />
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Readiness</p>
            <p className="mt-0.5 font-display text-2xl text-primary">{readinessPct}%</p>
            <p className="text-xs text-muted-foreground">
              {readinessPct === 0 ? "Start practicing to build this" : "Across scored topics"}
            </p>
          </div>
        </article>

        <KpiCard
          label="Days to exam"
          value={String(days)}
          hint={days <= 30 ? "Final stretch — keep sessions short and daily" : "Steady pace beats cramming"}
        />
        <KpiCard
          label="Sessions done"
          value={String(sessionsDone)}
          hint={sessionsDone === 0 ? "Complete a wrap-up to log one" : "Counted after each wrap-up"}
        />
        <KpiCard
          label="Questions visited"
          value={String(questionsVisited)}
          hint={
            resume
              ? `${resume.examTitle} in progress`
              : "Open an exam to start tracking"
          }
        />
      </section>

      {/* Resume + next action */}
      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {resume ? (
          <article className="rounded-xl border border-hairline bg-card p-5 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="eyebrow">Continue</p>
                <h2 className="mt-1 font-display text-2xl text-primary">{resume.examTitle}</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Stopped at question {resume.questionNumber} of {resume.questionTotal}
                  <span aria-hidden className="mx-1.5">
                    ·
                  </span>
                  {Math.min(resume.questionsVisited, resume.questionTotal)} visited
                </p>
              </div>
              <Link
                to="/exams/$examId"
                params={{ examId: resume.examId }}
                search={{ mode: "practice" }}
                className="shrink-0 rounded-md bg-primary px-4 py-2.5 text-sm text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Resume Q{resume.questionNumber}
              </Link>
            </div>
            <div className="mt-5">
              <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
                <span>Coverage</span>
                <span className="tabular-nums">
                  {Math.round(
                    (Math.min(resume.questionsVisited, resume.questionTotal) /
                      Math.max(resume.questionTotal, 1)) *
                      100,
                  )}
                  %
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-hairline">
                <div
                  className="h-full rounded-full bg-[var(--amber)] transition-[width] duration-500"
                  style={{
                    width: `${Math.round(
                      (Math.min(resume.questionsVisited, resume.questionTotal) /
                        Math.max(resume.questionTotal, 1)) *
                        100,
                    )}%`,
                  }}
                />
              </div>
            </div>
            {p.practiceProgress.length > 1 && (
              <ul className="mt-4 space-y-2 border-t border-hairline pt-4">
                {p.practiceProgress.slice(1, 3).map((item) => (
                  <li key={item.attemptId} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate text-primary">{item.examTitle}</span>
                    <Link
                      to="/exams/$examId"
                      params={{ examId: item.examId }}
                      search={{ mode: "practice" }}
                      className="shrink-0 text-xs text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
                    >
                      Q{item.questionNumber}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </article>
        ) : (
          <article className="rounded-xl border border-dashed border-hairline bg-[var(--surface)] p-5 md:p-6">
            <p className="eyebrow">Get started</p>
            <h2 className="mt-1 font-display text-2xl text-primary">No exam in progress</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Open a practice exam for your department, work a few questions, then start a study
              call when you want coaching out loud.
            </p>
            <Link
              to="/exams"
              className="mt-5 inline-flex rounded-md bg-primary px-4 py-2.5 text-sm text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Choose an exam
            </Link>
          </article>
        )}

        <article className="rounded-xl border border-hairline bg-primary p-5 text-primary-foreground md:p-6">
          <p className="text-xs uppercase tracking-wider text-primary-foreground/65">Next step</p>
          <h2 className="mt-2 font-display text-2xl leading-snug">
            {resume ? "Pick up where you stopped" : "Build your first readiness signal"}
          </h2>
          <p className="mt-2 text-sm text-primary-foreground/75">
            {resume
              ? "Answer a few more items, then end the session to update Progress and Calendar."
              : "Practice mode shows answers and AI help. Exam mode scores you without hints."}
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {resume ? (
              <Link
                to="/exams/$examId"
                params={{ examId: resume.examId }}
                search={{ mode: "practice" }}
                className="rounded-md bg-[var(--amber)] px-3.5 py-2 text-sm font-medium text-[var(--ink)]"
              >
                Continue practice
              </Link>
            ) : (
              <Link
                to="/exams"
                className="rounded-md bg-[var(--amber)] px-3.5 py-2 text-sm font-medium text-[var(--ink)]"
              >
                Browse exams
              </Link>
            )}
            <Link
              to="/calendar"
              className="rounded-md border border-primary-foreground/25 px-3.5 py-2 text-sm text-primary-foreground/90 hover:bg-primary-foreground/10"
            >
              Calendar
            </Link>
          </div>
        </article>
      </section>

      {/* Focus + schedule */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Focus areas"
          subtitle="Lowest accuracy topics — practice these next."
          action={
            <Link to="/progress" className="text-xs text-muted-foreground underline-offset-4 hover:text-primary hover:underline">
              Full breakdown
            </Link>
          }
        >
          {focusAreas.length === 0 ? (
            <EmptyHint>
              No weak spots yet. After you finish a scored practice or wrap-up, topics will appear
              here ranked by accuracy.
            </EmptyHint>
          ) : (
            <ul className="space-y-4">
              {focusAreas.slice(0, 5).map((t) => (
                <li key={t.topic}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate text-primary">{t.topic}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {Math.round(t.accuracy * 100)}%
                      <span className="ml-1.5 text-xs">· {t.attempted} tries</span>
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-hairline">
                    <div
                      className="h-full rounded-full bg-[var(--amber)]"
                      style={{ width: `${Math.round(t.accuracy * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Coming up"
          subtitle="Suggested study blocks from AI and your plan."
          action={
            <Link to="/calendar" className="text-xs text-muted-foreground underline-offset-4 hover:text-primary hover:underline">
              Open calendar
            </Link>
          }
        >
          {upcoming.length === 0 ? (
            <EmptyHint>
              Nothing scheduled yet. End a study call or send a progress report to generate AI
              calendar recommendations.
            </EmptyHint>
          ) : (
            <ul className="divide-y divide-hairline">
              {upcoming.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-primary">{e.topic}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatDay(e.scheduledAt)} · {e.durationMinutes} min
                      {e.status === "accepted" ? " · accepted" : " · suggested"}
                    </p>
                  </div>
                  <Link
                    to="/calendar"
                    className="shrink-0 text-xs text-primary underline-offset-4 hover:underline"
                  >
                    {e.status === "accepted" ? "View" : "Review"}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </section>

      {/* Recent activity */}
      <Panel
        title="Recent activity"
        subtitle="Sessions and wrap-ups that feed your readiness score."
        action={
          <Link to="/progress" className="text-xs text-muted-foreground underline-offset-4 hover:text-primary hover:underline">
            See all
          </Link>
        }
      >
        {recent.length === 0 ? (
          <EmptyHint>
            No sessions logged yet. Finish practice or end a study call to save a wrap-up here.
          </EmptyHint>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                <tr className="border-b border-hairline">
                  <th className="pb-2 pr-4 font-normal">Session</th>
                  <th className="pb-2 pr-4 font-normal">Result</th>
                  <th className="pb-2 font-normal">When</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((row) => (
                  <tr key={row.id} className="border-b border-hairline last:border-0">
                    <td className="py-3 pr-4 text-primary">{row.title}</td>
                    <td className="py-3 pr-4 tabular-nums text-muted-foreground">{row.detail}</td>
                    <td className="py-3 text-muted-foreground">
                      {row.when ? formatDay(row.when) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function KpiCard({ label, value, hint }: { label: string; value: string; hint: string }) {
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

function timeGreeting() {
  const h = new Date().getHours();
  if (h < 5) return "Late night";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-8">
      <div className="flex justify-between border-b border-hairline pb-6">
        <div className="space-y-2">
          <div className="h-3 w-24 rounded bg-secondary" />
          <div className="h-9 w-40 rounded bg-secondary" />
          <div className="h-3 w-56 rounded bg-secondary" />
        </div>
        <div className="h-9 w-28 rounded bg-secondary" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-xl bg-secondary" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="h-44 rounded-xl bg-secondary" />
        <div className="h-44 rounded-xl bg-secondary" />
      </div>
    </div>
  );
}
