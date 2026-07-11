from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    UploadFile,
    status,
)

from app.auth.dependencies import get_current_admin
from app.core.di import get_container
from app.ingestion.embedding_pipeline import ingest_questions
from app.ingestion.question_parser import parse_uploaded_file

router = APIRouter(tags=["questions"])


@router.post("/questions/upload")
async def upload_questions(
    file: UploadFile = File(...),
    admin_id: str = Depends(get_current_admin),
    container: dict = Depends(get_container),
):
    content = await file.read()
    try:
        raw_questions = parse_uploaded_file(file.filename, content)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to parse upload: {exc}",
        ) from exc

    result = await ingest_questions(
        raw_questions,
        container["embedding"],
        container["vector_store"],
    )
    return {
        "ingested": result.ingested,
        "skipped": result.skipped,
        "errors": result.errors,
    }
