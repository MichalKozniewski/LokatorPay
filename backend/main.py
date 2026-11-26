import os
import re
import secrets
from decimal import Decimal
from datetime import datetime, timezone
from urllib.parse import urlsplit
from fastapi import FastAPI, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from database import Base, engine, get_db
from models import User, Apartment, ApartmentMember, Invite, Room
from security import hash_password, verify_password, create_access_token, get_current_user
Base.metadata.create_all(bind=engine)

app = FastAPI(title="LokatorPay API", version="1.0.0")

ENV = os.getenv("ENV", "development").lower()
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}

@app.middleware("http")
async def enforce_https_and_hsts(request: Request, call_next):
    host = (request.url.hostname or "").lower()
    effective_scheme = request.url.scheme

    is_local = host in LOCAL_HOSTS
    if not is_local and effective_scheme != "https":
        return JSONResponse(
            status_code=403,
            content={"detail": "Komunikacja dozwolona wyłącznie przez szyfrowany protokół HTTPS."},
        )

    response = await call_next(request)

    if effective_scheme == "https" and not is_local:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

    return response

FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173").rstrip("/")
parsed_frontend_origin = urlsplit(FRONTEND_ORIGIN)
if (
    not parsed_frontend_origin.netloc
    or parsed_frontend_origin.path not in ("", "/")
    or parsed_frontend_origin.query
    or parsed_frontend_origin.fragment
):
    raise RuntimeError("FRONTEND_ORIGIN musi być poprawnym originem bez ścieżki.")
if ENV == "production" and parsed_frontend_origin.scheme != "https":
    raise RuntimeError("W produkcji FRONTEND_ORIGIN musi używać HTTPS.")

allowed_origins = [FRONTEND_ORIGIN]
if ENV != "production":
    allowed_origins.extend(["http://localhost:5173", "http://127.0.0.1:5173"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(dict.fromkeys(allowed_origins)),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- SCHEMATY PYDANTIC ---

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
            raise ValueError("Hasło musi zawierać co najmniej jedną wielką literę.")
        if not re.search(r"[0-9]", v):
            raise ValueError("Hasło musi zawierać co najmniej jedną cyfrę.")
        if not re.search(r"[^A-Za-z0-9]", v):
            raise ValueError("Hasło musi zawierać co najmniej jeden znak specjalny.")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class CreateApartmentRequest(BaseModel):
    name: str
    address: str | None = None


class CreateInviteRequest(BaseModel):
    email: EmailStr | None = None


class CreateRoomRequest(BaseModel):
    name: str
    area: float
    tenant_user_id: str | None = None


class AssignTenantRequest(BaseModel):
    tenant_user_id: str | None = None


# --- POMOCNICY AUTORYZACJI LOKALU (NFR-02) ---

def require_member(db: Session, apartment_id: str, user_id: str) -> ApartmentMember:
    membership = (
        db.query(ApartmentMember)
        .filter(
            ApartmentMember.apartment_id == apartment_id,
            ApartmentMember.user_id == user_id,
        )
        .first()
    )
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Brak dostępu do danych tego lokalu.",
        )
    return membership


def require_admin(db: Session, apartment_id: str, user_id: str) -> ApartmentMember:
    membership = require_member(db, apartment_id, user_id)
    if membership.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operacja wymaga uprawnień Administratora lokalu.",
        )
    return membership


def serialize_apartment_state(db: Session, apartment: Apartment, role: str) -> dict:
    members_rows = (
        db.query(ApartmentMember, User)
        .join(User, ApartmentMember.user_id == User.id)
        .filter(ApartmentMember.apartment_id == apartment.id)
        .all()
    )
    members = [
        {
            "userId": u.id,
            "name": u.name,
            "email": u.email,
            "role": m.role,
            "joinedAt": m.joined_at.isoformat(),
        }
        for m, u in members_rows
    ]

    rooms_rows = (
        db.query(Room)
        .filter(Room.apartment_id == apartment.id)
        .order_by(Room.created_at.asc())
        .all()
    )
    rooms = [
        {
            "id": r.id,
            "apartmentId": r.apartment_id,
            "name": r.name,
            "area": float(r.area_m2),
            "tenantId": r.tenant_user_id,
        }
        for r in rooms_rows
    ]
    total_area = round(sum(r["area"] for r in rooms), 2)

    invites = []
    if role == "admin":
        invite_rows = (
            db.query(Invite)
            .filter(Invite.apartment_id == apartment.id)
            .order_by(Invite.created_at.desc())
            .all()
        )
        invites = [
            {
                "token": inv.token,
                "email": inv.email,
                "used": inv.used_at is not None,
                "createdAt": inv.created_at.isoformat(),
            }
            for inv in invite_rows
        ]

    return {
        "apartment": {
            "id": apartment.id,
            "name": apartment.name,
            "address": apartment.address or "",
        },
        "role": role,
        "members": members,
        "rooms": rooms,
        "totalArea": total_area,
        "invites": invites,
    }


