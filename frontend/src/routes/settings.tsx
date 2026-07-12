import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { getMyProfile, updateSettings } from "@/lib/api";
import {
  COACH_AVATARS,
  getCoachAvatar,
  getCoachPrefs,
  listEnglishVoices,
  saveCoachPrefs,
  type CoachAvatarId,
  type CoachPrefs,
} from "@/lib/coachPrefs";
import { speakNow, warmVoices } from "@/lib/speech";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { StudentShell } from "@/components/StudentShell";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Tele-Exit" },
      {
        name: "description",
        content: "Manage coach presentation, voice clarity, and account preferences.",
      },
    ],
  }),
  component: () => (
    <ProtectedRoute role="student">
      <StudentShell>
        <SettingsPage />
      </StudentShell>
    </ProtectedRoute>
  ),
});

function SettingsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["profile"], queryFn: getMyProfile });
  const [saving, setSaving] = useState<"weekly" | "monthly" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [prefs, setPrefs] = useState<CoachPrefs>(() => getCoachPrefs());
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    warmVoices();
    const load = () => setVoices(listEnglishVoices());
    load();
    window.speechSynthesis?.addEventListener("voiceschanged", load);
    const onPrefs = (e: Event) => {
      const detail = (e as CustomEvent<CoachPrefs>).detail;
      if (detail) setPrefs(detail);
    };
    window.addEventListener("tele-exit-coach-prefs", onPrefs);
    return () => {
      window.speechSynthesis?.removeEventListener("voiceschanged", load);
      window.removeEventListener("tele-exit-coach-prefs", onPrefs);
    };
  }, []);

  const avatar = useMemo(() => getCoachAvatar(prefs.avatarId), [prefs.avatarId]);
  const voiceLabel = prefs.voiceName
    ? prefs.voiceName.replace(/\s*\(.*\)\s*$/, "").slice(0, 28)
    : "Auto";
  const freq = q.data?.reportFrequency;

  function patchPrefs(patch: Partial<CoachPrefs>) {
    const next = saveCoachPrefs(patch);
    setPrefs(next);
    flashSaved();
  }

  function flashSaved() {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1400);
  }

  function previewVoice() {
    setPreviewing(true);
    const line = `Hi, I'm ${avatar.name}, your ${avatar.title}. Let's make your next study call clear and calm.`;
    speakNow(line, { onEnd: () => setPreviewing(false) });
  }

  async function setFrequency(next: "weekly" | "monthly") {
    if (!q.data) return;
    setError(null);
    setSaving(next);
    try {
      await updateSettings({ reportFrequency: next });
      qc.setQueryData(["profile"], { ...q.data, reportFrequency: next });
      flashSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that change — try again.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-8 md:space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-hairline pb-6">
        <div>
          <p className="eyebrow">Settings</p>
          <h1 className="mt-1 font-display text-3xl tracking-tight text-primary md:text-4xl">
            Preferences
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Change the AI coach’s look and speaking voice, then manage reports and your account.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {saved && (
            <p role="status" className="rounded-md border border-[var(--sage)]/30 bg-[var(--sage)]/10 px-3 py-2 text-sm text-[var(--sage)]">
              Saved
            </p>
          )}
          <Link
            to="/dashboard"
            className="rounded-md border border-input px-3.5 py-2 text-sm text-primary transition-colors hover:bg-secondary"
          >
            Dashboard
          </Link>
          <button
            type="button"
            onClick={previewVoice}
            disabled={previewing}
            className="rounded-md bg-primary px-3.5 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {previewing ? "Speaking…" : "Hear AI voice"}
          </button>
        </div>
      </header>

      {/* Summary strip */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="AI avatar"
          value={avatar.name}
          hint={avatar.title}
          leading={
            <span
              className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-semibold text-white"
              style={{ background: avatar.hue }}
            >
              {avatar.initials}
            </span>
          }
        />
        <SummaryCard
          label="AI voice"
          value={voiceLabel}
          hint={`${prefs.rate.toFixed(2)}× speed · pitch ${prefs.pitch.toFixed(2)}`}
        />
        <SummaryCard
          label="Your captions"
          value={prefs.captionsLarge ? "Large" : "Standard"}
          hint="Text size on the study call"
        />
        <SummaryCard
          label="Email reports"
          value={freq ? freq.charAt(0).toUpperCase() + freq.slice(1) : "—"}
          hint="Practice summary cadence"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        {/* Coach presentation */}
        <Panel
          title="Change AI coach"
          subtitle="These settings control the AI on your study call — how it looks, how it talks, and how captions appear."
        >
          <div className="space-y-8">
            <div className="rounded-lg border border-hairline bg-[var(--surface)] px-4 py-3 text-sm text-muted-foreground">
              <p className="font-medium text-primary">How this works</p>
              <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs leading-relaxed">
                <li>
                  Pick an <strong className="font-medium text-primary">AI avatar</strong> — the name
                  and tile you see beside you on the call.
                </li>
                <li>
                  Change the <strong className="font-medium text-primary">AI voice</strong> — who
                  speaks when the coach explains a question.
                </li>
                <li>
                  Tap <strong className="font-medium text-primary">Preview voice</strong> to hear it,
                  then join a study call anytime.
                </li>
              </ol>
            </div>

            {/* Step 1 — Avatar */}
            <div>
              <div className="flex items-baseline gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                  1
                </span>
                <div>
                  <p className="text-sm font-medium text-primary">Choose AI avatar</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    This is only the look and name of the coach — not the exam answers.
                  </p>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Now using: <span className="font-medium text-primary">{avatar.name}</span> (
                {avatar.title})
              </p>
              <ul className="mt-3 divide-y divide-hairline rounded-lg border border-hairline">
                {COACH_AVATARS.map((a) => {
                  const active = prefs.avatarId === a.id;
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => patchPrefs({ avatarId: a.id as CoachAvatarId })}
                        className={
                          "flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors " +
                          (active ? "bg-primary/[0.04]" : "hover:bg-[var(--surface)]")
                        }
                      >
                        <span
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold text-white"
                          style={{ background: a.hue }}
                        >
                          {a.initials}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-primary">{a.name}</span>
                            <span className="text-xs text-muted-foreground">{a.title}</span>
                            {active && (
                              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                                Selected
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                            {a.blurb}
                          </span>
                        </span>
                        <span
                          className={
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border " +
                            (active
                              ? "border-primary bg-primary"
                              : "border-input bg-background")
                          }
                          aria-hidden
                        >
                          {active && (
                            <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Step 2 — Voice */}
            <div className="border-t border-hairline pt-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-baseline gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                    2
                  </span>
                  <div>
                    <p className="text-sm font-medium text-primary">Change AI speaking voice</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      This is the voice you hear when the AI coach talks out loud.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={previewVoice}
                  disabled={previewing}
                  className="rounded-md border border-input px-3 py-1.5 text-xs text-primary transition-colors hover:bg-secondary disabled:opacity-50"
                >
                  {previewing ? "Speaking…" : "Hear AI voice"}
                </button>
              </div>

              <label className="mt-4 block text-sm text-primary">
                <span className="text-xs text-muted-foreground">AI voice</span>
                <select
                  className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
                  value={prefs.voiceName}
                  onChange={(e) => patchPrefs({ voiceName: e.target.value })}
                >
                  <option value="">Auto — pick a voice that fits {avatar.name}</option>
                  {voices.map((v) => (
                    <option key={`${v.name}-${v.lang}`} value={v.name}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </select>
              </label>
              {voices.length === 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Loading voices… If this stays empty, open Settings in Chrome.
                </p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Voices come from your browser. Changing this only affects how the AI speaks — not
                your microphone.
              </p>

              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <SliderField
                  label="How fast the AI speaks"
                  value={prefs.rate}
                  min={0.75}
                  max={1.2}
                  display={`${prefs.rate.toFixed(2)}×`}
                  hint={
                    prefs.rate < 0.9
                      ? "Slower — easier to follow"
                      : prefs.rate > 1.05
                        ? "Faster — quicker explanations"
                        : "Balanced pace"
                  }
                  onChange={(n) => patchPrefs({ rate: n })}
                />
                <SliderField
                  label="AI voice pitch"
                  value={prefs.pitch}
                  min={0.85}
                  max={1.2}
                  display={prefs.pitch.toFixed(2)}
                  hint={
                    prefs.pitch < 0.95
                      ? "Deeper tone"
                      : prefs.pitch > 1.08
                        ? "Brighter tone"
                        : "Natural tone"
                  }
                  onChange={(n) => patchPrefs({ pitch: n })}
                />
              </div>
            </div>

            {/* Step 3 — Captions */}
            <div className="border-t border-hairline pt-6">
              <div className="flex items-baseline gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                  3
                </span>
                <div>
                  <p className="text-sm font-medium text-primary">Call captions</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Size of the live text that shows what you say on the study call.
                  </p>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={prefs.captionsLarge}
                onClick={() => patchPrefs({ captionsLarge: !prefs.captionsLarge })}
                className="mt-4 flex w-full items-center justify-between gap-4 rounded-lg border border-hairline px-4 py-3 text-left transition-colors hover:bg-[var(--surface)]"
              >
                <span>
                  <span className="block text-sm text-primary">Use larger captions</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Turn on if the caption bar at the bottom of the call is hard to read
                  </span>
                </span>
                <span
                  className={
                    "relative h-6 w-11 shrink-0 rounded-full transition-colors " +
                    (prefs.captionsLarge ? "bg-primary" : "bg-hairline")
                  }
                >
                  <span
                    className={
                      "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform " +
                      (prefs.captionsLarge ? "left-[1.35rem]" : "left-0.5")
                    }
                  />
                </span>
              </button>
            </div>
          </div>
        </Panel>

        {/* Side column */}
        <div className="space-y-4">
          <Panel title="Progress reports" subtitle="Email cadence for practice summaries.">
            <div
              role="radiogroup"
              aria-label="Report frequency"
              className="grid grid-cols-2 gap-2"
            >
              {(["weekly", "monthly"] as const).map((f) => {
                const active = freq === f;
                return (
                  <button
                    key={f}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={saving !== null || q.isLoading}
                    onClick={() => setFrequency(f)}
                    className={
                      "rounded-md border px-3 py-3 text-sm capitalize transition-colors disabled:opacity-50 " +
                      (active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input text-primary hover:bg-secondary")
                    }
                  >
                    {saving === f ? "Saving…" : f}
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Reports include recent sessions, coverage, and focus topics. You can also send one
              anytime from Progress.
            </p>
            {error && (
              <p role="alert" className="mt-3 text-xs text-destructive">
                {error}
              </p>
            )}
          </Panel>

          <Panel title="Account" subtitle="Profile details used across Tele-Exit.">
            {q.isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-8 animate-pulse rounded bg-hairline/60" />
                ))}
              </div>
            ) : (
              <dl className="divide-y divide-hairline">
                <AccountRow label="Name" value={user?.name ?? "—"} />
                <AccountRow label="Email" value={user?.email ?? "—"} />
                <AccountRow label="Field of study" value={q.data?.fieldOfStudy ?? "—"} />
                <AccountRow
                  label="Exam date"
                  value={
                    q.data?.examDate
                      ? new Date(q.data.examDate).toLocaleDateString(undefined, {
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "—"
                  }
                />
              </dl>
            )}
          </Panel>

          <article className="rounded-xl border border-hairline bg-primary p-5 text-primary-foreground">
            <p className="text-xs uppercase tracking-wider text-primary-foreground/65">
              Try it
            </p>
            <h2 className="mt-2 font-display text-xl leading-snug">
              Hear your AI coach
            </h2>
            <p className="mt-2 text-sm text-primary-foreground/75">
              After you change avatar or voice, tap below. That same voice will speak on your next
              study call.
            </p>
            <button
              type="button"
              onClick={previewVoice}
              disabled={previewing}
              className="mt-5 rounded-md bg-[var(--amber)] px-3.5 py-2 text-sm font-medium text-[var(--ink)] disabled:opacity-50"
            >
              {previewing ? "Speaking…" : "Hear AI voice"}
            </button>
          </article>
        </div>
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  leading,
}: {
  label: string;
  value: string;
  hint: string;
  leading?: ReactNode;
}) {
  return (
    <article className="flex items-center gap-3 rounded-xl border border-hairline bg-[var(--surface)] px-4 py-4">
      {leading}
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-0.5 truncate font-display text-xl text-primary">{value}</p>
        <p className="truncate text-xs text-muted-foreground">{hint}</p>
      </div>
    </article>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <article className="rounded-xl border border-hairline bg-card p-5 md:p-6">
      <div className="border-b border-hairline pb-4">
        <h2 className="font-display text-xl text-primary">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <div className="mt-5">{children}</div>
    </article>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  display,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  display: string;
  hint: string;
  onChange: (n: number) => void;
}) {
  return (
    <label className="block text-sm text-primary">
      <span className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="tabular-nums text-xs text-primary">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-3 w-full accent-[var(--amber-strong)]"
      />
      <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>
    </label>
  );
}

function AccountRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 text-sm first:pt-0 last:pb-0">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-right text-primary">{value}</dd>
    </div>
  );
}
