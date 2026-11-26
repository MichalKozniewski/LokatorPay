from datetime import datetime, timedelta, timezone
import re
import os
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.httpsredirect import HTTPSRedirectMiddleware
from pydantic import BaseModel, EmailStr, field_validator
from passlib.context import CryptContext
import jwt

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "zmien-ten-klucz-w-produkcji")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60  # NFR-02: token JWT wygasa po 60 minutach

app = FastAPI(title="LokatorPay Auth API")

# NFR-02: Wymuszenie HTTPS w środowisku produkcyjnym
if os.getenv("ENV") == "production":
    app.add_middleware(HTTPSRedirectMiddleware)

# NFR-02: Hashowanie haseł algorytmem bcrypt
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Tymczasowa baza w pamięci (docelowo PostgreSQL - os2)
users_db: dict[str, dict] = {}


class RegisterRequest(BaseModel):
    name: str | None = None
    email: EmailStr
    password: str

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Hasło musi mieć co najmniej 8 znaków.")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Hasło musi zawierać wielką literę.")
        if not re.search(r"[0-9]", v):
            raise ValueError("Hasło musi zawierać cyfrę.")
        if not re.search(r"[^A-Za-z0-9]", v):
            raise ValueError("Hasło musi zawierać znak specjalny.")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


def create_access_token(email: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": email,
        "iat": now,
        "exp": now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


@app.post("/api/auth/register", status_code=status.HTTP_201_CREATED)
def register(data: RegisterRequest):
    normalized_email = data.email.lower()
    if normalized_email in users_db:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Konto z tym adresem e-mail już istnieje.",
        )

    hashed_password = pwd_context.hash(data.password)
    users_db[normalized_email] = {
        "name": data.name or normalized_email.split("@")[0],
        "email": normalized_email,
        "password_hash": hashed_password,
    }

    token = create_access_token(normalized_email)
    return {"access_token": token, "token_type": "bearer", "expires_in": 3600}


@app.post("/api/auth/login")
def login(data: LoginRequest):
    normalized_email = data.email.lower()
    user = users_db.get(normalized_email)
    if not user or not pwd_context.verify(data.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Nieprawidłowy adres e-mail lub hasło.",
        )

    token = create_access_token(normalized_email)
    return {"access_token": token, "token_type": "bearer", "expires_in": 3600}