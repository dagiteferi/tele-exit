import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  acceptCalendarSuggestion,
  getMyCalendar,
  sendProgressReport,
} from "@/lib/api";
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

function groupByDay(
  events: {
    id: string;
    topic: string;
    scheduledAt: string;
    durationMinutes: number;
    status?: string;
  }[],
) {
  const map = new Map<string, typeof events>();
  for (const e of events) {
    const key = new Date(e.scheduledAt).toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    const arr = map.get(key) ?? [];
    arr.push(e);
    map.set(key, arr);
  }
  return [...map.entries()];
}

function CalendarPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["calendar"], queryFn: getMyCalendar });
  const [note, setNote] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});

  const accept = useMutation({
    mutationFn: (id: string) => acceptCalendarSuggestion(id),
    onSuccess: (event) => {
      setAccepted((prev) => ({ ...prev, [event.id]: true }));
      if (event.deliveryMode === "live") {
        setNote(
          event.deliveryDetail ||
            (event.htmlLink
              ? `Added “${event.topic}” to Google Calendar.`
              : `Invite for “${event.topic}” emailed — open it and tap Add to Calendar.`),
        );
      } else {
        setNote(
          `Accepted “${event.topic}” in Tele-Exit only. ${event.deliveryDetail || "Set SMTP_USER / SMTP_PASSWORD in backend/.env for real email."}`,
        );
      }
      void qc.invalidateQueries({ queryKey: ["calendar"] });
    },
    onError: (err: Error) => setNote(err.message),
  });

  const report = useMutation({
    mutationFn: () => sendProgressReport(),
    onSuccess: (res) => {
      setPreviewHtml(res.reportPreview || null);
      if (res.emailSent) {
        setNote(`Progress report emailed to ${res.emailTo}.`);
      } else {
        setNote(
          res.deliveryDetail ||
            (res.emailTo
              ? `Report ready for ${res.emailTo}, but email was not delivered (Gmail not connected). Preview below.`
              : "Report preview ready. Email delivery is not connected."),
        );
      }
      void qc.invalidateQueries({ queryKey: ["calendar"] });
    },
    onError: (err: Error) => setNote(err.message),
  });

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
      <p
        role="alert"
        className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
      >
        Couldn't load your calendar — try again in a moment.
      </p>
    );
  }

  const groups = groupByDay(q.data);

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Calendar</p>
          <h1 className="mt-2 font-display text-3xl text-primary">Upcoming practice sessions</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            AI suggestions from your study sessions. Accept to save them in Tele-Exit — and on Google
            Calendar when Google is connected.
          </p>
        </div>
        <button
          type="button"
          disabled={report.isPending}
          onClick={() => report.mutate()}
          className="rounded-lg border border-input px-4 py-2 text-sm text-primary hover:bg-secondary disabled:opacity-50"
        >
          {report.isPending ? "Preparing…" : "Send my report"}
        </button>
      </header>
      {note && (
        <p
          role="status"
          className="rounded-md border border-hairline bg-[var(--surface)] px-3 py-2 text-sm text-muted-foreground"
        >
          {note}
        </p>
      )}

      {previewHtml && (
        <section className="rounded-xl border border-hairline bg-card p-4 md:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg text-primary">Report preview</h2>
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => setPreviewHtml(null)}
            >
              Hide
            </button>
          </div>
          <div
            className="prose prose-sm max-h-[420px] max-w-none overflow-auto rounded-lg border border-hairline bg-background p-4 text-foreground"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        </section>
      )}

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing scheduled yet — end a study call or finish practice to get AI recommendations.
        </p>
      ) : (
        <div className="space-y-8">
          {groups.map(([day, items]) => (
            <section key={day}>
              <h2 className="eyebrow">{day}</h2>
              <ul className="mt-3 divide-y divide-[color:var(--hairline)] border-t border-b border-hairline">
                {items.map((e) => {
                  const done = accepted[e.id] || e.status === "accepted";
                  return (
                    <li key={e.id} className="flex items-center justify-between gap-4 py-4">
                      <div className="min-w-0">
                        <p className="truncate text-primary">{e.topic}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {new Date(e.scheduledAt).toLocaleTimeString(undefined, {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                          <span aria-hidden className="mx-1.5">
                            ·
                          </span>
                          {e.durationMinutes} min
                        </p>
                      </div>
                      {done ? (
                        <span className="rounded-full border border-hairline px-3 py-1 text-xs text-muted-foreground">
                          Accepted
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={accept.isPending}
                          onClick={() => accept.mutate(e.id)}
                          className="rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50"
                        >
                          Accept
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
