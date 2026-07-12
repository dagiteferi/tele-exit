from datetime import (
    datetime,
    timedelta,
    timezone,
)
import logging

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
)
from fastapi.security import OAuth2PasswordRequestForm

from app.auth.dependencies import get_current_student_id
from app.auth.security import (
    create_access_token,
    create_password_reset_token,
    hash_password,
    hash_password_reset_token,
    verify_password,
)
from app.core.di import (
    AppContainer,
    get_container,
)
from app.schemas import (
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    LoginResponse,
    MeResponse,
    RegisterRequest,
    RegisterResponse,
    ResetPasswordRequest,
    ResetPasswordResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

_GENERIC_FORGOT = (
    "If that email is registered, we sent a password reset link. Check your inbox "
    "(and spam). The link expires in 1 hour."
)


async def _authenticate(
    email: str,
    password: str,
    container: AppContainer,
) -> LoginResponse:
    user = await container.repo.get_user_by_email(email)
    if user is None or not verify_password(password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    token = create_access_token(user["id"], role=user.get("role", "student"))
    return LoginResponse(access_token=token)


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
    """JSON login body: {email, password}."""
    return await _authenticate(str(body.email), body.password, container)


@router.post("/token", response_model=LoginResponse)
async def login_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    container: AppContainer = Depends(get_container),
):
    """Swagger Authorize form — put email in the username field."""
    return await _authenticate(form_data.username, form_data.password, container)


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
async def forgot_password(
    body: ForgotPasswordRequest,
    container: AppContainer = Depends(get_container),
):
    """Email a one-time reset link. Always returns the same message."""
    user = await container.repo.get_user_by_email(str(body.email).strip())

    if user is not None:
        raw, token_hash = create_password_reset_token()
        expires = datetime.now(timezone.utc) + timedelta(hours=1)
        expires_at = expires.strftime("%Y-%m-%d %H:%M:%S")
        await container.repo.create_password_reset_token(
            user_id=user["id"],
            token_hash=token_hash,
            expires_at=expires_at,
        )
        reset_url = f"{container.settings.frontend_url}/reset-password?token={raw}"
        html = (
            f"<p>Hi {user.get('name') or 'there'},</p>"
            f"<p>We received a request to reset your Tele-Exit password.</p>"
            f"<p><a href=\"{reset_url}\">Reset your password</a></p>"
            f"<p>Or copy this link:<br><code>{reset_url}</code></p>"
            f"<p>This link expires in <strong>1 hour</strong>. "
            f"If you didn’t ask for this, you can ignore this email.</p>"
            f"<p>— Tele-Exit</p>"
        )
        try:
            await container.email.send(
                user["email"],
                "Reset your Tele-Exit password",
                html,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Password reset email failed: %s", exc)
    return ForgotPasswordResponse(message=_GENERIC_FORGOT)


@router.post("/reset-password", response_model=ResetPasswordResponse)
async def reset_password(
    body: ResetPasswordRequest,
    container: AppContainer = Depends(get_container),
):
    token_hash = hash_password_reset_token(body.token.strip())
    row = await container.repo.get_valid_password_reset_token(token_hash)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This reset link is invalid or has expired. Request a new one.",
        )
    await container.repo.update_user_password(
        row["user_id"],
        hash_password(body.new_password),
    )
    await container.repo.mark_password_reset_token_used(row["id"])
    return ResetPasswordResponse()


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
