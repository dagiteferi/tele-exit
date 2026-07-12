import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getExam, listMyExams, type ExamSummary } from "@/lib/api";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { StudentShell } from "@/components/StudentShell";
import { ExamTopicPanel } from "@/components/ExamTopicPanel";
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

  const selectedExam = (exams.data ?? []).find((e) => e.id === selectedId);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl text-primary">Your exams</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Browse exams for{" "}
          <span className="text-primary">{user?.fieldOfStudy || "your field"}</span>, preview by
          topic, then start practice or exam mode.
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

      <div className="grid max-h-[22rem] gap-3 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((exam) => (
          <ExamCard
            key={exam.id}
            exam={exam}
            active={selectedId === exam.id}
            onSelect={() => setSelectedId((id) => (id === exam.id ? null : exam.id))}
          />
        ))}
      </div>

      {!exams.isLoading && (exams.data?.length ?? 0) === 0 && (
        <p className="rounded-md border border-dashed border-hairline px-4 py-10 text-center text-sm text-muted-foreground">
          No exams for your department yet. Ask an admin to upload one.
        </p>
      )}

      {selectedId && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {selectedExam?.fieldOfStudy}
                {selectedExam?.year ? ` · ${selectedExam.year}` : ""}
              </p>
              <h2 className="mt-1 font-display text-2xl text-primary">
                {detail.data?.exam.title ?? selectedExam?.title ?? "Exam details"}
              </h2>
              {detail.data && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {detail.data.questions.length} questions across topics — pick a topic on the left
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                to="/exams/$examId"
                params={{ examId: selectedId }}
                search={{ mode: "practice" }}
                className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Practice with answers & AI
              </Link>
              <Link
                to="/exams/$examId"
                params={{ examId: selectedId }}
                search={{ mode: "exam" }}
                className="rounded-lg border border-input px-4 py-2.5 text-sm text-primary hover:bg-secondary"
              >
                Take scored exam
              </Link>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-primary"
              >
                Close
              </button>
            </div>
          </div>

          {detail.isLoading && <p className="text-sm text-muted-foreground">Loading questions…</p>}
          {detail.isError && (
            <p className="text-sm text-destructive">
              {detail.error instanceof Error ? detail.error.message : "Failed to load"}
            </p>
          )}
          {detail.data && (
            <ExamTopicPanel questions={detail.data.questions} showAnswers />
          )}
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
        "rounded-xl border p-4 text-left transition-colors " +
        (active
          ? "border-primary bg-secondary/40 shadow-sm"
          : "border-hairline bg-background hover:border-primary/35")
      }
    >
      <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
        {exam.fieldOfStudy}
        {exam.year ? ` · ${exam.year}` : ""}
      </p>
      <h2 className="mt-1.5 line-clamp-2 text-base font-medium text-primary">{exam.title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {exam.questionCount} question{exam.questionCount === 1 ? "" : "s"}
      </p>
      <p className="mt-3 text-xs font-medium text-primary">
        {active ? "Selected" : "Open details"}
      </p>
    </button>
  );
}
