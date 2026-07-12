from app.ingestion.exam_validator import validate_exam_payload


def test_valid_department_bank_passes():
    data = {
        "department": "software engineering",
        "year": "2015",
        "semester": "hamle",
        "courses": [
            {
                "course_name": "OS",
                "questions": [
                    {
                        "question_text": "What is deadlock?",
                        "options": {"A": "x", "B": "y", "C": "z", "D": "w"},
                        "correct_answer": "A",
                        "topic": "Deadlock",
                        "difficulty": "Easy",
                    }
                ],
            }
        ],
    }
    result = validate_exam_payload(data, filename="2015_hamle_software_engineering.json")
    assert result.ok
    assert result.question_count == 1
    assert result.errors == []


def test_missing_option_fails_before_store():
    data = {
        "department": "software engineering",
        "year": "2015",
        "semester": "hamle",
        "courses": [
            {
                "course_name": "OS",
                "questions": [
                    {
                        "question_text": "Q?",
                        "options": {"A": "x", "B": "y", "C": "z"},
                        "correct_answer": "A",
                        "topic": "T",
                        "difficulty": "Easy",
                    }
                ],
            }
        ],
    }
    result = validate_exam_payload(data)
    assert not result.ok
    assert any("Option 'D'" in e for e in result.errors)


def test_invalid_correct_answer_fails():
    data = {
        "department": "software engineering",
        "year": "2015",
        "semester": "hamle",
        "courses": [
            {
                "course_name": "OS",
                "questions": [
                    {
                        "question_text": "Q?",
                        "options": {"A": "x", "B": "y", "C": "z", "D": "w"},
                        "correct_answer": "E",
                        "topic": "T",
                        "difficulty": "Easy",
                    }
                ],
            }
        ],
    }
    result = validate_exam_payload(data)
    assert not result.ok
    assert any("correct_answer" in e for e in result.errors)
