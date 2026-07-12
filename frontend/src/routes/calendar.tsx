import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getMyCalendar } from "@/lib/api";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { StudentShell } from "@/components/StudentShell";

export const Route = createFileRoute("/calendar")({
  head: () => ({
    meta: [
      { title: "Study calendar — Tele-Exit" },
      { name: "description", content: "Your upcoming practice call schedule." },
    ],
  }),
  component: () => (
    <ProtectedRoute role="student">
      <StudentShell>
        <CalendarPage />
      </StudentShell>
    </ProtectedRoute>
  ),
});

function groupByDay(events: { id: string; topic: string; scheduledAt: string; durationMinutes: number }[]) {
  const map = new Map<string, typeof events>();
  for (const e of events) {
    const key = new Date(e.scheduledAt).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    const arr = map.get(key) ?? [];
    arr.push(e);
    map.set(key, arr);
  }
  return [...map.entries()];
}

function CalendarPage() {
  const q = useQuery({ queryKey: ["calendar"], queryFn: getMyCalendar });

  if (q.isLoading || !q.data) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="h-6 w-40 rounded bg-secondary" />
        <div className="h-16 rounded-md bg-secondary" />
        <div className="h-16 rounded-md bg-secondary" />
      </div>
    );
  }
  if (q.error) {
    return (
      <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        Couldn't load your calendar — try again in a moment.
      </p>
    );
  }

  const groups = groupByDay(q.data);

  return (
    <div className="space-y-10">
      <header>
        <p className="eyebrow">Calendar</p>
        <h1 className="mt-2 font-display text-3xl text-primary">Upcoming practice sessions</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Suggested sessions based on your weak topics and your exam date.
          Times are flexible — start a call whenever you're ready.
        </p>
      </header>

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing scheduled yet — start your first practice call when you're ready.
        </p>
      ) : (
        <div className="space-y-8">
          {groups.map(([day, items]) => (
            <section key={day}>
              <h2 className="eyebrow">{day}</h2>
              <ul className="mt-3 divide-y divide-[color:var(--hairline)] border-t border-b border-hairline">
                {items.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-4 py-4">
                    <div className="min-w-0">
                      <p className="truncate text-primary">{e.topic}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {new Date(e.scheduledAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                        <span aria-hidden className="mx-1.5">·</span>
                        {e.durationMinutes} min
                      </p>
                    </div>
                    <span className="rounded-full border border-hairline px-3 py-1 text-xs text-muted-foreground">
                      Suggested
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
