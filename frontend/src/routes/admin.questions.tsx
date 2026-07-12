import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { listQuestions, uploadQuestions, type IngestResult } from "@/lib/api";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/lib/auth";

/**
 * Admin — Question bank.
 *
 * This screen is deliberately utilitarian. No readiness ring, no amber
 * accent, no display serif in the primary content — plain data tables
 * and clear file affordances. It is a content-management tool, not part
 * of the student experience, and should visually feel that way.
 */
export const Route = createFileRoute("/admin/questions")({
  head: () => ({
    meta: [
      { title: "Question bank — Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <ProtectedRoute role="admin">
      <AdminShell>
        <QuestionsAdmin />
      </AdminShell>
    </ProtectedRoute>
  ),
});

function AdminShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="min-h-dvh bg-[color:var(--surface)] text-foreground">
      <header className="border-b border-hairline bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <div className="flex items-baseline gap-3">
            <span className="text-sm font-semibold text-primary">Tele-Exit</span>
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Admin</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{user?.email}</span>
            <button
              type="button"
              onClick={() => {
                logout();
                navigate({ to: "/login" });
              }}
              className="rounded border border-input px-2 py-1 text-primary hover:bg-secondary"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
    </div>
  );
}

function QuestionsAdmin() {
  const questions = useQuery({ queryKey: ["admin", "questions"], queryFn: listQuestions });

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<IngestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

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
    setUploading(true);
    try {
      const r = await uploadQuestions(file);
      setResult(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed — try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-xl font-semibold text-primary">Question bank</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload previous-year exit exam questions. Accepted formats: CSV, JSON.
        </p>
      </header>

      {/* Upload */}
      <section className="rounded-md border border-hairline bg-background">
        <div className="border-b border-hairline px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground">
          Upload questions
        </div>
        <div className="p-4">
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
              if (f) handleFile(f);
            }}
            className={
              "flex cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed px-6 py-10 text-center text-sm transition-colors " +
              (dragging
                ? "border-primary bg-secondary"
                : "border-hairline hover:border-primary/50")
            }
          >
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.json,application/json,text/csv"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <p className="text-primary">Drop a CSV or JSON file here, or click to choose</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Columns expected: topic, year, question, choices, answer
            </p>
            {fileName && (
              <p className="mt-3 text-xs text-muted-foreground">Selected: {fileName}</p>
            )}
          </label>

          {uploading && (
            <p className="mt-3 text-sm text-muted-foreground">Uploading and validating rows…</p>
          )}

          {error && (
            <p role="alert" className="mt-3 rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          {result && (
            <div className="mt-4 rounded border border-hairline bg-[color:var(--surface)] p-4 text-sm">
              <div className="flex flex-wrap gap-6">
                <Stat label="Ingested" value={result.ingested} tone="ok" />
                <Stat label="Skipped" value={result.skipped} tone={result.skipped > 0 ? "warn" : "muted"} />
                <Stat label="Errors" value={result.errors.length} tone={result.errors.length > 0 ? "err" : "muted"} />
              </div>
              {result.errors.length > 0 && (
                <div className="mt-4">
                  <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">Row errors</p>
                  <table className="w-full text-left text-xs">
                    <thead className="text-muted-foreground">
                      <tr className="border-b border-hairline">
                        <th className="py-1 pr-3 font-normal">Row</th>
                        <th className="py-1 font-normal">Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.errors.map((e, i) => (
                        <tr key={i} className="border-b border-hairline">
                          <td className="py-1 pr-3 tabular-nums">{e.row}</td>
                          <td className="py-1 text-destructive">{e.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Existing questions */}
      <section className="rounded-md border border-hairline bg-background">
        <div className="flex items-center justify-between border-b border-hairline px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground">
          <span>Questions</span>
          <span>{questions.data?.length ?? 0} rows</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted-foreground">
              <tr className="border-b border-hairline">
                <th className="w-40 py-2 px-4 font-normal">Topic</th>
                <th className="w-20 py-2 px-4 font-normal">Year</th>
                <th className="py-2 px-4 font-normal">Question</th>
              </tr>
            </thead>
            <tbody>
              {(questions.data ?? []).map((q) => (
                <tr key={q.id} className="border-b border-hairline align-top">
                  <td className="py-2 px-4 text-primary">{q.topic}</td>
                  <td className="py-2 px-4 tabular-nums text-muted-foreground">{q.year}</td>
                  <td className="py-2 px-4 text-foreground">
                    <span className="line-clamp-2">{q.question}</span>
                  </td>
                </tr>
              ))}
              {questions.data?.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-6 px-4 text-center text-sm text-muted-foreground">
                    No questions uploaded yet.
                  </td>
                </tr>
              )}
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
