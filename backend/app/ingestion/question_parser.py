import json


def parse_uploaded_file(filename: str | None, content: bytes) -> list[dict] | dict:
    """
    Parse JSON exam uploads only.

    Supported shapes:
      - array of question objects
      - { title, field_of_study, questions: [...] }
      - { department, year, courses: [{ course_name, questions: [...] }] }
    """
    if not filename or not filename.lower().endswith(".json"):
        raise ValueError("Only .json files are supported")

    try:
        data = json.loads(content.decode("utf-8"))
    except UnicodeDecodeError as exc:
        raise ValueError("File must be UTF-8 JSON") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON: {exc.msg}") from exc

    if isinstance(data, list):
        return [dict(item) for item in data]
    if isinstance(data, dict):
        return data
    raise ValueError("JSON upload must be an array or an object")


def extract_questions_payload(
    parsed: list[dict] | dict,
) -> tuple[list[dict], dict]:
    """Return (questions, metadata) from parse_uploaded_file output."""
    if isinstance(parsed, list):
        return parsed, {}

    meta = {
        "title": parsed.get("title") or parsed.get("exam_title") or parsed.get("name"),
        "field_of_study": parsed.get("field_of_study")
        or parsed.get("department")
        or parsed.get("field"),
        "year": parsed.get("year"),
        "description": parsed.get("description") or parsed.get("semester"),
        "courses": None,
    }

    # Exit-exam bank format: department + courses[].questions
    courses = parsed.get("courses")
    if isinstance(courses, list) and courses:
        flattened: list[dict] = []
        course_names: list[str] = []
        for course in courses:
            if not isinstance(course, dict):
                continue
            course_name = str(
                course.get("course_name") or course.get("name") or "Course"
            ).strip()
            course_names.append(course_name)
            for q in course.get("questions") or []:
                if not isinstance(q, dict):
                    continue
                item = dict(q)
                item.setdefault("course_name", course_name)
                if not item.get("topic"):
                    item["topic"] = course_name
                flattened.append(item)
        if not flattened:
            raise ValueError("courses array has no questions")
        if not meta.get("title"):
            dept = meta.get("field_of_study") or "Exit exam"
            year = meta.get("year")
            meta["title"] = f"{dept} {year}".strip() if year else str(dept)
        meta["courses"] = course_names
        meta["description"] = meta.get("description") or (
            f"{len(course_names)} courses · {len(flattened)} questions"
        )
        return flattened, meta

    questions = (
        parsed.get("questions")
        or parsed.get("items")
        or parsed.get("data")
        or parsed.get("exam_questions")
        or parsed.get("question_list")
    )

    if not isinstance(questions, list) and _looks_like_question(parsed):
        return [dict(parsed)], meta

    if not isinstance(questions, list):
        raise ValueError(
            "JSON must be either an array of questions, an object with a "
            "'questions' array, or a department bank with 'courses' "
            "(each course has its own questions)."
        )
    return [dict(item) for item in questions], meta


def _looks_like_question(obj: dict) -> bool:
    has_q = any(k in obj for k in ("question", "question_text", "prompt", "text"))
    has_a = any(k in obj for k in ("answer", "reference_answer", "correct_answer", "solution"))
    return has_q and has_a
