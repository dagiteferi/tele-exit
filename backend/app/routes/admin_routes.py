from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)

from app.auth.dependencies import get_current_admin
from app.auth.security import hash_password
from app.core.di import (
    AppContainer,
    get_container,
)
from app.ingestion.embedding_pipeline import ingest_questions
from app.ingestion.exam_validator import validate_exam_payload
from app.ingestion.question_parser import (
    extract_questions_payload,
    parse_uploaded_file,
)
from app.schemas import (
    AdminUserOut,
    ExamDetailOut,
    ExamOut,
    ExamQuestionOut,
    ExamUploadResponse,
    InviteAdminRequest,
    InviteAdminResponse,
    UploadResponse,
)

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users", response_model=list[AdminUserOut])
async def list_users(
    _admin_id: str = Depends(get_current_admin),
    container: AppContainer = Depends(get_container),
):
    users = await container.repo.list_users()
    return [
        AdminUserOut(
            id=u["id"],
            email=u["email"],
            name=u["name"],
            role=u.get("role") or "student",
            field_of_study=u.get("field_of_study"),
            exam_date=u.get("exam_date"),
            created_at=u.get("created_at"),
        )
        for u in users
    ]


@router.post("/invite", response_model=InviteAdminResponse, status_code=status.HTTP_201_CREATED)
async def invite_admin(
    body: InviteAdminRequest,
    _admin_id: str = Depends(get_current_admin),
    container: AppContainer = Depends(get_container),
):
    existing = await container.repo.get_user_by_email(str(body.email))
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )
    admin_id = await container.repo.create_user(
        email=str(body.email),
        password_hash=hash_password(body.password),
        name=body.name.strip(),
        field_of_study=None,
        exam_date=None,
        report_frequency="weekly",
        role="admin",
    )
    return InviteAdminResponse(id=admin_id, email=str(body.email), name=body.name.strip())


@router.get("/exams", response_model=list[ExamOut])
async def list_all_exams(
    _admin_id: str = Depends(get_current_admin),
    container: AppContainer = Depends(get_container),
):
    exams = await container.repo.list_exams()
    return [
        ExamOut(
            id=e["id"],
            title=e["title"],
            field_of_study=e["field_of_study"],
            year=e.get("year"),
            description=e.get("description"),
            question_count=int(e.get("question_count") or 0),
            created_at=e.get("created_at"),
        )
        for e in exams
    ]


@router.get("/exams/{exam_id}", response_model=ExamDetailOut)
async def get_admin_exam_detail(
    exam_id: str,
    _admin_id: str = Depends(get_current_admin),
    container: AppContainer = Depends(get_container),
):
    exam = await container.repo.get_exam(exam_id)
    if exam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
    questions = await container.repo.list_exam_questions(exam_id)
    return ExamDetailOut(
        exam=ExamOut(
            id=exam["id"],
            title=exam["title"],
            field_of_study=exam["field_of_study"],
            year=exam.get("year"),
            description=exam.get("description"),
            question_count=len(questions),
            created_at=exam.get("created_at"),
        ),
        questions=[
            ExamQuestionOut(
                id=q["id"],
                topic=q["topic"],
                year=int(q["year"]),
                question_text=q["question_text"],
                choices=q.get("choices"),
                reference_answer=q.get("reference_answer"),
                field_of_study=q.get("field_of_study"),
            )
            for q in questions
        ],
        mode="practice",
    )


