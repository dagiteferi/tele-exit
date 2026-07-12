from app.routes.auth_routes import router as auth_router
from app.routes.question_routes import router as question_router
from app.routes.report_routes import router as report_router
from app.routes.student_routes import router as student_router
from app.routes.ws_call import router as ws_router

__all__ = [
    "auth_router",
    "question_router",
    "report_router",
    "student_router",
    "ws_router",
]
