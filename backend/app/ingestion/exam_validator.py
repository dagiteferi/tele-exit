"""Validate exit-exam JSON banks before they are stored."""

from __future__ import annotations

import hashlib
from dataclasses import (
    dataclass,
    field,
)
from typing import Any


REQUIRED_TOP_LEVEL = ("department", "year", "semester", "courses")
REQUIRED_QUESTION_FIELDS = (
    "question_text",
    "options",
    "correct_answer",
    "topic",
    "difficulty",
)
VALID_DIFFICULTIES = {"easy", "medium", "hard"}
VALID_ANSWERS = {"A", "B", "C", "D"}


@dataclass
class ExamValidationResult:
    ok: bool
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    question_count: int = 0
    department: str | None = None


def validate_exam_payload(
    data: list[dict] | dict,
    *,
    filename: str | None = None,
) -> ExamValidationResult:
    """
    Strict correctness check for department/courses exam banks.
    Flat question arrays get a lighter structural check.
    """
    result = ExamValidationResult(ok=True)

    if isinstance(data, list):
        return _validate_flat_list(data, result)

    if not isinstance(data, dict):
        result.ok = False
        result.errors.append("JSON root must be an object or an array of questions")
        return result

    courses = data.get("courses")
    if isinstance(courses, list):
        return _validate_department_bank(data, result, filename=filename)

    # Object with questions array
    questions = data.get("questions") or data.get("items") or data.get("data")
    if isinstance(questions, list):
        for i, q in enumerate(questions, start=1):
            if not isinstance(q, dict):
                result.errors.append(f"Q#{i}: question must be an object")
                continue
            result.question_count += 1
            result.errors.extend(
                _validate_question_flexible(q, course_name="questions", q_index=i)
            )
        result.ok = not result.errors
        return result

    result.ok = False
    result.errors.append(
        "JSON must include a 'courses' bank or a 'questions' array"
    )
    return result


def _validate_flat_list(
    data: list[dict],
    result: ExamValidationResult,
) -> ExamValidationResult:
    for i, q in enumerate(data, start=1):
        if not isinstance(q, dict):
            result.errors.append(f"Q#{i}: question must be an object")
            continue
        result.question_count += 1
        result.errors.extend(
            _validate_question_flexible(q, course_name="root", q_index=i)
        )
    result.ok = not result.errors
    return result


def _validate_department_bank(
    data: dict[str, Any],
    result: ExamValidationResult,
    *,
    filename: str | None,
) -> ExamValidationResult:
    for field_name in REQUIRED_TOP_LEVEL:
        if field_name not in data:
            result.errors.append(f"Missing top-level field: '{field_name}'")

    if result.errors:
        result.ok = False
        return result

    result.department = str(data.get("department") or "").strip() or None
    if filename and result.department:
        dept_slug = _slugify(result.department)
        file_slug = _slugify(str(filename).rsplit(".", 1)[0])
        if dept_slug != "general" and dept_slug not in file_slug:
            result.warnings.append(
                f"Internal department '{result.department}' does not match filename"
            )

    courses = data.get("courses") or []
    if not isinstance(courses, list) or not courses:
        result.errors.append("'courses' must be a non-empty array")
        result.ok = False
        return result

    hashes: set[bytes] = set()
    for i_c, course in enumerate(courses):
        if not isinstance(course, dict):
            result.errors.append(f"Course index {i_c}: must be an object")
            continue
        c_name = str(course.get("course_name") or f"Index {i_c}").strip()
        questions = course.get("questions") or []
        if not isinstance(questions, list) or not questions:
            result.errors.append(f"Course '{c_name}' has 0 questions")
            continue

        for q_idx, q in enumerate(questions):
            if not isinstance(q, dict):
                result.errors.append(f"Course '{c_name}', Q#{q_idx}: must be an object")
                continue
            result.question_count += 1
            result.errors.extend(validate_question(q, c_name, q_idx))

            if "question_text" in q and isinstance(q.get("options"), dict):
                opts = q["options"]
                h = _compute_hash(
                    str(q["question_text"]),
                    [
                        str(opts.get("A", "")),
                        str(opts.get("B", "")),
                        str(opts.get("C", "")),
                        str(opts.get("D", "")),
                    ],
                )
                if h in hashes:
                    result.warnings.append(
                        f"Course '{c_name}', Q#{q_idx}: duplicate question found"
                    )
                hashes.add(h)

    result.ok = not result.errors
    return result


def validate_question(q_data: dict[str, Any], course_name: str, q_index: int) -> list[str]:
    """Strict MCQ validation (department bank format)."""
    errors: list[str] = []
    prefix = f"Course '{course_name}', Q#{q_index}"

    for field_name in REQUIRED_QUESTION_FIELDS:
        if field_name not in q_data:
            errors.append(f"{prefix}: Missing required field '{field_name}'")
        elif field_name == "question_text" and not str(q_data[field_name]).strip():
            errors.append(f"{prefix}: Question text is empty")

    if "options" in q_data:
        options = q_data["options"]
        if not isinstance(options, dict):
            errors.append(f"{prefix}: 'options' must be a dictionary")
        else:
            norm_options = {str(k).upper(): v for k, v in options.items()}
            for opt in ("A", "B", "C", "D"):
                if opt not in norm_options:
                    errors.append(f"{prefix}: Option '{opt}' is missing")
                elif not str(norm_options[opt]).strip():
                    errors.append(f"{prefix}: Option '{opt}' is empty")

    if "correct_answer" in q_data:
        answer = str(q_data["correct_answer"]).strip().upper()
        if answer not in VALID_ANSWERS:
            errors.append(
                f"{prefix}: Invalid correct_answer '{q_data['correct_answer']}' "
                "(must be A, B, C, or D)"
            )
        elif isinstance(q_data.get("options"), dict):
            norm_options = {str(k).upper(): v for k, v in q_data["options"].items()}
            if answer not in norm_options:
                errors.append(
                    f"{prefix}: Correct answer '{answer}' points to a missing option"
                )

    if "difficulty" in q_data:
        if str(q_data["difficulty"]).lower() not in VALID_DIFFICULTIES:
            errors.append(
                f"{prefix}: Invalid difficulty '{q_data['difficulty']}' "
                "(use Easy, Medium, or Hard)"
            )

    return errors


def _validate_question_flexible(
    q_data: dict[str, Any],
    *,
    course_name: str,
    q_index: int,
) -> list[str]:
    """Allow either bank MCQ fields or simpler question/answer uploads."""
    if isinstance(q_data.get("options"), dict) or "correct_answer" in q_data:
        # Treat as bank MCQ — require full correctness
        # Fill topic from course if missing for friendlier errors later in ingest
        return validate_question(q_data, course_name, q_index)

    errors: list[str] = []
    prefix = f"Course '{course_name}', Q#{q_index}"
    has_q = any(
        str(q_data.get(k) or "").strip()
        for k in ("question_text", "question", "prompt", "text")
    )
    has_a = any(
        str(q_data.get(k) or "").strip()
        for k in ("reference_answer", "answer", "correct_answer", "solution")
    )
    if not has_q:
        errors.append(f"{prefix}: missing question text")
    if not has_a:
        errors.append(f"{prefix}: missing answer")
    return errors


def _slugify(text: str) -> str:
    return str(text).lower().strip().replace(" ", "_").replace("-", "_")


def _compute_hash(prompt: str, choices: list[str]) -> bytes:
    text = prompt + "".join(choices)
    return hashlib.sha256(text.encode("utf-8")).digest()
