/** Local coach presentation prefs (avatar + voice) for study calls. */

export type CoachAvatarId = "nova" | "atlas" | "sage" | "mira" | "leo";

export type CoachPrefs = {
  avatarId: CoachAvatarId;
  /** Exact SpeechSynthesisVoice.name, or "" for auto. */
  voiceName: string;
  /** 0.7 .. 1.2 */
  rate: number;
  /** 0.8 .. 1.2 */
  pitch: number;
  captionsLarge: boolean;
};

export type CoachAvatar = {
  id: CoachAvatarId;
  name: string;
  title: string;
  initials: string;
  /** CSS color for tile / ring */
  hue: string;
  blurb: string;
};

export const COACH_AVATARS: CoachAvatar[] = [
  {
    id: "nova",
    name: "Nova",
    title: "Exam coach",
    initials: "N",
    hue: "#c9852d",
    blurb: "Warm and encouraging — clear explanations, steady pace.",
  },
  {
    id: "atlas",
    name: "Atlas",
    title: "Strategy coach",
    initials: "A",
    hue: "#1b2a4a",
    blurb: "Focused and precise — great for step-by-step reasoning.",
  },
  {
    id: "sage",
    name: "Sage",
    title: "Concept coach",
    initials: "S",
    hue: "#5f7d68",
    blurb: "Calm and patient — helpful when a topic still feels fuzzy.",
  },
  {
    id: "mira",
    name: "Mira",
    title: "Practice partner",
    initials: "M",
    hue: "#8b4a3a",
    blurb: "Upbeat and conversational — keeps the study call moving.",
  },
  {
    id: "leo",
    name: "Leo",
    title: "Drill coach",
    initials: "L",
    hue: "#3d5a80",
    blurb: "Direct and crisp — good for timed review and drills.",
  },
];

const STORAGE_KEY = "tele-exit-coach-prefs";

const DEFAULTS: CoachPrefs = {
  avatarId: "nova",
  voiceName: "",
  rate: 0.95,
  pitch: 1.02,
  captionsLarge: true,
};

export function getCoachPrefs(): CoachPrefs {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<CoachPrefs>;
    const avatarOk = COACH_AVATARS.some((a) => a.id === parsed.avatarId);
    return {
      avatarId: avatarOk ? (parsed.avatarId as CoachAvatarId) : DEFAULTS.avatarId,
      voiceName: typeof parsed.voiceName === "string" ? parsed.voiceName : "",
      rate: clamp(Number(parsed.rate) || DEFAULTS.rate, 0.7, 1.25),
      pitch: clamp(Number(parsed.pitch) || DEFAULTS.pitch, 0.8, 1.25),
      captionsLarge: parsed.captionsLarge !== false,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveCoachPrefs(patch: Partial<CoachPrefs>): CoachPrefs {
  const next = { ...getCoachPrefs(), ...patch };
  next.rate = clamp(next.rate, 0.7, 1.25);
  next.pitch = clamp(next.pitch, 0.8, 1.25);
  if (!COACH_AVATARS.some((a) => a.id === next.avatarId)) next.avatarId = DEFAULTS.avatarId;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore quota
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("tele-exit-coach-prefs", { detail: next }));
  }
  return next;
}

export function getCoachAvatar(id?: CoachAvatarId): CoachAvatar {
  const prefs = id ? { avatarId: id } : getCoachPrefs();
  return COACH_AVATARS.find((a) => a.id === prefs.avatarId) || COACH_AVATARS[0];
}

export function listEnglishVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !window.speechSynthesis) return [];
  return window.speechSynthesis
    .getVoices()
    .filter((v) => v.lang.toLowerCase().startsWith("en"))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function resolveCoachVoice(prefs = getCoachPrefs()): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  if (prefs.voiceName) {
    const exact = voices.find((v) => v.name === prefs.voiceName);
    if (exact) return exact;
  }
  const avatar = getCoachAvatar(prefs.avatarId);
  // Soft bias by avatar — still falls back to quality English voices.
  const preferFemale = avatar.id === "nova" || avatar.id === "mira" || avatar.id === "sage";
  const preferMale = avatar.id === "atlas" || avatar.id === "leo";
  const english = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  const ranked = [...english].sort((a, b) => scoreVoice(b, preferFemale, preferMale) - scoreVoice(a, preferFemale, preferMale));
  return ranked[0] || voices[0] || null;
}

function scoreVoice(v: SpeechSynthesisVoice, preferFemale: boolean, preferMale: boolean): number {
  let s = 0;
  if (/Google|Natural|Neural|Premium|Enhanced/i.test(v.name)) s += 5;
  if (/en(-|_)?US/i.test(v.lang)) s += 2;
  if (/en(-|_)?GB/i.test(v.lang)) s += 1;
  const female = /female|samantha|karen|moira|zira|susan|hazel|victoria|aria|jenny/i.test(v.name);
  const male = /male|daniel|david|mark|george|fred|ryan|guy|tony/i.test(v.name);
  if (preferFemale && female) s += 3;
  if (preferMale && male) s += 3;
  if (preferFemale && male) s -= 1;
  if (preferMale && female) s -= 1;
  return s;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
