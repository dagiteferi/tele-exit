import json

import pytest

from app.ingestion.question_parser import parse_uploaded_file


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


def test_parse_csv_upload():
    csv_text = (
        "topic,year,question_text,reference_answer\n"
        "Trees,2022,Define a tree,Acyclic connected graph\n"
    )
    rows = parse_uploaded_file("bank.csv", csv_text.encode("utf-8"))
    assert rows[0]["topic"] == "Trees"
    assert rows[0]["year"] == "2022"


def test_parse_rejects_unsupported_and_bad_json_shape():
    with pytest.raises(ValueError, match="Unsupported file type"):
        parse_uploaded_file("notes.txt", b"hello")
    with pytest.raises(ValueError, match="Unsupported file type"):
        parse_uploaded_file(None, b"[]")
    with pytest.raises(ValueError, match="array"):
        parse_uploaded_file("q.json", b'{"topic": "x"}')
