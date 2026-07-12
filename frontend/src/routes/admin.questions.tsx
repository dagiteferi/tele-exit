import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import {
  listAdminExams,
  listQuestions,
  uploadExam,
  type IngestResult,
} from "@/lib/api";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminShell } from "@/components/AdminShell";

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
    if (!["csv", "json"].includes(ext ?? "")) {
      setError("File must be .csv or .json.");
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
          Upload JSON/CSV exams scoped to a department. Students in that field will see them.
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
              accept=".csv,.json,application/json,text/csv"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
            <p className="text-primary">Drop a CSV or JSON file here, or click to choose</p>
            <p className="mt-1 text-xs text-muted-foreground">
              JSON: array of questions, or {"{ title, field_of_study, questions: [...] }"}. Fields: topic,
              year, question, answer, choices (optional).
            </p>
            {fileName && <p className="mt-3 text-xs text-muted-foreground">Selected: {fileName}</p>}
          </label>

          {uploading && <p className="text-sm text-muted-foreground">Uploading and embedding…</p>}
          {error && (
            <p role="alert" className="rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          {result && (
            <div className="rounded border border-hairline bg-[color:var(--surface)] p-4 text-sm">
              <p className="mb-2 text-primary">
                Exam “{result.title}” · {result.fieldOfStudy}
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
          <span>Exams by department</span>
          <span>{exams.data?.length ?? 0}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted-foreground">
              <tr className="border-b border-hairline">
                <th className="px-4 py-2 font-normal">Title</th>
                <th className="px-4 py-2 font-normal">Field</th>
                <th className="px-4 py-2 font-normal">Year</th>
                <th className="px-4 py-2 font-normal">Questions</th>
              </tr>
            </thead>
            <tbody>
              {(exams.data ?? []).map((e) => (
                <tr key={e.id} className="border-b border-hairline">
                  <td className="px-4 py-2 text-primary">{e.title}</td>
                  <td className="px-4 py-2">{e.fieldOfStudy}</td>
                  <td className="px-4 py-2 tabular-nums text-muted-foreground">{e.year ?? "—"}</td>
                  <td className="px-4 py-2 tabular-nums">{e.questionCount}</td>
                </tr>
              ))}
              {exams.data?.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                    No exams uploaded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-md border border-hairline bg-background">
        <div className="flex items-center justify-between border-b border-hairline px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground">
          <span>Questions</span>
          <span>{questions.data?.length ?? 0} rows</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted-foreground">
              <tr className="border-b border-hairline">
                <th className="w-36 px-4 py-2 font-normal">Field</th>
                <th className="w-36 px-4 py-2 font-normal">Topic</th>
                <th className="w-20 px-4 py-2 font-normal">Year</th>
                <th className="px-4 py-2 font-normal">Question</th>
              </tr>
            </thead>
            <tbody>
              {(questions.data ?? []).map((q) => (
                <tr key={q.id} className="border-b border-hairline align-top">
                  <td className="px-4 py-2 text-muted-foreground">{q.fieldOfStudy || "—"}</td>
                  <td className="px-4 py-2 text-primary">{q.topic}</td>
                  <td className="px-4 py-2 tabular-nums text-muted-foreground">{q.year}</td>
                  <td className="px-4 py-2">
                    <span className="line-clamp-2">{q.question}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
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
