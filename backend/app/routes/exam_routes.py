from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
)

from app.auth.dependencies import get_current_student_id
from app.core.di import (
    AppContainer,
    get_container,
)
from app.schemas import (
    ExamDetailOut,
    ExamOut,
    ExamQuestionOut,
    PracticeChatRequest,
    PracticeChatResponse,
    StartAttemptRequest,
    StartAttemptResponse,
    StudyCallResponse,
    SubmitAttemptRequest,
    SubmitAttemptResponse,
)

router = APIRouter(prefix="/exams", tags=["exams"])


def _normalize(s: str | None) -> str:
    return (s or "").strip().lower()


def _question_out(q: dict, *, include_answer: bool) -> ExamQuestionOut:
    return ExamQuestionOut(
        id=q["id"],
        topic=q["topic"],
        year=int(q["year"]),
        question_text=q["question_text"],
        choices=q.get("choices"),
        reference_answer=q.get("reference_answer") if include_answer else None,
        field_of_study=q.get("field_of_study"),
    )


def _exam_out(e: dict) -> ExamOut:
    return ExamOut(
        id=e["id"],
        title=e["title"],
        field_of_study=e["field_of_study"],
        year=e.get("year"),
        description=e.get("description"),
        question_count=int(e.get("question_count") or 0),
        created_at=e.get("created_at"),
    )


async def _student_field(container: AppContainer, student_id: str) -> str:
    user = await container.repo.get_user_by_id(student_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    field = user.get("field_of_study")
    if not field:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your account has no field of study set",
        )
    return str(field)


def _answers_match(expected: str, given: str) -> bool:
    a = " ".join(expected.strip().lower().split())
    b = " ".join(given.strip().lower().split())
    if not a or not b:
        return False
    if a == b:
        return True
    # Multiple-choice letter match: "A" vs "A) ..."
    if len(b) <= 3 and a.startswith(b[0]) and (len(a) == 1 or a[1] in ").: -"):
        return True
    return a in b or b in a


@router.get("", response_model=list[ExamOut])
async def list_my_exams(
    student_id: str = Depends(get_current_student_id),
    container: AppContainer = Depends(get_container),
):
    field = await _student_field(container, student_id)
    exams = await container.repo.list_exams(field_of_study=field)
    return [_exam_out(e) for e in exams]


@router.get("/attempts/mine")
async def my_attempts(
    student_id: str = Depends(get_current_student_id),
    container: AppContainer = Depends(get_container),
):
    return await container.repo.list_student_attempts(student_id)


@router.get("/{exam_id}", response_model=ExamDetailOut)
async def get_exam_for_mode(
    exam_id: str,
    mode: str = "practice",
    student_id: str = Depends(get_current_student_id),
    container: AppContainer = Depends(get_container),
):
    if mode not in ("practice", "exam"):
        raise HTTPException(status_code=400, detail="mode must be practice or exam")
    field = await _student_field(container, student_id)
    exam = await container.repo.get_exam(exam_id)
    if exam is None:
        raise HTTPException(status_code=404, detail="Exam not found")
    if _normalize(exam.get("field_of_study")) != _normalize(field):
        raise HTTPException(
            status_code=403,
            detail="This exam is not available for your field of study",
        )
    questions = await container.repo.list_exam_questions(exam_id)
    include_answer = mode == "practice"
    return ExamDetailOut(
        exam=_exam_out({**exam, "question_count": len(questions)}),
        questions=[_question_out(q, include_answer=include_answer) for q in questions],
        mode=mode,  # type: ignore[arg-type]
    )


@router.post("/{exam_id}/attempts", response_model=StartAttemptResponse)
async def start_attempt(
    exam_id: str,
    body: StartAttemptRequest,
    student_id: str = Depends(get_current_student_id),
    container: AppContainer = Depends(get_container),
):
    field = await _student_field(container, student_id)
    exam = await container.repo.get_exam(exam_id)
    if exam is None:
        raise HTTPException(status_code=404, detail="Exam not found")
    if _normalize(exam.get("field_of_study")) != _normalize(field):
        raise HTTPException(status_code=403, detail="Exam not available for your field")

    questions = await container.repo.list_exam_questions(exam_id)
    if not questions:
        raise HTTPException(status_code=400, detail="Exam has no questions")

    attempt_id = await container.repo.create_exam_attempt(
        exam_id=exam_id,
        student_id=student_id,
        mode=body.mode,
    )
    include_answer = body.mode == "practice"
    return StartAttemptResponse(
        attempt_id=attempt_id,
        exam_id=exam_id,
        mode=body.mode,
        questions=[_question_out(q, include_answer=include_answer) for q in questions],
    )


