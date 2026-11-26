import secrets
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr

router = APIRouter(prefix="/api/apartments", tags=["apartments"])

# Symulacja tabel bazy danych (docelowo PostgreSQL - os2)
apartments_db: dict[str, dict] = {}
memberships_db: list[dict] = []  # { user_email, apartment_id, role: 'admin' | 'tenant' }
invites_db: dict[str, dict] = {}    # token -> { apartment_id, email, created_by, used }


class CreateApartmentRequest(BaseModel):
    name: str
    address: str | None = None


class CreateInviteRequest(BaseModel):
    email: EmailStr | None = None


def get_current_user_email() -> str:
    # W produkcji dekodowane z nagłówka Authorization: Bearer <JWT> (z modułu auth.py)
    return "admin@lokatorpay.pl"


def require_apartment_member(apartment_id: str, user_email: str) -> dict:
    membership = next(
        (
            m
            for m in memberships_db
            if m["apartment_id"] == apartment_id and m["user_email"] == user_email
        ),
        None,
    )
    if not membership:
        # NFR-02: Brak dostępu do danych cudzego lokalu
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Brak uprawnień do przeglądania danych tego lokalu.",
        )
    return membership


@router.post("", status_code=status.HTTP_201_CREATED)
def create_apartment(
    data: CreateApartmentRequest,
    user_email: str = Depends(get_current_user_email),
):
    apt_id = secrets.token_hex(8)
    apartments_db[apt_id] = {
        "id": apt_id,
        "name": data.name.strip(),
        "address": data.address,
    }
    # FR-02: Twórca automatycznie otrzymuje rolę Administratora lokalu
    memberships_db.append(
        {"user_email": user_email, "apartment_id": apt_id, "role": "admin"}
    )
    return {"apartment": apartments_db[apt_id], "role": "admin"}


@router.post("/{apartment_id}/invites", status_code=status.HTTP_201_CREATED)
def invite_tenant(
    apartment_id: str,
    data: CreateInviteRequest,
    user_email: str = Depends(get_current_user_email),
):
    membership = require_apartment_member(apartment_id, user_email)
    if membership["role"] != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tylko Administrator lokalu może zapraszać lokatorów.",
        )

    token = secrets.token_urlsafe(16)
    invites_db[token] = {
        "token": token,
        "apartment_id": apartment_id,
        "email": data.email.lower() if data.email else None,
        "created_by": user_email,
        "used": False,
    }
    return {
        "token": token,
        "invite_url": f"https://lokatorpay.app/?invite={token}",
        "email_sent_to": invites_db[token]["email"],
    }


@router.post("/join/{token}")
def join_apartment_by_invite(
    token: str,
    user_email: str = Depends(get_current_user_email),
):
    invite = invites_db.get(token)
    if not invite:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Nieprawidłowy lub wygasły link zaproszeniowy.",
        )

    apt_id = invite["apartment_id"]
    already_member = any(
        m["apartment_id"] == apt_id and m["user_email"] == user_email
        for m in memberships_db
    )
    if not already_member:
        memberships_db.append(
            {"user_email": user_email, "apartment_id": apt_id, "role": "tenant"}
        )

    invite["used"] = True
    return {"apartment": apartments_db[apt_id], "role": "tenant"}


@router.get("/{apartment_id}")
def get_apartment_details(
    apartment_id: str,
    user_email: str = Depends(get_current_user_email),
):
    membership = require_apartment_member(apartment_id, user_email)
    members = [m for m in memberships_db if m["apartment_id"] == apartment_id]
    return {
        "apartment": apartments_db[apartment_id],
        "your_role": membership["role"],
        "members": members,
    }