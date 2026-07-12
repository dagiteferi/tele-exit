import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getExam, listMyExams, type ExamSummary } from "@/lib/api";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { StudentShell } from "@/components/StudentShell";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/exams")({
  head: () => ({
    meta: [
      { title: "Exams — Tele-Exit" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <ProtectedRoute role="student">
      <StudentShell>
        <ExamsPage />
      </StudentShell>
    </ProtectedRoute>
  ),
});

function ExamsPage() {
  const { user } = useAuth();
  const exams = useQuery({ queryKey: ["exams", "mine"], queryFn: listMyExams });
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [topicFilter, setTopicFilter] = useState<string | null>(null);

  const detail = useQuery({
    queryKey: ["exams", "detail", selectedId, "practice"],
    queryFn: () => getExam(selectedId!, "practice"),
    enabled: Boolean(selectedId),
  });

  const filtered = useMemo(() => {
    const list = exams.data ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.fieldOfStudy.toLowerCase().includes(q) ||
        String(e.year ?? "").includes(q),
    );
  }, [exams.data, query]);

  const topics = useMemo(() => {
    const qs = detail.data?.questions ?? [];
    const map = new Map<string, number>();
    for (const item of qs) {
      const t = item.topic?.trim() || "Untitled";
      map.set(t, (map.get(t) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [detail.data]);

  const visibleQuestions = useMemo(() => {
    const qs = detail.data?.questions ?? [];
    if (!topicFilter) return qs;
    return qs.filter((item) => (item.topic?.trim() || "Untitled") === topicFilter);
  }, [detail.data, topicFilter]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl text-primary">Your exams</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Browse exams for{" "}
          <span className="text-primary">{user?.fieldOfStudy || "your field"}</span>, preview
          questions by topic, then start practice or exam mode.
        </p>
      </header>

      {exams.isLoading && <p className="text-sm text-muted-foreground">Loading exams…</p>}
      {exams.isError && (
        <p className="text-sm text-destructive">
          {exams.error instanceof Error ? exams.error.message : "Could not load exams."}
        </p>
      )}

      {(exams.data?.length ?? 0) > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search exams…"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm sm:max-w-sm"
          />
          <p className="text-xs text-muted-foreground">
            {filtered.length} of {exams.data?.length ?? 0} exams
          </p>
        </div>
      )}

      <div className="grid max-h-[28rem] gap-3 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((exam) => (
          <ExamCard
            key={exam.id}
            exam={exam}
            active={selectedId === exam.id}
            onSelect={() => {
              setSelectedId((id) => (id === exam.id ? null : exam.id));
              setTopicFilter(null);
            }}
          />
        ))}
      </div>

      {!exams.isLoading && (exams.data?.length ?? 0) === 0 && (
        <p className="rounded-md border border-dashed border-hairline px-4 py-10 text-center text-sm text-muted-foreground">
          No exams for your department yet. Ask an admin to upload one.
        </p>
      )}

      {selectedId && (
        <section className="rounded-lg border border-hairline bg-background">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-hairline px-5 py-4">
            <div>
              <h2 className="text-lg font-medium text-primary">
                {detail.data?.exam.title ?? "Exam details"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {detail.data
                  ? `${detail.data.questions.length} questions · ${topics.length} topics`
                  : "Loading questions…"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                to="/exams/$examId"
                params={{ examId: selectedId }}
                search={{ mode: "practice" }}
                className="rounded-md border border-input px-3 py-2 text-sm text-primary hover:bg-secondary"
              >
                Practice mode
              </Link>
              <Link
                to="/exams/$examId"
                params={{ examId: selectedId }}
                search={{ mode: "exam" }}
                className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
              >
                Exam mode
              </Link>
              <button
                type="button"
                onClick={() => {
                  setSelectedId(null);
                  setTopicFilter(null);
                }}
                className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-primary"
              >
                Close
              </button>
            </div>
          </div>

          <div className="space-y-4 p-5">
            {detail.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {detail.isError && (
              <p className="text-sm text-destructive">
                {detail.error instanceof Error ? detail.error.message : "Failed to load"}
              </p>
            )}

            {detail.data && (
              <>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setTopicFilter(null)}
                    className={
                      "rounded-md border px-3 py-1.5 text-sm " +
                      (topicFilter === null
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input hover:bg-secondary")
                    }
                  >
                    All topics ({detail.data.questions.length})
                  </button>
                  {topics.map(([topic, count]) => (
                    <button
                      key={topic}
                      type="button"
                      onClick={() => setTopicFilter(topic)}
                      className={
                        "rounded-md border px-3 py-1.5 text-sm " +
                        (topicFilter === topic
                          ? "border-primary bg-secondary font-medium text-primary"
                          : "border-input hover:bg-secondary/60")
                      }
                    >
                      {topic} ({count})
                    </button>
                  ))}
                </div>

                <ul className="max-h-96 divide-y divide-hairline overflow-y-auto rounded-md border border-hairline">
                  {visibleQuestions.map((q, i) => (
                    <li key={q.id} className="px-4 py-3 text-sm">
                      <p className="text-xs text-muted-foreground">
                        #{i + 1} · {q.topic}
                      </p>
                      <p className="mt-1">{q.questionText}</p>
                      {q.choices && q.choices.length > 0 && (
                        <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                          {q.choices.map((c) => (
                            <li key={c}>{c}</li>
                          ))}
                        </ul>
                      )}
                      {q.referenceAnswer && (
                        <p className="mt-2 text-xs text-[var(--sage)]">
                          Answer: {q.referenceAnswer}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function ExamCard({
  exam,
  active,
  onSelect,
}: {
  exam: ExamSummary;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={
        "rounded-lg border p-4 text-left transition-colors " +
        (active
          ? "border-primary bg-secondary/50"
          : "border-hairline bg-background hover:border-primary/40")
      }
    >
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        {exam.fieldOfStudy}
        {exam.year ? ` · ${exam.year}` : ""}
      </p>
      <h2 className="mt-1 line-clamp-2 text-base font-medium text-primary">{exam.title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {exam.questionCount} question{exam.questionCount === 1 ? "" : "s"}
      </p>
      <p className="mt-3 text-xs text-primary">{active ? "Hide details" : "View details & questions"}</p>
    </button>
  );
}
