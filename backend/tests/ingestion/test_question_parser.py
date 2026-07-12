import json

import pytest

from app.ingestion.question_parser import (
    extract_questions_payload,
    parse_uploaded_file,
)


def test_parse_json_upload():
    payload = [
        {
            "topic": "Graphs",
            "year": 2023,
            "question_text": "What is BFS?",
            "reference_answer": "Breadth-first search",
        }
    ]
    rows = parse_uploaded_file("questions.json", json.dumps(payload).encode("utf-8"))
    assert rows == payload


def test_parse_rejects_non_json():
    with pytest.raises(ValueError, match="Only .json"):
        parse_uploaded_file("bank.csv", b"topic,year\nTrees,2022\n")
    with pytest.raises(ValueError, match="Only .json"):
        parse_uploaded_file("notes.txt", b"hello")
    with pytest.raises(ValueError, match="Only .json"):
        parse_uploaded_file(None, b"[]")


def test_parse_rejects_bad_json_shape():
    with pytest.raises(ValueError, match="questions|courses"):
        extract_questions_payload(parse_uploaded_file("q.json", b'{"topic": "x"}'))


def test_parse_department_courses_bank():
    payload = {
        "department": "software engineering",
        "year": "2015",
        "courses": [
            {
                "course_name": "OS",
                "questions": [
                    {
                        "question_text": "What is deadlock?",
                        "options": {"A": "x", "B": "y"},
                        "correct_answer": "A",
                        "topic": "Deadlock",
                    }
                ],
            }
        ],
    }
    parsed = parse_uploaded_file("exam.json", json.dumps(payload).encode("utf-8"))
    questions, meta = extract_questions_payload(parsed)
    assert meta["field_of_study"] == "software engineering"
    assert len(questions) == 1
    assert questions[0]["correct_answer"] == "A"
