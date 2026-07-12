import csv
import io
import json


def parse_uploaded_file(filename: str | None, content: bytes) -> list[dict] | dict:
    """
    Parse CSV/JSON uploads.

    JSON may be:
      - an array of question objects
      - an object with optional metadata + `questions` array
        { "title", "field_of_study", "year", "questions": [...] }
    """
    if not filename:
        raise ValueError("Unsupported file type — use .csv or .json")

    lowered = filename.lower()
    if lowered.endswith(".json"):
        data = json.loads(content.decode("utf-8"))
        if isinstance(data, list):
            return [dict(item) for item in data]
        if isinstance(data, dict):
            return data
        raise ValueError("JSON upload must be an array or an object with a questions array")

    if lowered.endswith(".csv"):
        reader = csv.DictReader(io.StringIO(content.decode("utf-8")))
        return [dict(row) for row in reader]

    raise ValueError("Unsupported file type — use .csv or .json")


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
        "description": parsed.get("description"),
    }
    questions = parsed.get("questions") or parsed.get("items") or parsed.get("data")
    if not isinstance(questions, list):
        raise ValueError("JSON object must include a 'questions' array")
    return [dict(item) for item in questions], meta
