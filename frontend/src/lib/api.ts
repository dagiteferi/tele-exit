/**
 * Tele-Exit API client.
 *
 * Auth (register / login / me) talks to the real backend.
 * Other student/admin endpoints remain mocked until wired.
 *
 * Token is sent as `Authorization: Bearer <token>` only — never in URLs
 * or logs. Prefer the Vite `/api` proxy in local dev (same-origin).
 */

import type { Role, User } from "./auth";
import { getStoredToken } from "./auth-storage";

// -- helpers -----------------------------------------------------------------

/** Base URL: `VITE_API_URL` or same-origin `/api` (Vite proxy → backend). */
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") || "/api";

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

export function authHeader(token?: string | null): Record<string, string> {
  const t = token ?? getStoredToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const data = await res.json();
    const detail = data?.detail;
    if (typeof detail === "string") return detail;
    if (detail && typeof detail === "object" && !Array.isArray(detail)) {
      const message = typeof detail.message === "string" ? detail.message : "Upload rejected";
      const errors = Array.isArray(detail.errors) ? detail.errors.filter((e: unknown) => typeof e === "string") : [];
      if (errors.length) {
        const shown = errors.slice(0, 12).join("\n• ");
        const more = errors.length > 12 ? `\n…and ${errors.length - 12} more` : "";
        return `${message}\n• ${shown}${more}`;
      }
      return message;
    }
    if (Array.isArray(detail)) {
      return detail
        .map((d: { msg?: string }) => d?.msg)
        .filter(Boolean)
        .join(". ") || res.statusText;
    }
    if (typeof data?.message === "string") return data.message;
  } catch {
    // ignore non-JSON bodies
  }
  if (res.status === 401) return "Invalid email or password";
  if (res.status === 409) return "Email already registered";
  if (res.status >= 500) return "Server error — please try again shortly";
  return res.statusText || "Request failed";
}

async function apiFetch<T>(
  path: string,
  init: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const { token, headers, ...rest } = init;
  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: {
      Accept: "application/json",
      ...(rest.body ? { "Content-Type": "application/json" } : {}),
      ...authHeader(token),
      ...(headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    throw new ApiError(res.status, await parseErrorMessage(res));
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

interface MePayload {
  student_id: string;
  name: string;
  email: string;
  role: Role;
  field_of_study?: string | null;
  exam_date?: string | null;
}

function userFromMe(me: MePayload): User {
  return {
    id: me.student_id,
    name: me.name,
    email: me.email,
    role: me.role === "admin" ? "admin" : "student",
    fieldOfStudy: me.field_of_study ?? undefined,
    examDate: me.exam_date ?? undefined,
  };
}

/** Validate a JWT and return the current user (GET /auth/me). */
export async function fetchMe(token: string): Promise<User> {
  const me = await apiFetch<MePayload>("/auth/me", { method: "GET", token });
  return userFromMe(me);
}

// -- domain types ------------------------------------------------------------

export interface TopicScore {
  topic: string;
  attempted: number;
  correct: number;
  accuracy: number; // 0..1
}

export interface Session {
  id: string;
  topic: string;
  date: string; // ISO
  correct: number;
  attempted: number;
}

export interface CalendarEvent {
  id: string;
  topic: string;
  scheduledAt: string; // ISO
  durationMinutes: number;
}

export interface StudentProfile {
  user: User;
  examDate: string;
  fieldOfStudy: string;
  readiness: number; // 0..1
  topicScores: Record<string, TopicScore>;
  weakTopics: string[]; // topic keys, weakest first
  recentSessions: Session[];
  reportFrequency: "weekly" | "monthly";
}

// -- mock data ---------------------------------------------------------------

const MOCK_PROFILE: StudentProfile = {
  user: {
    id: "stu_1",
    name: "Hanna Bekele",
    email: "hanna@example.et",
    role: "student",
    fieldOfStudy: "Software Engineering",
    examDate: new Date(Date.now() + 43 * 864e5).toISOString(),
  },
  examDate: new Date(Date.now() + 43 * 864e5).toISOString(),
  fieldOfStudy: "Software Engineering",
  readiness: 0.72,
  topicScores: {
    "Data structures": { topic: "Data structures", attempted: 48, correct: 28, accuracy: 0.58 },
    "OS scheduling":    { topic: "OS scheduling",    attempted: 33, correct: 20, accuracy: 0.61 },
    "Networking":       { topic: "Networking",       attempted: 41, correct: 26, accuracy: 0.64 },
    "Databases":        { topic: "Databases",        attempted: 52, correct: 40, accuracy: 0.77 },
    "Algorithms":       { topic: "Algorithms",       attempted: 60, correct: 47, accuracy: 0.78 },
    "Software design":  { topic: "Software design",  attempted: 29, correct: 24, accuracy: 0.83 },
  },
  weakTopics: ["Data structures", "OS scheduling", "Networking"],
  recentSessions: [
    { id: "s1", topic: "Databases · Normalization", date: new Date(Date.now() - 1 * 864e5).toISOString(), correct: 8, attempted: 10 },
    { id: "s2", topic: "OS · Deadlocks",            date: new Date(Date.now() - 4 * 864e5).toISOString(), correct: 5, attempted: 9 },
    { id: "s3", topic: "Algorithms · DP intro",     date: new Date(Date.now() - 7 * 864e5).toISOString(), correct: 7, attempted: 10 },
  ],
  reportFrequency: "weekly",
};

const MOCK_CALENDAR: CalendarEvent[] = [
  { id: "e1", topic: "Algorithms · Dynamic programming", scheduledAt: new Date(Date.now() + 2 * 864e5).toISOString(), durationMinutes: 45 },
  { id: "e2", topic: "Databases · Query planning",       scheduledAt: new Date(Date.now() + 4 * 864e5).toISOString(), durationMinutes: 30 },
  { id: "e3", topic: "Networking · Transport layer",     scheduledAt: new Date(Date.now() + 6 * 864e5).toISOString(), durationMinutes: 45 },
  { id: "e4", topic: "OS · Memory management",           scheduledAt: new Date(Date.now() + 9 * 864e5).toISOString(), durationMinutes: 30 },
  { id: "e5", topic: "Data structures · Trees",          scheduledAt: new Date(Date.now() + 12 * 864e5).toISOString(), durationMinutes: 45 },
];

// -- endpoints (mocked) ------------------------------------------------------

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  fieldOfStudy: string;
  examDate: string;
  reportFrequency: "weekly" | "monthly";
}

export async function registerStudent(input: RegisterInput): Promise<{ user: User; token: string }> {
  const data = await apiFetch<{ student_id: string; access_token: string }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      name: input.name,
      field_of_study: input.fieldOfStudy,
      exam_date: input.examDate,
      report_frequency: input.reportFrequency,
    }),
  });
  const user = await fetchMe(data.access_token);
  return { user, token: data.access_token };
}

