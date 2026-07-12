-- db/schema.sql
-- Tele-Exit v3 schema (users include role from §5.5; other tables from §10)

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    field_of_study TEXT,
    exam_date TEXT,
    report_frequency TEXT NOT NULL DEFAULT 'weekly',
    role TEXT NOT NULL DEFAULT 'student',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS learner_profiles (
    student_id TEXT PRIMARY KEY,
    last_session_at TEXT,
    sessions_completed INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (student_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS topic_scores (
    student_id TEXT NOT NULL,
    topic TEXT NOT NULL,
    correct INTEGER NOT NULL DEFAULT 0,
    attempted INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (student_id, topic),
    FOREIGN KEY (student_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS session_events (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    topic TEXT NOT NULL,
    student_answer_transcript TEXT,
    was_correct INTEGER NOT NULL,
    agent_used TEXT NOT NULL,
    occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS calendar_events (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    topic TEXT NOT NULL,
    start_iso TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL,
    external_event_id TEXT,
    FOREIGN KEY (student_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS outbox (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS exam_questions (
    id TEXT PRIMARY KEY,
    topic TEXT NOT NULL,
    year INTEGER NOT NULL,
    question_text TEXT NOT NULL,
    reference_answer TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'user_uploaded',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Stock SQLite stand-in for sqlite-vec vec0 (swap later behind VectorStorePort)
CREATE TABLE IF NOT EXISTS question_embeddings (
    question_id TEXT PRIMARY KEY,
    embedding TEXT NOT NULL,
    FOREIGN KEY (question_id) REFERENCES exam_questions(id)
);