# --- US1: REJESTRACJA, LOGOWANIE I WERYFIKACJA SESJI (FR-01, NFR-02) ---

@app.post("/api/auth/register", status_code=status.HTTP_201_CREATED)
def register(data: RegisterRequest, db: Session = Depends(get_db)):
    normalized_email = data.email.strip().lower()
    if db.query(User).filter(User.email == normalized_email).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Konto z tym adresem e-mail już istnieje.",
        )

    display_name = (data.name or "").strip() or normalized_email.split("@")[0]
    user = User(
        name=display_name,
        email=normalized_email,
        password_hash=hash_password(data.password),
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        if db.query(User).filter(User.email == normalized_email).first():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Konto z tym adresem e-mail już istnieje.",
            )
        raise
    db.refresh(user)

    token = create_access_token(user)
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": 3600,
        "user": {"id": user.id, "name": user.name, "email": user.email},
    }


@app.post("/api/auth/login")
def login(data: LoginRequest, db: Session = Depends(get_db)):
    normalized_email = data.email.strip().lower()
    user = db.query(User).filter(User.email == normalized_email).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Nieprawidłowy adres e-mail lub hasło.",
        )

    token = create_access_token(user)
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": 3600,
        "user": {"id": user.id, "name": user.name, "email": user.email},
    }


@app.get("/api/auth/me")
def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
    }


# --- US2: LOKALE, ROLE I JEDNORAZOWE ZAPROSZENIA (FR-02, NFR-02) ---

@app.get("/api/apartments")
def list_user_apartments(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(Apartment, ApartmentMember.role)
        .join(ApartmentMember, Apartment.id == ApartmentMember.apartment_id)
        .filter(ApartmentMember.user_id == current_user.id)
        .order_by(Apartment.created_at.asc())
        .all()
    )
    return [
        {
            "id": apt.id,
            "name": apt.name,
            "address": apt.address or "",
            "role": role,
        }
        for apt, role in rows
    ]


