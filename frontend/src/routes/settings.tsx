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
            Coach presentation, voice clarity, reports, and your account profile.
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
            {previewing ? "Speaking…" : "Preview voice"}
          </button>
        </div>
      </header>

      {/* Summary strip */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Active coach"
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
        <SummaryCard label="Voice" value={voiceLabel} hint={`${prefs.rate.toFixed(2)}× · pitch ${prefs.pitch.toFixed(2)}`} />
        <SummaryCard
          label="Captions"
          value={prefs.captionsLarge ? "Large" : "Standard"}
          hint="Live text on study calls"
        />
        <SummaryCard
          label="Reports"
          value={freq ? freq.charAt(0).toUpperCase() + freq.slice(1) : "—"}
          hint="Email progress summary"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        {/* Coach presentation */}
        <Panel
          title="Study coach"
          subtitle="Who appears on shared calls and how they sound."
        >
          <div className="space-y-6">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Avatar
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
                          <span className="flex items-center gap-2">
                            <span className="font-medium text-primary">{a.name}</span>
                            <span className="text-xs text-muted-foreground">{a.title}</span>
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
                          {active && <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="border-t border-hairline pt-6">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Voice
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Uses your browser’s speech voices. Chrome typically offers the clearest options.
              </p>

              <label className="mt-4 block text-sm text-primary">
                <span className="text-xs text-muted-foreground">Selected voice</span>
                <select
                  className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
                  value={prefs.voiceName}
                  onChange={(e) => patchPrefs({ voiceName: e.target.value })}
                >
                  <option value="">Auto — match avatar</option>
                  {voices.map((v) => (
                    <option key={`${v.name}-${v.lang}`} value={v.name}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </select>
              </label>
              {voices.length === 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Loading voices… If this stays empty, try Chrome.
                </p>
              )}

              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <SliderField
                  label="Speaking speed"
                  value={prefs.rate}
                  min={0.75}
                  max={1.2}
                  display={`${prefs.rate.toFixed(2)}×`}
                  hint={prefs.rate < 0.9 ? "Clearer" : prefs.rate > 1.05 ? "Faster" : "Balanced"}
                  onChange={(n) => patchPrefs({ rate: n })}
                />
                <SliderField
                  label="Pitch"
                  value={prefs.pitch}
                  min={0.85}
                  max={1.2}
                  display={prefs.pitch.toFixed(2)}
                  hint={prefs.pitch < 0.95 ? "Deeper" : prefs.pitch > 1.08 ? "Brighter" : "Natural"}
                  onChange={(n) => patchPrefs({ pitch: n })}
                />
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={prefs.captionsLarge}
                onClick={() => patchPrefs({ captionsLarge: !prefs.captionsLarge })}
                className="mt-5 flex w-full items-center justify-between gap-4 rounded-lg border border-hairline px-4 py-3 text-left transition-colors hover:bg-[var(--surface)]"
              >
                <span>
                  <span className="block text-sm text-primary">Larger live captions</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Easier to read what you say during the call
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
              Study call tip
            </p>
            <h2 className="mt-2 font-display text-xl leading-snug">
              Preview before you join
            </h2>
            <p className="mt-2 text-sm text-primary-foreground/75">
              Use Preview voice after changing avatar or speed so the first line on your next call
              already sounds right.
            </p>
            <button
              type="button"
              onClick={previewVoice}
              disabled={previewing}
              className="mt-5 rounded-md bg-[var(--amber)] px-3.5 py-2 text-sm font-medium text-[var(--ink)] disabled:opacity-50"
            >
              {previewing ? "Speaking…" : "Hear sample"}
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
