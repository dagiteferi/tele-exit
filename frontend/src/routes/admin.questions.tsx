import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import {
  listAdminExams,
  listQuestions,
  getAdminExamDetail,
  uploadExam,
  type ExamQuestion,
  type ExamSummary,
  type IngestResult,
  type QuestionRow,
} from "@/lib/api";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminShell } from "@/components/AdminShell";
import { ExamTopicPanel } from "@/components/ExamTopicPanel";

const FIELDS = [
  "Software Engineering",
  "Computer Science",
  "Electrical Engineering",
  "Mechanical Engineering",
  "Civil Engineering",
  "Medicine",
  "Nursing",
  "Pharmacy",
  "Accounting",
  "Economics",
  "Law",
  "Other",
];

export const Route = createFileRoute("/admin/questions")({
  head: () => ({
    meta: [{ title: "Exams — Admin" }, { name: "robots", content: "noindex" }],
  }),
  component: () => (
    <ProtectedRoute role="admin">
      <AdminShell>
        <ExamsAdmin />
      </AdminShell>
    </ProtectedRoute>
  ),
});

function ExamsAdmin() {
  const qc = useQueryClient();
  const exams = useQuery({ queryKey: ["admin", "exams"], queryFn: listAdminExams });
  const questions = useQuery({ queryKey: ["admin", "questions"], queryFn: listQuestions });

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<IngestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [fieldOfStudy, setFieldOfStudy] = useState(FIELDS[1]);
  const [year, setYear] = useState(String(new Date().getFullYear()));

  async function handleFile(file: File) {
    setError(null);
    setResult(null);
    setFileName(file.name);
    const ext = file.name.toLowerCase().split(".").pop();
    if (!["json"].includes(ext ?? "")) {
      setError("Only .json files are allowed.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("File must be smaller than 20MB.");
      return;
    }
    if (!fieldOfStudy.trim()) {
      setError("Choose a field of study / department.");
      return;
    }
    setUploading(true);
    try {
      const r = await uploadExam({
        file,
        title: title.trim() || file.name.replace(/\.[^.]+$/, ""),
        fieldOfStudy: fieldOfStudy.trim(),
        year: year ? Number(year) : undefined,
      });
      setResult(r);
      void qc.invalidateQueries({ queryKey: ["admin", "exams"] });
      void qc.invalidateQueries({ queryKey: ["admin", "questions"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed — try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-xl font-semibold text-primary">Exams & question bank</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload JSON exam banks scoped to a department. Students in that field will see them.
        </p>
      </header>

      <section className="rounded-md border border-hairline bg-background">
        <div className="border-b border-hairline px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground">
          Upload exam
        </div>
        <div className="space-y-4 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="CS Exit Exam 2024"
                className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Field / department</span>
              <select
                value={fieldOfStudy}
                onChange={(e) => setFieldOfStudy(e.target.value)}
                className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
              >
                {FIELDS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Year</span>
              <input
                value={year}
                onChange={(e) => setYear(e.target.value)}
                type="number"
                className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
          </div>

          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f) void handleFile(f);
            }}
            className={
              "flex cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed px-6 py-10 text-center text-sm transition-colors " +
              (dragging ? "border-primary bg-secondary" : "border-hairline hover:border-primary/50")
            }
          >
            <input
              ref={inputRef}
              type="file"
              accept=".json,application/json"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
            <p className="text-primary">Drop a JSON file here, or click to choose</p>
            <p className="mt-1 text-xs text-muted-foreground">
              JSON only. Accepts exit-exam banks with department + courses[].questions (options /
              correct_answer), or a flat questions array. Set Field to match student registration
              (e.g. Software Engineering).
            </p>
            {fileName && <p className="mt-3 text-xs text-muted-foreground">Selected: {fileName}</p>}
          </label>

          {uploading && <p className="text-sm text-muted-foreground">Uploading and embedding…</p>}
          {error && (
            <p
              role="alert"
              className="whitespace-pre-wrap rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          {result && (
            <div className="rounded border border-hairline bg-[color:var(--surface)] p-4 text-sm">
              <p className="mb-2 text-primary">
                Exam “{result.title}” · {result.fieldOfStudy}
                {result.questionCount != null ? ` · ${result.questionCount} checked` : ""}
              </p>
              <div className="flex flex-wrap gap-6">
                <Stat label="Ingested" value={result.ingested} tone="ok" />
                <Stat label="Skipped" value={result.skipped} tone={result.skipped > 0 ? "warn" : "muted"} />
                <Stat
                  label="Errors"
                  value={result.errors.length}
                  tone={result.errors.length > 0 ? "err" : "muted"}
                />
              </div>
              {(result.warnings?.length ?? 0) > 0 && (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-[var(--amber-strong)]">
                  {result.warnings!.slice(0, 8).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}
              {result.errors.length > 0 && (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-destructive">
                  {result.errors.map((e, i) => (
                    <li key={i}>{e.message}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-md border border-hairline bg-background">
        <div className="flex items-center justify-between border-b border-hairline px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground">
          <span>Exam library</span>
          <span>{exams.data?.length ?? 0} exams</span>
        </div>
        <div className="p-4">
          <ExamLibrary exams={exams.data ?? []} loading={exams.isLoading} />
        </div>
      </section>

      <section className="rounded-md border border-hairline bg-background">
        <div className="flex items-center justify-between border-b border-hairline px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground">
          <span>Browse by topic</span>
          <span>{questions.data?.length ?? 0} questions</span>
        </div>
        <div className="p-4">
          <TopicBrowser questions={questions.data ?? []} loading={questions.isLoading} />
        </div>
      </section>
    </div>
  );
}

function ExamLibrary({ exams, loading }: { exams: ExamSummary[]; loading: boolean }) {
  const [query, setQuery] = useState("");
  const [fieldFilter, setFieldFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const detail = useQuery({
    queryKey: ["admin", "exam", selectedId],
    queryFn: () => getAdminExamDetail(selectedId!),
    enabled: Boolean(selectedId),
  });

  const fields = useMemo(() => {
    const set = new Set(exams.map((e) => e.fieldOfStudy));
    return [...set].sort();
  }, [exams]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return exams.filter((e) => {
      if (fieldFilter !== "all" && e.fieldOfStudy !== fieldFilter) return false;
      if (!q) return true;
      return (
        e.title.toLowerCase().includes(q) ||
        e.fieldOfStudy.toLowerCase().includes(q) ||
        String(e.year ?? "").includes(q)
      );
    });
  }, [exams, query, fieldFilter]);

  if (loading) return <p className="text-sm text-muted-foreground">Loading exams…</p>;
  if (exams.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No exams uploaded yet.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search exams by title, field, year…"
          className="w-full flex-1 rounded border border-input bg-background px-3 py-2 text-sm"
        />
        <select
          value={fieldFilter}
          onChange={(e) => setFieldFilter(e.target.value)}
          className="rounded border border-input bg-background px-3 py-2 text-sm sm:w-56"
        >
          <option value="all">All fields ({exams.length})</option>
          {fields.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </div>

      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {exams.length} exams — click one to open details.
      </p>

      <div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((exam) => {
          const active = selectedId === exam.id;
          return (
            <button
              key={exam.id}
              type="button"
              onClick={() => setSelectedId(active ? null : exam.id)}
              className={
                "rounded-xl border px-3 py-3 text-left transition-colors " +
                (active
                  ? "border-primary bg-secondary"
                  : "border-hairline hover:border-primary/40 hover:bg-secondary/40")
              }
            >
              <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                {exam.fieldOfStudy}
                {exam.year ? ` · ${exam.year}` : ""}
              </p>
              <p className="mt-1 line-clamp-2 text-sm font-medium text-primary">{exam.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {exam.questionCount} question{exam.questionCount === 1 ? "" : "s"}
              </p>
            </button>
          );
        })}
      </div>

      {selectedId && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                {detail.data?.exam.fieldOfStudy}
                {detail.data?.exam.year ? ` · ${detail.data.exam.year}` : ""}
              </p>
              <p className="mt-1 text-lg font-medium text-primary">
                {detail.data?.exam.title ?? "Loading exam…"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="text-sm text-muted-foreground hover:text-primary"
            >
              Close
            </button>
          </div>

          {detail.isLoading && (
            <p className="text-sm text-muted-foreground">Loading questions…</p>
          )}
          {detail.isError && (
            <p className="text-sm text-destructive">
              {detail.error instanceof Error ? detail.error.message : "Failed to load exam"}
            </p>
          )}
          {detail.data && (
            <ExamTopicPanel questions={detail.data.questions} showAnswers />
          )}
        </div>
      )}
    </div>
  );
}

function TopicBrowser({
  questions,
  loading,
}: {
  questions: QuestionRow[];
  loading: boolean;
}) {
  const [selectedField, setSelectedField] = useState<string | null>(null);

  const fields = useMemo(() => {
    const map = new Map<string, number>();
    for (const q of questions) {
      const key = q.fieldOfStudy?.trim() || "Unassigned";
      map.set(key, (map.get(key) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [questions]);

  const mapped = useMemo(() => {
    const filtered = selectedField
      ? questions.filter((q) => (q.fieldOfStudy?.trim() || "Unassigned") === selectedField)
      : questions;
    return filtered.map(
      (q): ExamQuestion => ({
        id: q.id,
        topic: q.topic,
        year: q.year,
        questionText: q.question,
        choices: q.choices,
        fieldOfStudy: q.fieldOfStudy,
      }),
    );
  }, [questions, selectedField]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading questions…</p>;
  }

  if (questions.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">No questions uploaded yet.</p>
    );
  }

  return (
    <div className="space-y-4">
      {fields.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelectedField(null)}
            className={
              "rounded-md border px-3 py-1.5 text-sm " +
              (selectedField === null
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input hover:bg-secondary")
            }
          >
            All fields ({questions.length})
          </button>
          {fields.map(([field, count]) => (
            <button
              key={field}
              type="button"
              onClick={() => setSelectedField(field)}
              className={
                "rounded-md border px-3 py-1.5 text-sm " +
                (selectedField === field
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input hover:bg-secondary")
              }
            >
              {field} ({count})
            </button>
          ))}
        </div>
      )}
      <ExamTopicPanel questions={mapped} />
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "ok" | "warn" | "err" | "muted";
}) {
  const color =
    tone === "ok"
      ? "text-[var(--sage)]"
      : tone === "warn"
        ? "text-[var(--amber-strong)]"
        : tone === "err"
          ? "text-destructive"
          : "text-muted-foreground";
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={"mt-1 text-2xl tabular-nums " + color}>{value}</p>
    </div>
  );
}
