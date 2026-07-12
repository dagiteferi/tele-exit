from fastapi import (
    APIRouter,
    Depends,
)

from app.auth.dependencies import get_current_student_id
from app.core.di import (
    AppContainer,
    get_container,
)
from app.core.outbox_dispatcher import dispatch_pending_outbox_records
from app.core.saga_report import run_report_saga
from app.schemas import ReportTriggerResponse

router = APIRouter(tags=["reports"])


@router.post("/students/me/report", response_model=ReportTriggerResponse)
async def trigger_report(
    student_id: str = Depends(get_current_student_id),
    container: AppContainer = Depends(get_container),
):
    profile = await container.repo.get_profile(student_id)
    email_to = str((profile or {}).get("email") or "")
    preview = await run_report_saga(student_id, container.repo, container.llm)
    await dispatch_pending_outbox_records(
        container.repo,
        container.email,
        container.calendar,
    )
    weak = list((profile or {}).get("weak_topics") or [])
    return ReportTriggerResponse(
        student_id=student_id,
        email_to=email_to or None,
        report_preview=preview or "",
        calendar_suggestions=min(3, len(weak)),
    )
