from app.routes.admin_routes import legacy_router as question_router
from app.routes.admin_routes import router as admin_router
from app.routes.auth_routes import router as auth_router
from app.routes.exam_routes import router as exam_router
from app.routes.report_routes import router as report_router
from app.routes.student_routes import router as student_router
from app.routes.support_routes import router as support_router
from app.routes.ws_call import router as ws_router

__all__ = [
    "auth_router",
    "admin_router",
    "question_router",
    "exam_router",
    "report_router",
    "student_router",
    "support_router",
    "ws_router",
]
