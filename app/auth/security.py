from datetime import (
    datetime,
    timedelta,
    timezone,
)

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import get_settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days


def _jwt_secret() -> str:
    return get_settings().jwt_secret


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def create_access_token(student_id: str, role: str = "student") -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRE_MINUTES)
    payload = {
        "sub": student_id,
        "role": role,
        "exp": expire,
    }
    return jwt.encode(payload, _jwt_secret(), algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> str:
    """Returns student_id, or raises if invalid/expired."""
    payload = decode_token_payload(token)
    student_id = payload.get("sub")
    if not student_id:
        raise JWTError("Token missing subject")
    return student_id


def decode_token_payload(token: str) -> dict:
    return jwt.decode(token, _jwt_secret(), algorithms=[JWT_ALGORITHM])