@app.post("/api/apartments", status_code=status.HTTP_201_CREATED)
def create_apartment(
    data: CreateApartmentRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    trimmed_name = data.name.strip()
    if not trimmed_name:
        raise HTTPException(status_code=400, detail="Podaj nazwę lokalu.")

    apt = Apartment(
        name=trimmed_name,
        address=(data.address or "").strip() or None,
        created_by=current_user.id,
    )
    db.add(apt)
    db.flush()

    membership = ApartmentMember(
        apartment_id=apt.id,
        user_id=current_user.id,
        role="admin",
    )
    db.add(membership)
    db.commit()
    db.refresh(apt)

    return serialize_apartment_state(db, apt, "admin")


@app.get("/api/apartments/{apartment_id}")
def get_apartment_details(
    apartment_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    membership = require_member(db, apartment_id, current_user.id)
    apt = db.query(Apartment).filter(Apartment.id == apartment_id).first()
    if not apt:
        raise HTTPException(status_code=404, detail="Nie znaleziono lokalu.")
    return serialize_apartment_state(db, apt, membership.role)


@app.post("/api/apartments/{apartment_id}/invites", status_code=status.HTTP_201_CREATED)
def create_invite(
    apartment_id: str,
    data: CreateInviteRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_admin(db, apartment_id, current_user.id)
    token = secrets.token_urlsafe(16)
    normalized_email = data.email.strip().lower() if data.email else None

    invite = Invite(
        token=token,
        apartment_id=apartment_id,
        email=normalized_email,
        created_by=current_user.id,
    )
    db.add(invite)
    db.commit()

    return {
        "token": token,
        "email": normalized_email,
        "link": f"{FRONTEND_ORIGIN}/?invite={token}",
    }


@app.post("/api/apartments/join/{token}")
def join_apartment(
    token: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    invite = db.query(Invite).filter(Invite.token == token).first()
    if not invite:
        raise HTTPException(status_code=404, detail="Nieprawidłowy link zaproszeniowy.")

    # Jednorazowość linku zaproszeniowego
    if invite.used_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ten link zaproszeniowy został już wykorzystany.",
        )

    # Weryfikacja zgodności adresu e-mail, jeśli zaproszenie było imienne
    if invite.email and invite.email.lower() != current_user.email.lower():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"To zaproszenie zostało przypisane do adresu {invite.email}.",
        )

    existing_member = (
        db.query(ApartmentMember)
        .filter(
            ApartmentMember.apartment_id == invite.apartment_id,
            ApartmentMember.user_id == current_user.id,
        )
        .first()
    )
    if not existing_member:
        db.add(
            ApartmentMember(
                apartment_id=invite.apartment_id,
                user_id=current_user.id,
                role="tenant",
            )
        )

    invite.used_at = datetime.now(timezone.utc)
    invite.used_by = current_user.id
    db.commit()

    apt = db.query(Apartment).filter(Apartment.id == invite.apartment_id).first()
    role = existing_member.role if existing_member else "tenant"
    return serialize_apartment_state(db, apt, role)


# --- US3: POKOJE I METRAŻ (FR-03, NFR-03) ---

@app.post("/api/apartments/{apartment_id}/rooms", status_code=status.HTTP_201_CREATED)
def add_room(
    apartment_id: str,
    data: CreateRoomRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_admin(db, apartment_id, current_user.id)

    trimmed_name = data.name.strip()
    if not trimmed_name:
        raise HTTPException(status_code=400, detail="Podaj nazwę pokoju.")
    if data.area <= 0:
        raise HTTPException(status_code=400, detail="Metraż pokoju musi być większy od 0 m².")

    if data.tenant_user_id:
        require_member(db, apartment_id, data.tenant_user_id)

    room = Room(
        apartment_id=apartment_id,
        name=trimmed_name,
        area_m2=Decimal(f"{data.area:.2f}"),
        tenant_user_id=data.tenant_user_id or None,
    )
    db.add(room)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ten lokator jest już przypisany do innego pokoju w tym lokalu.",
        )

    apt = db.query(Apartment).filter(Apartment.id == apartment_id).first()
    return serialize_apartment_state(db, apt, "admin")


@app.patch("/api/apartments/{apartment_id}/rooms/{room_id}/assign")
def assign_tenant_to_room(
    apartment_id: str,
    room_id: str,
    data: AssignTenantRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_admin(db, apartment_id, current_user.id)

    room = (
        db.query(Room)
        .filter(Room.id == room_id, Room.apartment_id == apartment_id)
        .first()
    )
    if not room:
        raise HTTPException(status_code=404, detail="Nie znaleziono pokoju.")

    if data.tenant_user_id:
        require_member(db, apartment_id, data.tenant_user_id)

    room.tenant_user_id = data.tenant_user_id or None
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ten lokator jest już przypisany do innego pokoju w tym lokalu.",
        )

    apt = db.query(Apartment).filter(Apartment.id == apartment_id).first()
    return serialize_apartment_state(db, apt, "admin")


@app.delete("/api/apartments/{apartment_id}/rooms/{room_id}")
def delete_room(
    apartment_id: str,
    room_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_admin(db, apartment_id, current_user.id)

    room = (
        db.query(Room)
        .filter(Room.id == room_id, Room.apartment_id == apartment_id)
        .first()
    )
    if not room:
        raise HTTPException(status_code=404, detail="Nie znaleziono pokoju.")

    db.delete(room)
    db.commit()

    apt = db.query(Apartment).filter(Apartment.id == apartment_id).first()
    return serialize_apartment_state(db, apt, "admin")