import { useMemo, useState } from "react";
import type { ExamQuestion } from "@/lib/api";

/**
 * Clean two-pane exam browser: topic list + questions.
 * Answers stay hidden until the student clicks Show answer.
 */
export function ExamTopicPanel({
  questions,
  showAnswers = false,
  emptyLabel = "No questions in this exam.",
}: {
  questions: ExamQuestion[];
  showAnswers?: boolean;
  emptyLabel?: string;
}) {
  const [topicQuery, setTopicQuery] = useState("");
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [openAnswers, setOpenAnswers] = useState<Record<string, boolean>>({});

  const topics = useMemo(() => {
    const map = new Map<string, number>();
    for (const q of questions) {
      const t = q.topic?.trim() || "Untitled";
      map.set(t, (map.get(t) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [questions]);

  const filteredTopics = useMemo(() => {
    const q = topicQuery.trim().toLowerCase();
    if (!q) return topics;
    return topics.filter(([name]) => name.toLowerCase().includes(q));
  }, [topics, topicQuery]);

  const visibleQuestions = useMemo(() => {
    if (!selectedTopic) return questions;
    return questions.filter((item) => (item.topic?.trim() || "Untitled") === selectedTopic);
  }, [questions, selectedTopic]);

  if (questions.length === 0) {
    return <p className="px-1 py-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-hairline bg-background">
      <div className="grid md:grid-cols-[minmax(14rem,17rem)_1fr]">
        {/* Topics column */}
        <aside className="border-b border-hairline md:border-b-0 md:border-r">
          <div className="border-b border-hairline px-3 py-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Topics
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {topics.length} topics · {questions.length} questions
            </p>
            <input
              value={topicQuery}
              onChange={(e) => setTopicQuery(e.target.value)}
              placeholder="Filter topics…"
              className="mt-3 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="max-h-64 overflow-y-auto md:max-h-[28rem]">
            <button
              type="button"
              onClick={() => setSelectedTopic(null)}
              className={
                "flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm transition-colors " +
                (selectedTopic === null
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-secondary/70")
              }
            >
              <span className="font-medium">All topics</span>
              <span
                className={
                  "tabular-nums text-xs " +
                  (selectedTopic === null ? "text-primary-foreground/80" : "text-muted-foreground")
                }
              >
                {questions.length}
              </span>
            </button>

            {filteredTopics.map(([topic, count]) => {
              const active = selectedTopic === topic;
              return (
                <button
                  key={topic}
                  type="button"
                  onClick={() => setSelectedTopic(topic)}
                  className={
                    "flex w-full items-center justify-between gap-2 border-t border-hairline/80 px-3 py-2.5 text-left text-sm transition-colors " +
                    (active
                      ? "bg-secondary text-primary"
                      : "text-foreground hover:bg-secondary/50")
                  }
                >
                  <span className="line-clamp-2 leading-snug">{topic}</span>
                  <span className="shrink-0 tabular-nums text-xs text-muted-foreground">{count}</span>
                </button>
              );
            })}

            {filteredTopics.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">No matching topics</p>
            )}
          </div>
        </aside>

        {/* Questions column */}
        <div className="min-w-0">
          <div className="border-b border-hairline px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Questions
            </p>
            <p className="mt-0.5 text-sm text-primary">
              {selectedTopic ?? "All topics"}
              <span className="ml-2 text-muted-foreground">
                · {visibleQuestions.length} shown
              </span>
            </p>
          </div>

          <ul className="max-h-64 divide-y divide-hairline overflow-y-auto md:max-h-[28rem]">
            {visibleQuestions.map((q, i) => {
              const answerOpen = !!openAnswers[q.id];
              return (
                <li key={q.id} className="px-4 py-4">
                  <div className="flex items-baseline gap-2">
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {!selectedTopic && (
                      <span className="rounded bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        {q.topic}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                    {q.questionText}
                  </p>
                  {q.choices && q.choices.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {q.choices.map((c) => (
                        <li
                          key={c}
                          className="rounded-md border border-hairline/80 bg-[color:var(--surface)] px-3 py-1.5 text-sm text-muted-foreground"
                        >
                          {c}
                        </li>
                      ))}
                    </ul>
                  )}
                  {showAnswers && q.referenceAnswer && (
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() =>
                          setOpenAnswers((prev) => ({
                            ...prev,
                            [q.id]: !prev[q.id],
                          }))
                        }
                        className="text-sm font-medium text-primary underline underline-offset-4"
                      >
                        {answerOpen ? "Hide answer" : "Show answer"}
                      </button>
                      {answerOpen && (
                        <div className="mt-2 rounded-md bg-secondary/60 px-3 py-2 text-sm text-primary">
                          <p className="font-medium">{q.referenceAnswer}</p>
                          {q.explanation && (
                            <p className="mt-2 text-foreground whitespace-pre-wrap">{q.explanation}</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
