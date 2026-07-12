import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getMyCalendar, getMyProfile } from "@/lib/api";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { StudentShell } from "@/components/StudentShell";
import { ReadinessRing } from "@/components/ReadinessRing";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Your dashboard — Tele-Exit" },
      { name: "description", content: "See your exam readiness, focus areas, and upcoming practice sessions." },
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
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function Dashboard() {
  const profile = useQuery({ queryKey: ["profile"], queryFn: getMyProfile });
  const calendar = useQuery({ queryKey: ["calendar"], queryFn: getMyCalendar });

  if (profile.isLoading || !profile.data) {
    return <DashboardSkeleton />;
  }
  if (profile.error) {
    return (
      <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        Couldn't reach your profile — try refreshing in a moment.
      </p>
    );
  }

  const p = profile.data;
  const days = daysUntil(p.examDate);
  const upcoming = (calendar.data ?? []).slice(0, 3);

  // Focus areas are derived directly from the same topicScores that back
  // the readiness ring — single source of truth per the brief.
  const focusAreas = p.weakTopics
    .map((key) => p.topicScores[key])
    .filter(Boolean);

  const greeting = timeGreeting();

  return (
    <div className="space-y-14">
      {/* Top: ring + greeting */}
      <section className="grid gap-10 md:grid-cols-[auto_1fr] md:items-center">
        <div className="mx-auto md:mx-0">
          <ReadinessRing value={p.readiness} />
        </div>
        <div>
          <p className="eyebrow">{greeting}, {p.user.name.split(" ")[0]}</p>
          <p className="mt-4 text-lg text-muted-foreground">Your exam is in</p>
          <p className="mt-1 font-display text-6xl leading-none text-primary md:text-7xl">
            {days} <span className="text-3xl text-muted-foreground">days</span>
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            {p.fieldOfStudy} track
            <span aria-hidden className="mx-2">·</span>
            Exam on {new Date(p.examDate).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
          </p>
        </div>
      </section>

      {/* Primary CTA */}
      <section>
        <Link
          to="/exams"
          className="group flex w-full items-center justify-between rounded-xl bg-primary px-6 py-5 text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <span className="font-display text-2xl">Browse exams</span>
          <span aria-hidden className="text-2xl text-[var(--amber)] transition-transform group-hover:translate-x-1">
            →
          </span>
        </Link>
        <p className="mt-2 text-xs text-muted-foreground">
          Practice with answers and AI, or take a scored exam for your department.
        </p>
      </section>

      {/* Focus + upcoming */}
      <section className="grid gap-10 md:grid-cols-2">
        <div>
          <h2 className="font-display text-xl text-primary">Focus areas</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Where your accuracy is lowest right now.
          </p>
          {focusAreas.length === 0 ? (
            <p className="mt-5 text-sm text-muted-foreground">
              No weak spots yet — practice an exam to see where to focus.
            </p>
          ) : (
            <ul className="mt-5 space-y-4">
              {focusAreas.map((t) => (
                <li key={t.topic}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-primary">{t.topic}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {Math.round(t.accuracy * 100)}%
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[color:var(--hairline)]">
                    <div
                      className="h-full rounded-full bg-[var(--amber)]"
                      style={{ width: `${Math.round(t.accuracy * 100)}%` }}
                      aria-hidden
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h2 className="font-display text-xl text-primary">Coming up</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Your next few planned sessions.
          </p>
          {upcoming.length === 0 ? (
            <p className="mt-5 text-sm text-muted-foreground">
              No sessions scheduled — start your first practice call when you're ready.
            </p>
          ) : (
            <ul className="mt-5 divide-y divide-[color:var(--hairline)]">
              {upcoming.map((e) => (
                <li key={e.id} className="flex items-center justify-between py-3 text-sm">
                  <div>
                    <div className="text-primary">{e.topic}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDay(e.scheduledAt)} · {e.durationMinutes} min
                    </div>
                  </div>
                  <Link to="/calendar" className="text-xs text-primary underline underline-offset-4">
                    View
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Recent sessions */}
      <section>
        <h2 className="font-display text-xl text-primary">Recent sessions</h2>
        {p.recentSessions.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No sessions yet — start your first practice call when you're ready.
          </p>
        ) : (
          <table className="mt-5 w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted-foreground">
              <tr className="hairline-b">
                <th className="py-2 font-normal">Topic</th>
                <th className="py-2 font-normal">Score</th>
                <th className="py-2 font-normal">When</th>
              </tr>
            </thead>
            <tbody>
              {p.recentSessions.map((s) => (
                <tr key={s.id} className="hairline-b">
                  <td className="py-3 text-primary">{s.topic}</td>
                  <td className="py-3 tabular-nums text-muted-foreground">
                    {s.correct}/{s.attempted}
                  </td>
                  <td className="py-3 text-muted-foreground">{formatDay(s.date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
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
    <div className="animate-pulse space-y-10">
      <div className="grid gap-10 md:grid-cols-[auto_1fr] md:items-center">
        <div className="mx-auto h-[220px] w-[220px] rounded-full bg-secondary md:mx-0" />
        <div className="space-y-3">
          <div className="h-3 w-32 rounded bg-secondary" />
          <div className="h-16 w-64 rounded bg-secondary" />
          <div className="h-3 w-48 rounded bg-secondary" />
        </div>
      </div>
      <div className="h-16 rounded-xl bg-secondary" />
      <div className="grid gap-8 md:grid-cols-2">
        <div className="space-y-3">
          <div className="h-4 w-40 rounded bg-secondary" />
          <div className="h-3 w-full rounded bg-secondary" />
          <div className="h-3 w-full rounded bg-secondary" />
          <div className="h-3 w-full rounded bg-secondary" />
        </div>
        <div className="space-y-3">
          <div className="h-4 w-40 rounded bg-secondary" />
          <div className="h-3 w-full rounded bg-secondary" />
          <div className="h-3 w-full rounded bg-secondary" />
        </div>
      </div>
    </div>
  );
}
