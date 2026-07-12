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
}

const MOCK_QUESTIONS: QuestionRow[] = [
  { id: "q1", topic: "Algorithms", year: 2022, question: "Given a directed acyclic graph, describe a topological sort algorithm and its time complexity." },
  { id: "q2", topic: "Databases",  year: 2023, question: "Explain the difference between 3NF and BCNF with an example schema." },
  { id: "q3", topic: "Networking", year: 2021, question: "Contrast TCP and UDP; give a scenario where UDP is preferable." },
  { id: "q4", topic: "OS",         year: 2023, question: "Describe how a deadlock can arise and how the banker's algorithm prevents it." },
];

export async function listQuestions(): Promise<QuestionRow[]> {
  await sleep(250);
  return MOCK_QUESTIONS;
}

export interface IngestResult {
  ingested: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

export async function uploadQuestions(file: File): Promise<IngestResult> {
  await sleep(700);
  // TODO backend: POST /admin/questions/upload
  const size = file.size;
  const approxRows = Math.max(1, Math.floor(size / 120));
  const errors: { row: number; message: string }[] =
    approxRows > 3
      ? [
          { row: 4, message: "Missing 'topic' column" },
          { row: 11, message: "Year must be a 4-digit number" },
        ]
      : [];
  const skipped = errors.length;
  const ingested = Math.max(0, approxRows - skipped);
  return { ingested, skipped, errors };
}