export async function loginStudent(email: string, password: string): Promise<{ user: User; token: string }> {
  const data = await apiFetch<{ access_token: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  const user = await fetchMe(data.access_token);
  return { user, token: data.access_token };
}

export async function getMyProfile(): Promise<StudentProfile> {
  await sleep(350);
  // TODO backend: GET /students/me/profile
  return MOCK_PROFILE;
}

export async function getMyCalendar(): Promise<CalendarEvent[]> {
  await sleep(300);
  // TODO backend: GET /students/me/calendar
  return MOCK_CALENDAR;
}

export async function updateSettings(input: { reportFrequency: "weekly" | "monthly" }) {
  await sleep(300);
  // TODO backend: PATCH /students/me/settings
  MOCK_PROFILE.reportFrequency = input.reportFrequency;
  return { ok: true };
}

// -- admin -------------------------------------------------------------------

export interface QuestionRow {
  id: string;
  topic: string;
  year: number;
  question: string;
  fieldOfStudy?: string | null;
  examId?: string | null;
  choices?: string[] | null;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  fieldOfStudy?: string | null;
  examDate?: string | null;
  createdAt?: string | null;
}

export interface ExamSummary {
  id: string;
  title: string;
  fieldOfStudy: string;
  year?: number | null;
  description?: string | null;
  questionCount: number;
  createdAt?: string | null;
}

export interface ExamQuestion {
  id: string;
  topic: string;
  year: number;
  questionText: string;
  choices?: string[] | null;
  referenceAnswer?: string | null;
  fieldOfStudy?: string | null;
}

export type ExamMode = "practice" | "exam";

export interface IngestResult {
  examId?: string;
  title?: string;
  fieldOfStudy?: string;
  ingested: number;
  skipped: number;
  errors: { row: number; message: string }[];
  warnings?: string[];
  questionCount?: number;
}

function mapExam(e: {
  id: string;
  title: string;
  field_of_study: string;
  year?: number | null;
  description?: string | null;
  question_count?: number;
  created_at?: string | null;
}): ExamSummary {
  return {
    id: e.id,
    title: e.title,
    fieldOfStudy: e.field_of_study,
    year: e.year,
    description: e.description,
    questionCount: e.question_count ?? 0,
    createdAt: e.created_at,
  };
}

function mapQuestion(q: {
  id: string;
  topic: string;
  year: number;
  question_text: string;
  choices?: string[] | null;
  reference_answer?: string | null;
  field_of_study?: string | null;
}): ExamQuestion {
  return {
    id: q.id,
    topic: q.topic,
    year: q.year,
    questionText: q.question_text,
    choices: q.choices,
    referenceAnswer: q.reference_answer,
    fieldOfStudy: q.field_of_study,
  };
}

export async function listAdminUsers(): Promise<AdminUser[]> {
  const rows = await apiFetch<
    {
      id: string;
      email: string;
      name: string;
      role: Role;
      field_of_study?: string | null;
      exam_date?: string | null;
      created_at?: string | null;
    }[]
  >("/admin/users");
  return rows.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    fieldOfStudy: u.field_of_study,
    examDate: u.exam_date,
    createdAt: u.created_at,
  }));
}