@router.post("/attempts/{attempt_id}/submit", response_model=SubmitAttemptResponse)
async def submit_attempt(
    attempt_id: str,
    body: SubmitAttemptRequest,
    student_id: str = Depends(get_current_student_id),
    container: AppContainer = Depends(get_container),
):
    attempt = await container.repo.get_exam_attempt(attempt_id)
    if attempt is None or attempt["student_id"] != student_id:
        raise HTTPException(status_code=404, detail="Attempt not found")
    if attempt.get("completed_at"):
        raise HTTPException(status_code=400, detail="Attempt already submitted")

    questions = await container.repo.list_exam_questions(attempt["exam_id"])
    by_id = {q["id"]: q for q in questions}
    answer_map = {a.question_id: a.answer for a in body.answers}

    results = []
    correct = 0
    for q in questions:
        given = answer_map.get(q["id"], "")
        is_correct = _answers_match(q["reference_answer"], given)
        if is_correct:
            correct += 1
        results.append(
            {
                "question_id": q["id"],
                "topic": q["topic"],
                "correct": is_correct,
                "your_answer": given,
                "reference_answer": q["reference_answer"],
            }
        )

        # Update topic scores for exam mode (and practice too)
        await container.repo.record_session_event(
            {
                "student_id": student_id,
                "question_id": q["id"],
                "topic": q["topic"],
                "student_answer_transcript": given,
                "was_correct": is_correct,
                "agent_used": "curriculum",
            }
        )

    total = len(questions)
    saved = await container.repo.complete_exam_attempt(
        attempt_id=attempt_id,
        answers=[a.model_dump() for a in body.answers],
        score_correct=correct,
        score_total=total,
    )
    # Mark session completed on profile when exam mode
    if attempt["mode"] == "exam":
        profile = await container.repo.get_profile(student_id)
        if profile:
            profile["sessions_completed"] = int(profile.get("sessions_completed", 0)) + 1
            await container.repo.save_profile(profile)

    percent = (correct / total * 100.0) if total else 0.0
    return SubmitAttemptResponse(
        attempt_id=attempt_id,
        mode=attempt["mode"],
        score_correct=correct,
        score_total=total,
        percent=round(percent, 1),
        results=results,
    )


@router.post("/attempts/{attempt_id}/chat", response_model=PracticeChatResponse)
async def practice_chat(
    attempt_id: str,
    body: PracticeChatRequest,
    student_id: str = Depends(get_current_student_id),
    container: AppContainer = Depends(get_container),
):
    attempt = await container.repo.get_exam_attempt(attempt_id)
    if attempt is None or attempt["student_id"] != student_id:
        raise HTTPException(status_code=404, detail="Attempt not found")
    if attempt["mode"] != "practice":
        raise HTTPException(
            status_code=403,
            detail="AI chat is only available in practice mode",
        )

    questions = await container.repo.list_exam_questions(attempt["exam_id"])
    question = next((q for q in questions if q["id"] == body.question_id), None)
    if question is None:
        raise HTTPException(status_code=404, detail="Question not found")

    system = (
        "You are Tele-Exit, a supportive exit-exam study coach. "
        "Explain clearly, give hints first, and only reveal the full answer if asked. "
        "Keep replies concise (under 180 words)."
    )
    prompt = (
        f"Field topic: {question['topic']}\n"
        f"Question: {question['question_text']}\n"
        f"Reference answer (for your guidance only): {question['reference_answer']}\n"
        f"Student message: {body.message}\n"
    )
    reply = await container.llm.generate(prompt, system=system)
    return PracticeChatResponse(reply=reply.strip() or "Let's walk through this step by step.")


@router.post("/attempts/{attempt_id}/study-call", response_model=StudyCallResponse)
async def start_study_call(
    attempt_id: str,
    question_id: str | None = None,
    student_id: str = Depends(get_current_student_id),
    container: AppContainer = Depends(get_container),
):
    attempt = await container.repo.get_exam_attempt(attempt_id)
    if attempt is None or attempt["student_id"] != student_id:
        raise HTTPException(status_code=404, detail="Attempt not found")
    if attempt["mode"] != "practice":
        raise HTTPException(
            status_code=403,
            detail="Video study call is only available in practice mode",
        )

    questions = await container.repo.list_exam_questions(attempt["exam_id"])
    if not questions:
        raise HTTPException(status_code=400, detail="No questions")
    question = questions[0]
    if question_id:
        found = next((q for q in questions if q["id"] == question_id), None)
        if found:
            question = found

    room = await container.video_session.create_room(student_id)
    return StudyCallResponse(
        room_name=str(room.get("room_name") or ""),
        access_token=str(room.get("access_token") or ""),
        url=room.get("url"),
        question=_question_out(question, include_answer=True),
    )
