from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
)

from app.auth.dependencies import get_current_student_id
from app.auth.security import (
    create_access_token,
    hash_password,
    verify_password,
)
from app.core.di import (
    AppContainer,
    get_container,
)
from app.schemas import (
    LoginRequest,
    LoginResponse,
    MeResponse,
    RegisterRequest,
    RegisterResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=RegisterResponse)
async def register(
    body: RegisterRequest,
    container: AppContainer = Depends(get_container),
):
    existing = await container.repo.get_user_by_email(body.email)
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    student_id = await container.repo.create_user(
        email=str(body.email),
        password_hash=hash_password(body.password),
        name=body.name,
        field_of_study=body.field_of_study,
        exam_date=body.exam_date,
        report_frequency=body.report_frequency,
        role="student",
    )
    token = create_access_token(student_id, role="student")
    return RegisterResponse(student_id=student_id, access_token=token)


@router.post("/login", response_model=LoginResponse)
async def login(
    body: LoginRequest,
    container: AppContainer = Depends(get_container),
):
    user = await container.repo.get_user_by_email(str(body.email))
    if user is None or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    token = create_access_token(user["id"], role=user.get("role", "student"))
    return LoginResponse(access_token=token)


@router.get("/me", response_model=MeResponse)
async def me(
    student_id: str = Depends(get_current_student_id),
    container: AppContainer = Depends(get_container),
):
    user = await container.repo.get_user_by_id(student_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    return MeResponse(
        student_id=user["id"],
        name=user["name"],
        email=user["email"],
        role=user.get("role", "student"),
        field_of_study=user.get("field_of_study"),
        exam_date=user.get("exam_date"),
    )