export async function inviteAdmin(input: {
  email: string;
  name: string;
  password: string;
}): Promise<AdminUser> {
  const u = await apiFetch<{ id: string; email: string; name: string; role: Role }>(
    "/admin/invite",
    { method: "POST", body: JSON.stringify(input) },
  );
  return { id: u.id, email: u.email, name: u.name, role: u.role };
}

export async function listAdminExams(): Promise<ExamSummary[]> {
  const rows = await apiFetch<
    {
      id: string;
      title: string;
      field_of_study: string;
      year?: number | null;
      description?: string | null;
      question_count: number;
      created_at?: string | null;
    }[]
  >("/admin/exams");
  return rows.map(mapExam);
}

export async function getAdminExamDetail(examId: string): Promise<{
  exam: ExamSummary;
  questions: ExamQuestion[];
}> {
  const data = await apiFetch<{
    exam: {
      id: string;
      title: string;
      field_of_study: string;
      year?: number | null;
      description?: string | null;
      question_count: number;
      created_at?: string | null;
    };
    questions: {
      id: string;
      topic: string;
      year: number;
      question_text: string;
      choices?: string[] | null;
      reference_answer?: string | null;
      field_of_study?: string | null;
    }[];
  }>(`/admin/exams/${examId}`);
  return {
    exam: mapExam(data.exam),
    questions: data.questions.map(mapQuestion),
  };
}

export async function listQuestions(): Promise<QuestionRow[]> {
  const rows = await apiFetch<
    {
      id: string;
      topic: string;
      year: number;
      question: string;
      field_of_study?: string | null;
      exam_id?: string | null;
      choices?: string[] | null;
    }[]
  >("/admin/questions");
  return rows.map((q) => ({
    id: q.id,
    topic: q.topic,
    year: q.year,
    question: q.question,
    fieldOfStudy: q.field_of_study,
    examId: q.exam_id,
    choices: q.choices,
  }));
}

export async function uploadExam(input: {
  file: File;
  title: string;
  fieldOfStudy: string;
  year?: number;
}): Promise<IngestResult> {
  const form = new FormData();
  form.append("file", input.file);
  form.append("title", input.title);
  form.append("field_of_study", input.fieldOfStudy);
  if (input.year != null) form.append("year", String(input.year));

  const res = await fetch(`${API_BASE}/admin/exams/upload`, {
    method: "POST",
    headers: { ...authHeader(), Accept: "application/json" },
    body: form,
  });
  if (!res.ok) throw new ApiError(res.status, await parseErrorMessage(res));
  const data = (await res.json()) as {
    exam_id: string;
    title: string;
    field_of_study: string;
    ingested: number;
    skipped: number;
    errors: string[];
    warnings?: string[];
    question_count?: number;
  };
  return {
    examId: data.exam_id,
    title: data.title,
    fieldOfStudy: data.field_of_study,
    ingested: data.ingested,
    skipped: data.skipped,
    errors: (data.errors || []).map((message, i) => ({ row: i + 1, message })),
    warnings: data.warnings || [],
    questionCount: data.question_count,
  };
}

/** @deprecated Prefer uploadExam with field_of_study */
export async function uploadQuestions(
  file: File,
  meta?: { title?: string; fieldOfStudy?: string; year?: number },
): Promise<IngestResult> {
  return uploadExam({
    file,
    title: meta?.title || file.name.replace(/\.[^.]+$/, ""),
    fieldOfStudy: meta?.fieldOfStudy || "General",
    year: meta?.year,
  });
}

