from fastapi import (
    Depends,
    HTTPException,
    status,
)
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError

from app.auth.security import (
    decode_access_token,
    decode_token_payload,
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


async def get_current_student_id(token: str = Depends(oauth2_scheme)) -> str:
    try:
        return decode_access_token(token)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )


async def get_current_admin(token: str = Depends(oauth2_scheme)) -> str:
    """Like get_current_student_id, but requires role == 'admin' (403 otherwise)."""
    try:
        payload = decode_token_payload(token)
        student_id = payload.get("sub")
        if not student_id:
            raise JWTError("Token missing subject")
        if payload.get("role") != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin role required",
            )
        return student_id
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