@router.post("/exams/upload", response_model=ExamUploadResponse)
async def upload_exam(
    file: UploadFile = File(...),
    title: str | None = Form(None),
    field_of_study: str | None = Form(None),
    year: int | None = Form(None),
    description: str | None = Form(None),
    admin_id: str = Depends(get_current_admin),
    container: AppContainer = Depends(get_container),
):
    content = await file.read()
    try:
        parsed = parse_uploaded_file(file.filename, content)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to parse upload: {exc}",
        ) from exc

    # Strict correctness check BEFORE any DB write
    validation = validate_exam_payload(parsed, filename=file.filename)
    if not validation.ok:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": (
                    f"Exam data failed validation "
                    f"({len(validation.errors)} error(s)). Fix the JSON before uploading."
                ),
                "errors": validation.errors[:80],
                "warnings": validation.warnings[:40],
                "question_count": validation.question_count,
            },
        )

    try:
        questions, meta = extract_questions_payload(parsed)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    exam_title = (title or meta.get("title") or "").strip() or (
        (file.filename or "Exam").rsplit(".", 1)[0]
    )
    exam_field = (field_of_study or meta.get("field_of_study") or "").strip()
    if not exam_field:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="field_of_study is required (form field or JSON metadata)",
        )

    exam_year = year
    if exam_year is None and meta.get("year") is not None:
        try:
            exam_year = int(str(meta["year"]).strip().split(".")[0])
        except (TypeError, ValueError):
            exam_year = None

    exam_id = await container.repo.create_exam(
        title=exam_title,
        field_of_study=exam_field,
        year=exam_year,
        description=description or meta.get("description"),
        created_by=admin_id,
    )

    result = await ingest_questions(
        questions,
        container.embedding,
        container.vector_store,
        exam_id=exam_id,
        field_of_study=exam_field,
        default_year=exam_year,
        embed_mode="fast",
        concurrency=24,
    )
    return ExamUploadResponse(
        exam_id=exam_id,
        title=exam_title,
        field_of_study=exam_field,
        ingested=result.ingested,
        skipped=result.skipped,
        errors=result.errors,
        warnings=validation.warnings,
        question_count=validation.question_count,
    )


@router.get("/questions")
async def list_questions_admin(
    _admin_id: str = Depends(get_current_admin),
    container: AppContainer = Depends(get_container),
):
    rows = await container.repo.list_all_questions()
    return [
        {
            "id": q["id"],
            "topic": q["topic"],
            "year": q["year"],
            "question": q["question_text"],
            "field_of_study": q.get("field_of_study"),
            "exam_id": q.get("exam_id"),
            "choices": q.get("choices"),
        }
        for q in rows
    ]


# Backward-compatible alias used by older clients
legacy_router = APIRouter(tags=["questions"])


@legacy_router.post("/questions/upload", response_model=UploadResponse)
async def upload_questions_legacy(
    file: UploadFile = File(...),
    field_of_study: str | None = Form(None),
    title: str | None = Form(None),
    year: int | None = Form(None),
    admin_id: str = Depends(get_current_admin),
    container: AppContainer = Depends(get_container),
):
    """Prefer POST /admin/exams/upload. Kept for compatibility."""
    content = await file.read()
    try:
        parsed = parse_uploaded_file(file.filename, content)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    validation = validate_exam_payload(parsed, filename=file.filename)
    if not validation.ok:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": f"Exam data failed validation ({len(validation.errors)} error(s)).",
                "errors": validation.errors[:80],
            },
        )

    try:
        questions, meta = extract_questions_payload(parsed)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    exam_field = (field_of_study or meta.get("field_of_study") or "General").strip()
    exam_title = (title or meta.get("title") or file.filename or "Uploaded exam").strip()
    exam_year = year
    if exam_year is None and meta.get("year") is not None:
        try:
            exam_year = int(str(meta["year"]).strip().split(".")[0])
        except (TypeError, ValueError):
            exam_year = None

    exam_id = await container.repo.create_exam(
        title=exam_title,
        field_of_study=exam_field,
        year=exam_year,
        description=None,
        created_by=admin_id,
    )
    result = await ingest_questions(
        questions,
        container.embedding,
        container.vector_store,
        exam_id=exam_id,
        field_of_study=exam_field,
        default_year=exam_year,
        embed_mode="fast",
        concurrency=24,
    )
    return UploadResponse(
        ingested=result.ingested,
        skipped=result.skipped,
        errors=result.errors,
    )
