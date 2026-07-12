import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getMyProfile } from "@/lib/api";
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
  const q = useQuery({ queryKey: ["profile"], queryFn: getMyProfile });

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

  return (
    <div className="space-y-12">
      <header>
        <p className="eyebrow">Progress</p>
        <h1 className="mt-2 font-display text-3xl text-primary">How you're trending</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          A quiet look at how your accuracy has moved across recent sessions.
          Focus areas at the top are the ones to spend the next call on.
        </p>
      </header>

      <section className="surface-card p-6">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="eyebrow">Overall accuracy</p>
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
            No topic scores yet — complete a practice or exam to see your breakdown.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                <tr className="hairline-b">
                  <th className="py-2 pr-4 font-normal">Topic</th>
                  <th className="py-2 pr-4 font-normal">Trend</th>
                  <th className="py-2 pr-4 font-normal">Correct / attempted</th>
                  <th className="py-2 pr-4 text-right font-normal">Accuracy</th>
                </tr>
              </thead>
              <tbody>
                {topics.map((t) => (
                  <tr key={t.topic} className="hairline-b">
                    <td className="py-3 pr-4 text-primary">{t.topic}</td>
                    <td className="py-3 pr-4">
                      <Sparkline values={trendFor(t.topic, t.accuracy)} height={28} width={120} />
                    </td>
                    <td className="py-3 pr-4 tabular-nums text-muted-foreground">
                      {t.correct} / {t.attempted}
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums text-primary">
                      {Math.round(t.accuracy * 100)}%
                    </td>
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

function Sparkline({
  values,
  height = 40,
  width = 480,
}: {
  values: number[];
  height?: number;
  width?: number;
}) {
  if (values.length === 0) return null;
  const stepX = width / (values.length - 1);
  const points = values.map((v, i) => `${i * stepX},${height - v * (height - 4) - 2}`).join(" ");
  const areaPoints = `0,${height} ${points} ${width},${height}`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} aria-hidden>
      <polygon points={areaPoints} fill="var(--amber)" opacity="0.12" />
      <polyline points={points} fill="none" stroke="var(--ink)" strokeWidth="1.5" strokeLinejoin="round" />
      {values.map((v, i) => (
        <circle
          key={i}
          cx={i * stepX}
          cy={height - v * (height - 4) - 2}
          r={i === values.length - 1 ? 3 : 1.5}
          fill={i === values.length - 1 ? "var(--amber)" : "var(--ink)"}
        />
      ))}
    </svg>
  );
}
