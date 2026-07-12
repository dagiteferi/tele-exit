import pytest
from jose import JWTError

from app.auth.security import (
    create_access_token,
    decode_access_token,
    decode_token_payload,
    hash_password,
    verify_password,
)


def test_hash_and_verify_password():
    hashed = hash_password("secret-password")
    assert hashed != "secret-password"
    assert verify_password("secret-password", hashed) is True
    assert verify_password("wrong-password", hashed) is False


def test_create_and_decode_access_token():
    token = create_access_token("student-123", role="student")
    assert decode_access_token(token) == "student-123"
    payload = decode_token_payload(token)
    assert payload["sub"] == "student-123"
    assert payload["role"] == "student"
    assert "exp" in payload


def test_create_admin_token_includes_role():
    token = create_access_token("admin-1", role="admin")
    assert decode_token_payload(token)["role"] == "admin"


def test_decode_invalid_token_raises():
    with pytest.raises(JWTError):
        decode_access_token("not.a.valid.token")