// -- student exams -----------------------------------------------------------

export async function listMyExams(): Promise<ExamSummary[]> {
  const rows = await apiFetch<
    {
      id: string;
      title: string;
      field_of_study: string;
      year?: number | null;
      description?: string | null;
      question_count: number;
      created_at?: string | null;
    }[]
  >("/exams");
  return rows.map(mapExam);
}

export async function getExam(
  examId: string,
  mode: ExamMode,
): Promise<{ exam: ExamSummary; questions: ExamQuestion[]; mode: ExamMode }> {
  const data = await apiFetch<{
    exam: {
      id: string;
      title: string;
      field_of_study: string;
      year?: number | null;
      description?: string | null;
      question_count: number;
      created_at?: string | null;
    };
    questions: {
      id: string;
      topic: string;
      year: number;
      question_text: string;
      choices?: string[] | null;
      reference_answer?: string | null;
      field_of_study?: string | null;
    }[];
    mode: ExamMode;
  }>(`/exams/${examId}?mode=${mode}`);
  return {
    exam: mapExam(data.exam),
    questions: data.questions.map(mapQuestion),
    mode: data.mode,
  };
}

export async function startExamAttempt(
  examId: string,
  mode: ExamMode,
): Promise<{ attemptId: string; examId: string; mode: ExamMode; questions: ExamQuestion[] }> {
  const data = await apiFetch<{
    attempt_id: string;
    exam_id: string;
    mode: ExamMode;
    questions: {
      id: string;
      topic: string;
      year: number;
      question_text: string;
      choices?: string[] | null;
      reference_answer?: string | null;
      field_of_study?: string | null;
    }[];
  }>(`/exams/${examId}/attempts`, {
    method: "POST",
    body: JSON.stringify({ mode }),
  });
  return {
    attemptId: data.attempt_id,
    examId: data.exam_id,
    mode: data.mode,
    questions: data.questions.map(mapQuestion),
  };
}

export async function submitExamAttempt(
  attemptId: string,
  answers: { questionId: string; answer: string }[],
): Promise<{
  attemptId: string;
  mode: ExamMode;
  scoreCorrect: number;
  scoreTotal: number;
  percent: number;
  results: {
    questionId: string;
    topic: string;
    correct: boolean;
    yourAnswer: string;
    referenceAnswer: string;
  }[];
}> {
  const data = await apiFetch<{
    attempt_id: string;
    mode: ExamMode;
    score_correct: number;
    score_total: number;
    percent: number;
    results: {
      question_id: string;
      topic: string;
      correct: boolean;
      your_answer: string;
      reference_answer: string;
    }[];
  }>(`/exams/attempts/${attemptId}/submit`, {
    method: "POST",
    body: JSON.stringify({
      answers: answers.map((a) => ({ question_id: a.questionId, answer: a.answer })),
    }),
  });
  return {
    attemptId: data.attempt_id,
    mode: data.mode,
    scoreCorrect: data.score_correct,
    scoreTotal: data.score_total,
    percent: data.percent,
    results: data.results.map((r) => ({
      questionId: r.question_id,
      topic: r.topic,
      correct: r.correct,
      yourAnswer: r.your_answer,
      referenceAnswer: r.reference_answer,
    })),
  };
}

export async function practiceChat(
  attemptId: string,
  questionId: string,
  message: string,
): Promise<string> {
  const data = await apiFetch<{ reply: string }>(`/exams/attempts/${attemptId}/chat`, {
    method: "POST",
    body: JSON.stringify({ question_id: questionId, message }),
  });
  return data.reply;
}

export async function startStudyCall(
  attemptId: string,
  questionId?: string,
): Promise<{
  roomName: string;
  accessToken: string;
  url?: string | null;
  question: ExamQuestion;
}> {
  const qs = questionId ? `?question_id=${encodeURIComponent(questionId)}` : "";
  const data = await apiFetch<{
    room_name: string;
    access_token: string;
    url?: string | null;
    question: {
      id: string;
      topic: string;
      year: number;
      question_text: string;
      choices?: string[] | null;
      reference_answer?: string | null;
      field_of_study?: string | null;
    };
  }>(`/exams/attempts/${attemptId}/study-call${qs}`, { method: "POST" });
  return {
    roomName: data.room_name,
    accessToken: data.access_token,
    url: data.url,
    question: mapQuestion(data.question),
  };
}
