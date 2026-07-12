import csv
import io
import json


def parse_uploaded_file(filename: str | None, content: bytes) -> list[dict]:
    if not filename:
        raise ValueError("Unsupported file type — use .csv or .json")

    lowered = filename.lower()
    if lowered.endswith(".json"):
        data = json.loads(content.decode("utf-8"))
        if not isinstance(data, list):
            raise ValueError("JSON upload must be an array of question objects")
        return [dict(item) for item in data]

    if lowered.endswith(".csv"):
        reader = csv.DictReader(io.StringIO(content.decode("utf-8")))
        return [dict(row) for row in reader]

    raise ValueError("Unsupported file type — use .csv or .json")
