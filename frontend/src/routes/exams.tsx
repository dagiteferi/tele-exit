import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listMyExams } from "@/lib/api";
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

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl text-primary">Your exams</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Practice with answers and AI help, or take a timed-style exam. Showing exams for{" "}
          <span className="text-primary">{user?.fieldOfStudy || "your field"}</span>.
        </p>
      </header>

      {exams.isLoading && <p className="text-sm text-muted-foreground">Loading exams…</p>}
      {exams.isError && (
        <p className="text-sm text-destructive">
          {exams.error instanceof Error ? exams.error.message : "Could not load exams."}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {(exams.data ?? []).map((exam) => (
          <article
            key={exam.id}
            className="rounded-lg border border-hairline bg-background p-5 transition-colors hover:border-primary/40"
          >
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {exam.fieldOfStudy}
              {exam.year ? ` · ${exam.year}` : ""}
            </p>
            <h2 className="mt-1 text-lg font-medium text-primary">{exam.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {exam.questionCount} question{exam.questionCount === 1 ? "" : "s"}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                to="/exams/$examId"
                params={{ examId: exam.id }}
                search={{ mode: "practice" }}
                className="rounded-md border border-input px-3 py-2 text-sm text-primary hover:bg-secondary"
              >
                Practice mode
              </Link>
              <Link
                to="/exams/$examId"
                params={{ examId: exam.id }}
                search={{ mode: "exam" }}
                className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
              >
                Exam mode
              </Link>
            </div>
          </article>
        ))}
      </div>

      {!exams.isLoading && (exams.data?.length ?? 0) === 0 && (
        <p className="rounded-md border border-dashed border-hairline px-4 py-10 text-center text-sm text-muted-foreground">
          No exams for your department yet. Ask an admin to upload one.
        </p>
      )}
    </div>
  );
}
