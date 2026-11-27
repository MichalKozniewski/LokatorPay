import os
import re
import secrets
import math
from decimal import Decimal
from datetime import date, datetime, timedelta, timezone
from urllib.parse import urlsplit
from fastapi import FastAPI, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from database import Base, engine, get_db
from models import (
    User,
    Apartment,
    ApartmentMember,
    Invite,
    Room,
    RentSettings,
    RentPeriod,
    RentAllocation,
    RentPeriodExclusion,
    Expense,
    ExpenseShare,
    TransferPayment,
)
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
    include_in_current_rent: bool = True


class UpdateRoomRequest(BaseModel):
    name: str
    area: float


class AssignTenantRequest(BaseModel):
    tenant_user_id: str | None = None
    include_in_current_rent: bool = True


class TransferAdminRequest(BaseModel):
    user_id: str


class UpdateRentSettingsRequest(BaseModel):
    rent_amount: Decimal
    billing_start_day: int = 1


class CreateExpenseRequest(BaseModel):
    description: str
    amount: Decimal
    payer_user_id: str
    participant_user_ids: list[str]


class CompleteTransferRequest(BaseModel):
    recipient_user_id: str
    amount: Decimal


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


def billing_period_window(billing_start_day: int, today: date | None = None) -> tuple[date, date]:
    today = today or datetime.now(timezone.utc).date()
    year, month = today.year, today.month
    if today.day < billing_start_day:
        month -= 1
        if month == 0:
            year -= 1
            month = 12

    starts_on = date(year, month, billing_start_day)
    next_month = month + 1
    next_year = year
    if next_month == 13:
        next_month = 1
        next_year += 1
    ends_on = date(next_year, next_month, billing_start_day) - timedelta(days=1)
    return starts_on, ends_on


def ensure_current_rent_period(
    db: Session,
    apartment_id: str,
    today: date | None = None,
) -> RentPeriod | None:
    settings = (
        db.query(RentSettings)
        .filter(RentSettings.apartment_id == apartment_id)
        .first()
    )
    if not settings:
        return None

    starts_on, ends_on = billing_period_window(settings.billing_start_day, today)
    period = (
        db.query(RentPeriod)
        .filter(
            RentPeriod.apartment_id == apartment_id,
            RentPeriod.starts_on == starts_on,
        )
        .first()
    )
    if not period:
        has_assigned_room = (
            db.query(Room.id)
            .filter(
                Room.apartment_id == apartment_id,
                Room.tenant_user_id.isnot(None),
            )
            .first()
        )
        if not has_assigned_room:
            return None

        period = RentPeriod(
            apartment_id=apartment_id,
            starts_on=starts_on,
            ends_on=ends_on,
            rent_amount=Decimal(settings.rent_amount).quantize(Decimal("0.01")),
        )
        db.add(period)
        db.flush()

    excluded_user_ids = {
        row.tenant_user_id
        for row in db.query(RentPeriodExclusion)
        .filter(RentPeriodExclusion.period_id == period.id)
        .all()
    }
    assigned_rooms_query = (
        db.query(Room, User)
        .join(User, Room.tenant_user_id == User.id)
        .filter(
            Room.apartment_id == apartment_id,
            Room.tenant_user_id.isnot(None),
        )
    )
    if excluded_user_ids:
        assigned_rooms_query = assigned_rooms_query.filter(
            Room.tenant_user_id.notin_(excluded_user_ids)
        )
    assigned_rooms = assigned_rooms_query.order_by(
        Room.tenant_user_id.asc(), Room.id.asc()
    ).all()

    db.query(RentAllocation).filter(
        RentAllocation.period_id == period.id
    ).delete(synchronize_session=False)
    total_area = sum((room.area_m2 for room, _ in assigned_rooms), Decimal("0"))
    if assigned_rooms and total_area > 0:
        total_cents = int(Decimal(period.rent_amount).quantize(Decimal("0.01")) * 100)
        allocations = []
        allocated_cents = 0
        for room, tenant in assigned_rooms:
            exact_cents = Decimal(total_cents) * Decimal(room.area_m2) / total_area
            base_cents = int(exact_cents)
            allocated_cents += base_cents
            allocations.append(
                {
                    "room": room,
                    "tenant": tenant,
                    "base_cents": base_cents,
                    "remainder": exact_cents - base_cents,
                }
            )

        remaining_cents = total_cents - allocated_cents
        ranked_allocations = sorted(
            allocations,
            key=lambda item: (-item["remainder"], item["tenant"].id, item["room"].id),
        )
        cents_by_room = {item["room"].id: item["base_cents"] for item in allocations}
        for item in ranked_allocations[:remaining_cents]:
            cents_by_room[item["room"].id] += 1

        for item in allocations:
            room = item["room"]
            tenant = item["tenant"]
            db.add(
                RentAllocation(
                    period_id=period.id,
                    tenant_user_id=tenant.id,
                    tenant_name=tenant.name,
                    tenant_email=tenant.email,
                    room_id=room.id,
                    room_name=room.name,
                    area_m2=room.area_m2,
                    amount=Decimal(cents_by_room[room.id]) / 100,
                )
            )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise
    return period


def set_rent_period_inclusion(
    db: Session,
    period: RentPeriod,
    tenant_user_id: str,
    include: bool,
) -> None:
    exclusion = (
        db.query(RentPeriodExclusion)
        .filter(
            RentPeriodExclusion.period_id == period.id,
            RentPeriodExclusion.tenant_user_id == tenant_user_id,
        )
        .first()
    )
    if include and exclusion:
        db.delete(exclusion)
    elif not include and not exclusion:
        db.add(
            RentPeriodExclusion(
                period_id=period.id,
                tenant_user_id=tenant_user_id,
            )
        )
    db.commit()


def serialize_rent_state(db: Session, apartment_id: str) -> dict | None:
    settings = (
        db.query(RentSettings)
        .filter(RentSettings.apartment_id == apartment_id)
        .first()
    )
    if not settings:
        return None

    period = ensure_current_rent_period(db, apartment_id)
    allocations = []
    excluded_tenants = []
    if period:
        allocation_rows = (
            db.query(RentAllocation)
            .filter(RentAllocation.period_id == period.id)
            .order_by(RentAllocation.tenant_name.asc(), RentAllocation.tenant_user_id.asc())
            .all()
        )
        total_assigned_area = sum(
            (row.area_m2 for row in allocation_rows), Decimal("0")
        )
        allocations = [
            {
                "tenantId": row.tenant_user_id,
                "tenantName": row.tenant_name,
                "tenantEmail": row.tenant_email,
                "roomId": row.room_id,
                "roomName": row.room_name,
                "area": float(row.area_m2),
                "sharePercent": (
                    float(Decimal(row.area_m2) * 100 / total_assigned_area)
                    if total_assigned_area
                    else 0
                ),
                "amount": float(row.amount),
            }
            for row in allocation_rows
        ]
        excluded_rows = (
            db.query(RentPeriodExclusion.tenant_user_id, User.name)
            .outerjoin(User, User.id == RentPeriodExclusion.tenant_user_id)
            .filter(RentPeriodExclusion.period_id == period.id)
            .order_by(User.name.asc(), RentPeriodExclusion.tenant_user_id.asc())
            .all()
        )
        excluded_tenants = [
            {"tenantId": user_id, "tenantName": name or "Usunięty użytkownik"}
            for user_id, name in excluded_rows
        ]

    unassigned_room_count = (
        db.query(Room)
        .filter(
            Room.apartment_id == apartment_id,
            Room.tenant_user_id.is_(None),
        )
        .count()
    )
    return {
        "settings": {
            "rentAmount": float(settings.rent_amount),
            "billingStartDay": settings.billing_start_day,
        },
        "currentPeriod": (
            {
                "startsOn": period.starts_on.isoformat(),
                "endsOn": period.ends_on.isoformat(),
                "rentAmount": float(period.rent_amount),
                "allocations": allocations,
                "excludedTenants": excluded_tenants,
            }
            if period
            else None
        ),
        "unassignedRoomCount": unassigned_room_count,
    }


def calculate_minimum_transfers(balances: dict[str, dict]) -> list[dict]:
    nonzero_users = sorted(
        (
            user_id
            for user_id, balance in balances.items()
            if balance["balance"] != 0
        ),
        key=lambda user_id: (balances[user_id]["name"].lower(), user_id),
    )
    count = len(nonzero_users)
    if count < 2:
        return []

    values = [balances[user_id]["balance"] for user_id in nonzero_users]
    subset_count = 1 << count
    subset_sums = [Decimal("0")] * subset_count
    zero_sum_groups = [0] * subset_count
    previous_masks = [0] * subset_count

    for mask in range(1, subset_count):
        least_bit = mask & -mask
        user_index = least_bit.bit_length() - 1
        previous_mask = mask ^ least_bit
        subset_sums[mask] = subset_sums[previous_mask] + values[user_index]

        best_previous = previous_mask
        best_group_count = zero_sum_groups[previous_mask]
        remaining_bits = previous_mask
        while remaining_bits:
            bit = remaining_bits & -remaining_bits
            candidate_mask = mask ^ bit
            candidate_count = zero_sum_groups[candidate_mask]
            if candidate_count > best_group_count:
                best_group_count = candidate_count
                best_previous = candidate_mask
            remaining_bits ^= bit

        zero_sum_groups[mask] = best_group_count + (
            1 if subset_sums[mask] == 0 else 0
        )
        previous_masks[mask] = best_previous

    insertion_order = []
    mask = subset_count - 1
    while mask:
        previous_mask = previous_masks[mask]
        inserted_bit = mask ^ previous_mask
        insertion_order.append(inserted_bit.bit_length() - 1)
        mask = previous_mask
    insertion_order.reverse()

    groups = []
    current_group = []
    running_total = Decimal("0")
    for user_index in insertion_order:
        user_id = nonzero_users[user_index]
        current_group.append(user_id)
        running_total += values[user_index]
        if running_total == 0:
            groups.append(current_group)
            current_group = []

    if current_group:
        raise RuntimeError("Nie udało się odtworzyć podziału sald na grupy zerowe.")

    transfers = []
    for group in groups:
        debtors = sorted(
            (user_id for user_id in group if balances[user_id]["balance"] < 0),
            key=lambda user_id: (
                balances[user_id]["balance"],
                balances[user_id]["name"].lower(),
                user_id,
            ),
        )
        creditors = sorted(
            (user_id for user_id in group if balances[user_id]["balance"] > 0),
            key=lambda user_id: (
                -balances[user_id]["balance"],
                balances[user_id]["name"].lower(),
                user_id,
            ),
        )

        debtor_index = 0
        creditor_index = 0
        debtor_remaining = -balances[debtors[0]]["balance"] if debtors else Decimal("0")
        creditor_remaining = balances[creditors[0]]["balance"] if creditors else Decimal("0")
        while debtor_index < len(debtors) and creditor_index < len(creditors):
            amount = min(debtor_remaining, creditor_remaining)
            transfers.append(
                {
                    "fromUserId": debtors[debtor_index],
                    "fromName": balances[debtors[debtor_index]]["name"],
                    "toUserId": creditors[creditor_index],
                    "toName": balances[creditors[creditor_index]]["name"],
                    "amount": amount,
                }
            )
            debtor_remaining -= amount
            creditor_remaining -= amount
            if debtor_remaining == 0:
                debtor_index += 1
                if debtor_index < len(debtors):
                    debtor_remaining = -balances[debtors[debtor_index]]["balance"]
            if creditor_remaining == 0:
                creditor_index += 1
                if creditor_index < len(creditors):
                    creditor_remaining = balances[creditors[creditor_index]]["balance"]

    return transfers


def serialize_expense_state(
    db: Session,
    apartment_id: str,
) -> tuple[list[dict], list[dict], list[dict], list[dict]]:
    expenses = (
        db.query(Expense)
        .filter(Expense.apartment_id == apartment_id)
        .order_by(Expense.created_at.desc(), Expense.id.desc())
        .all()
    )
    shares = (
        db.query(ExpenseShare)
        .join(Expense, ExpenseShare.expense_id == Expense.id)
        .filter(Expense.apartment_id == apartment_id)
        .order_by(ExpenseShare.participant_name.asc(), ExpenseShare.participant_user_id.asc())
        .all()
    )
    completed_payments = (
        db.query(TransferPayment)
        .filter(TransferPayment.apartment_id == apartment_id)
        .order_by(TransferPayment.completed_at.desc(), TransferPayment.id.desc())
        .all()
    )

    balances: dict[str, dict] = {}
    member_rows = (
        db.query(ApartmentMember, User)
        .join(User, ApartmentMember.user_id == User.id)
        .filter(ApartmentMember.apartment_id == apartment_id)
        .all()
    )
    for _, member in member_rows:
        balances[member.id] = {
            "userId": member.id,
            "name": member.name,
            "email": member.email,
            "balance": Decimal("0"),
        }

    shares_by_expense: dict[str, list[ExpenseShare]] = {}
    for share in shares:
        shares_by_expense.setdefault(share.expense_id, []).append(share)
        balances.setdefault(
            share.participant_user_id,
            {
                "userId": share.participant_user_id,
                "name": share.participant_name,
                "email": share.participant_email,
                "balance": Decimal("0"),
            },
        )
        balances[share.participant_user_id]["balance"] -= Decimal(share.amount_owed)

    serialized_expenses = []
    for expense in expenses:
        balances.setdefault(
            expense.payer_user_id,
            {
                "userId": expense.payer_user_id,
                "name": expense.payer_name,
                "email": expense.payer_email,
                "balance": Decimal("0"),
            },
        )
        balances[expense.payer_user_id]["balance"] += Decimal(expense.amount)
        serialized_expenses.append(
            {
                "id": expense.id,
                "description": expense.description,
                "amount": float(expense.amount),
                "payerId": expense.payer_user_id,
                "payerName": expense.payer_name,
                "payerEmail": expense.payer_email,
                "createdAt": expense.created_at.isoformat(),
                "participants": [
                    {
                        "userId": share.participant_user_id,
                        "name": share.participant_name,
                        "email": share.participant_email,
                        "amountOwed": float(share.amount_owed),
                    }
                    for share in shares_by_expense.get(expense.id, [])
                ],
            }
        )

    serialized_completed_payments = []
    for payment in completed_payments:
        balances.setdefault(
            payment.from_user_id,
            {
                "userId": payment.from_user_id,
                "name": payment.from_name,
                "email": "",
                "balance": Decimal("0"),
            },
        )
        balances.setdefault(
            payment.to_user_id,
            {
                "userId": payment.to_user_id,
                "name": payment.to_name,
                "email": "",
                "balance": Decimal("0"),
            },
        )
        balances[payment.from_user_id]["balance"] += Decimal(payment.amount)
        balances[payment.to_user_id]["balance"] -= Decimal(payment.amount)
        serialized_completed_payments.append(
            {
                "id": payment.id,
                "fromUserId": payment.from_user_id,
                "fromName": payment.from_name,
                "toUserId": payment.to_user_id,
                "toName": payment.to_name,
                "amount": float(payment.amount),
                "completedAt": payment.completed_at.isoformat(),
            }
        )

    suggested_transfers = [
        {
            **transfer,
            "amount": float(transfer["amount"]),
        }
        for transfer in calculate_minimum_transfers(balances)
    ]
    serialized_balances = [
        {
            **balance,
            "balance": float(balance["balance"]),
        }
        for balance in sorted(balances.values(), key=lambda item: (item["name"].lower(), item["userId"]))
    ]
    return (
        serialized_expenses,
        serialized_balances,
        suggested_transfers,
        serialized_completed_payments,
    )


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

    expenses, balances, suggested_transfers, completed_payments = serialize_expense_state(
        db, apartment.id
    )
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
        "rent": serialize_rent_state(db, apartment.id),
        "expenses": expenses,
        "balances": balances,
        "suggestedTransfers": suggested_transfers,
        "completedTransfers": completed_payments,
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


@app.delete("/api/auth/me")
def delete_account(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    memberships = (
        db.query(ApartmentMember, Apartment)
        .join(Apartment, ApartmentMember.apartment_id == Apartment.id)
        .filter(ApartmentMember.user_id == current_user.id)
        .all()
    )
    for _, apartment in memberships:
        ensure_current_rent_period(db, apartment.id)

    blocked_apartments = []
    for membership, apartment in memberships:
        if membership.role != "admin":
            continue
        another_admin = (
            db.query(ApartmentMember)
            .filter(
                ApartmentMember.apartment_id == apartment.id,
                ApartmentMember.role == "admin",
                ApartmentMember.user_id != current_user.id,
            )
            .first()
        )
        if not another_admin:
            blocked_apartments.append(apartment.name)

    owned_apartments = (
        db.query(Apartment).filter(Apartment.created_by == current_user.id).all()
    )
    replacement_admins = {}
    for apartment in owned_apartments:
        replacement = (
            db.query(ApartmentMember)
            .filter(
                ApartmentMember.apartment_id == apartment.id,
                ApartmentMember.role == "admin",
                ApartmentMember.user_id != current_user.id,
            )
            .first()
        )
        if replacement:
            replacement_admins[apartment.id] = replacement.user_id
        else:
            blocked_apartments.append(apartment.name)

    if blocked_apartments:
        apartment_names = ", ".join(sorted(set(blocked_apartments)))
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Przed usunięciem konta przekaż rolę administratora w lokalach: "
                f"{apartment_names}."
            ),
        )

    for apartment in owned_apartments:
        apartment.created_by = replacement_admins[apartment.id]

    created_invites = (
        db.query(Invite).filter(Invite.created_by == current_user.id).all()
    )
    for invite in created_invites:
        replacement = (
            db.query(ApartmentMember)
            .filter(
                ApartmentMember.apartment_id == invite.apartment_id,
                ApartmentMember.role == "admin",
                ApartmentMember.user_id != current_user.id,
            )
            .first()
        )
        if replacement:
            invite.created_by = replacement.user_id
        else:
            db.delete(invite)

    db.query(Invite).filter(Invite.used_by == current_user.id).update(
        {Invite.used_by: None}, synchronize_session=False
    )
    db.query(Room).filter(Room.tenant_user_id == current_user.id).update(
        {Room.tenant_user_id: None}, synchronize_session=False
    )
    db.query(ApartmentMember).filter(
        ApartmentMember.user_id == current_user.id
    ).delete(synchronize_session=False)
    db.delete(current_user)
    db.commit()
    for _, apartment in memberships:
        ensure_current_rent_period(db, apartment.id)
    return {"detail": "Konto zostało usunięte."}


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


@app.put("/api/apartments/{apartment_id}/rent/settings")
def update_rent_settings(
    apartment_id: str,
    data: UpdateRentSettingsRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_admin(db, apartment_id, current_user.id)
    if not data.rent_amount.is_finite() or data.rent_amount <= 0:
        raise HTTPException(status_code=400, detail="Czynsz musi być dodatnią kwotą.")
    if data.rent_amount > Decimal("99999999.99"):
        raise HTTPException(status_code=400, detail="Czynsz przekracza dozwolony limit.")
    if data.rent_amount != data.rent_amount.quantize(Decimal("0.01")):
        raise HTTPException(
            status_code=400,
            detail="Czynsz może mieć maksymalnie dwa miejsca po przecinku.",
        )
    if not 1 <= data.billing_start_day <= 28:
        raise HTTPException(
            status_code=400,
            detail="Dzień rozpoczęcia okresu musi wynosić od 1 do 28.",
        )

    settings = (
        db.query(RentSettings)
        .filter(RentSettings.apartment_id == apartment_id)
        .first()
    )
    if settings:
        if settings.billing_start_day != data.billing_start_day:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cykl rozliczeniowy nie może być zmieniony po jego skonfigurowaniu.",
            )
        ensure_current_rent_period(db, apartment_id)
        settings.rent_amount = data.rent_amount
        settings.updated_at = datetime.now(timezone.utc)
    else:
        settings = RentSettings(
            apartment_id=apartment_id,
            rent_amount=data.rent_amount,
            billing_start_day=data.billing_start_day,
        )
        db.add(settings)
    db.commit()

    apartment = db.query(Apartment).filter(Apartment.id == apartment_id).first()
    return serialize_apartment_state(db, apartment, "admin")


@app.post("/api/apartments/{apartment_id}/expenses", status_code=status.HTTP_201_CREATED)
def create_expense(
    apartment_id: str,
    data: CreateExpenseRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    membership = require_member(db, apartment_id, current_user.id)
    description = data.description.strip()
    if not description:
        raise HTTPException(status_code=400, detail="Podaj opis wydatku.")
    if len(description) > 200:
        raise HTTPException(
            status_code=400,
            detail="Opis wydatku może mieć maksymalnie 200 znaków.",
        )
    if not data.amount.is_finite() or data.amount < Decimal("0.01"):
        raise HTTPException(
            status_code=400,
            detail="Kwota wydatku musi wynosić co najmniej 0,01 zł.",
        )
    if data.amount > Decimal("99999999.99"):
        raise HTTPException(status_code=400, detail="Kwota wydatku przekracza dozwolony limit.")
    if data.amount != data.amount.quantize(Decimal("0.01")):
        raise HTTPException(
            status_code=400,
            detail="Kwota może mieć maksymalnie dwa miejsca po przecinku.",
        )
    if not data.payer_user_id:
        raise HTTPException(status_code=400, detail="Wybierz płatnika.")
    if not data.participant_user_ids:
        raise HTTPException(
            status_code=400,
            detail="Wybierz co najmniej jednego uczestnika wydatku.",
        )
    if len(set(data.participant_user_ids)) != len(data.participant_user_ids):
        raise HTTPException(
            status_code=400,
            detail="Uczestnik może być wybrany tylko raz.",
        )

    payer_membership = (
        db.query(ApartmentMember)
        .filter(
            ApartmentMember.apartment_id == apartment_id,
            ApartmentMember.user_id == data.payer_user_id,
        )
        .first()
    )
    if not payer_membership:
        raise HTTPException(status_code=400, detail="Płatnik musi należeć do tego lokalu.")
    payer = db.query(User).filter(User.id == data.payer_user_id).first()
    if not payer:
        raise HTTPException(status_code=400, detail="Nie znaleziono płatnika.")

    participant_rows = (
        db.query(ApartmentMember, User)
        .join(User, ApartmentMember.user_id == User.id)
        .filter(
            ApartmentMember.apartment_id == apartment_id,
            ApartmentMember.user_id.in_(data.participant_user_ids),
        )
        .order_by(ApartmentMember.user_id.asc())
        .all()
    )
    if len(participant_rows) != len(data.participant_user_ids):
        raise HTTPException(
            status_code=400,
            detail="Wszyscy uczestnicy muszą należeć do tego lokalu.",
        )

    total_cents = int(data.amount * 100)
    base_cents, remainder_cents = divmod(total_cents, len(participant_rows))
    expense = Expense(
        apartment_id=apartment_id,
        description=description,
        amount=data.amount,
        payer_user_id=payer.id,
        payer_name=payer.name,
        payer_email=payer.email,
    )
    db.add(expense)
    try:
        db.flush()
        for index, (_, participant) in enumerate(participant_rows):
            share_cents = base_cents + (1 if index < remainder_cents else 0)
            db.add(
                ExpenseShare(
                    expense_id=expense.id,
                    participant_user_id=participant.id,
                    participant_name=participant.name,
                    participant_email=participant.email,
                    amount_owed=Decimal(share_cents) / 100,
                )
            )
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Nie udało się zapisać wydatku. Spróbuj ponownie.",
        )

    apartment = db.query(Apartment).filter(Apartment.id == apartment_id).first()
    return serialize_apartment_state(db, apartment, membership.role)


@app.post("/api/apartments/{apartment_id}/settlements/complete")
def complete_suggested_transfer(
    apartment_id: str,
    data: CompleteTransferRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    membership = require_member(db, apartment_id, current_user.id)
    if data.recipient_user_id == current_user.id:
        raise HTTPException(
            status_code=400,
            detail="Nie można oznaczyć przelewu do samego siebie.",
        )
    if not data.amount.is_finite() or data.amount <= 0:
        raise HTTPException(status_code=400, detail="Kwota przelewu musi być dodatnia.")
    if data.amount > Decimal("99999999.99"):
        raise HTTPException(status_code=400, detail="Kwota przelewu przekracza dozwolony limit.")
    if data.amount != data.amount.quantize(Decimal("0.01")):
        raise HTTPException(
            status_code=400,
            detail="Kwota przelewu może mieć maksymalnie dwa miejsca po przecinku.",
        )

    _, _, suggested_transfers, _ = serialize_expense_state(db, apartment_id)
    matching_transfer = next(
        (
            transfer
            for transfer in suggested_transfers
            if transfer["fromUserId"] == current_user.id
            and transfer["toUserId"] == data.recipient_user_id
            and Decimal(str(transfer["amount"])) == data.amount
        ),
        None,
    )
    if not matching_transfer:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ten przelew nie jest już aktualny. Odśwież saldo i sprawdź nowe propozycje.",
        )

    payment = TransferPayment(
        apartment_id=apartment_id,
        from_user_id=current_user.id,
        from_name=current_user.name,
        to_user_id=matching_transfer["toUserId"],
        to_name=matching_transfer["toName"],
        amount=data.amount,
    )
    db.add(payment)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Nie udało się zapisać zrealizowanego przelewu. Odśwież saldo.",
        )

    apartment = db.query(Apartment).filter(Apartment.id == apartment_id).first()
    return serialize_apartment_state(db, apartment, membership.role)


@app.post("/api/apartments/{apartment_id}/transfer-admin")
def transfer_apartment_admin(
    apartment_id: str,
    data: TransferAdminRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current_admin = require_admin(db, apartment_id, current_user.id)
    admin_count = (
        db.query(ApartmentMember)
        .filter(
            ApartmentMember.apartment_id == apartment_id,
            ApartmentMember.role == "admin",
        )
        .count()
    )
    if admin_count != 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Lokal musi mieć dokładnie jednego administratora.",
        )

    new_admin = (
        db.query(ApartmentMember)
        .filter(
            ApartmentMember.apartment_id == apartment_id,
            ApartmentMember.user_id == data.user_id,
            ApartmentMember.role == "tenant",
        )
        .first()
    )
    if not new_admin:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Nie znaleziono lokatora w tym lokalu.",
        )

    current_admin.role = "tenant"
    new_admin.role = "admin"
    db.commit()

    apartment = db.query(Apartment).filter(Apartment.id == apartment_id).first()
    return serialize_apartment_state(db, apartment, "tenant")


@app.delete("/api/apartments/{apartment_id}/members/{user_id}")
def remove_apartment_member(
    apartment_id: str,
    user_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_admin(db, apartment_id, current_user.id)
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Nie możesz usunąć siebie jako administratora. Przekaż najpierw tę rolę.",
        )

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
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ten użytkownik nie należy do lokalu.",
        )
    if membership.role == "admin":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Roli administratora nie można usunąć. Przekaż ją innemu lokatorowi.",
        )

    ensure_current_rent_period(db, apartment_id)
    db.query(Room).filter(
        Room.apartment_id == apartment_id,
        Room.tenant_user_id == user_id,
    ).update({Room.tenant_user_id: None}, synchronize_session=False)
    db.delete(membership)
    db.commit()
    ensure_current_rent_period(db, apartment_id)

    apartment = db.query(Apartment).filter(Apartment.id == apartment_id).first()
    return serialize_apartment_state(db, apartment, "admin")


@app.delete("/api/apartments/{apartment_id}/leave")
def leave_apartment(
    apartment_id: str,
    confirm_empty_apartment: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    membership = require_member(db, apartment_id, current_user.id)
    member_count = (
        db.query(ApartmentMember)
        .filter(ApartmentMember.apartment_id == apartment_id)
        .count()
    )

    if member_count == 1:
        if not confirm_empty_apartment:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Jesteś jedynym członkiem lokalu. Potwierdź opuszczenie i usunięcie lokalu wraz z danymi.",
            )
        db.query(RentAllocation).filter(
            RentAllocation.period_id.in_(
                db.query(RentPeriod.id).filter(RentPeriod.apartment_id == apartment_id)
            )
        ).delete(synchronize_session=False)
        db.query(RentPeriodExclusion).filter(
            RentPeriodExclusion.period_id.in_(
                db.query(RentPeriod.id).filter(RentPeriod.apartment_id == apartment_id)
            )
        ).delete(synchronize_session=False)
        db.query(RentPeriod).filter(RentPeriod.apartment_id == apartment_id).delete(
            synchronize_session=False
        )
        db.query(RentSettings).filter(
            RentSettings.apartment_id == apartment_id
        ).delete(synchronize_session=False)
        db.query(ExpenseShare).filter(
            ExpenseShare.expense_id.in_(
                db.query(Expense.id).filter(Expense.apartment_id == apartment_id)
            )
        ).delete(synchronize_session=False)
        db.query(Expense).filter(Expense.apartment_id == apartment_id).delete(
            synchronize_session=False
        )
        db.query(TransferPayment).filter(
            TransferPayment.apartment_id == apartment_id
        ).delete(synchronize_session=False)
        db.query(Invite).filter(Invite.apartment_id == apartment_id).delete(
            synchronize_session=False
        )
        db.query(Room).filter(Room.apartment_id == apartment_id).delete(
            synchronize_session=False
        )
        db.delete(membership)
        db.query(Apartment).filter(Apartment.id == apartment_id).delete(
            synchronize_session=False
        )
        db.commit()
        return {"detail": "Opuszczono lokal i usunięto jego dane."}

    if membership.role == "admin":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Przed opuszczeniem lokalu przekaż rolę administratora innemu lokatorowi.",
        )

    ensure_current_rent_period(db, apartment_id)
    db.query(Room).filter(
        Room.apartment_id == apartment_id,
        Room.tenant_user_id == current_user.id,
    ).update({Room.tenant_user_id: None}, synchronize_session=False)
    db.delete(membership)
    db.commit()
    ensure_current_rent_period(db, apartment_id)
    return {"detail": "Opuszczono lokal."}


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

def normalize_room_area(area: float) -> Decimal:
    if not math.isfinite(area) or area < 0.01 or area > 9999.99:
        raise HTTPException(
            status_code=400,
            detail="Metraż pokoju musi wynosić od 0,01 do 9999,99 m².",
        )
    return Decimal(str(area)).quantize(Decimal("0.01"))


@app.post("/api/apartments/{apartment_id}/rooms", status_code=status.HTTP_201_CREATED)
def add_room(
    apartment_id: str,
    data: CreateRoomRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_admin(db, apartment_id, current_user.id)
    ensure_current_rent_period(db, apartment_id)

    trimmed_name = data.name.strip()
    if not trimmed_name:
        raise HTTPException(status_code=400, detail="Podaj nazwę pokoju.")
    area_m2 = normalize_room_area(data.area)

    if data.tenant_user_id:
        require_member(db, apartment_id, data.tenant_user_id)

    room = Room(
        apartment_id=apartment_id,
        name=trimmed_name,
        area_m2=area_m2,
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
    period = ensure_current_rent_period(db, apartment_id)
    if period and data.tenant_user_id:
        set_rent_period_inclusion(
            db,
            period,
            data.tenant_user_id,
            data.include_in_current_rent,
        )
        ensure_current_rent_period(db, apartment_id)

    apt = db.query(Apartment).filter(Apartment.id == apartment_id).first()
    return serialize_apartment_state(db, apt, "admin")


@app.patch("/api/apartments/{apartment_id}/rooms/{room_id}")
def update_room(
    apartment_id: str,
    room_id: str,
    data: UpdateRoomRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_admin(db, apartment_id, current_user.id)
    ensure_current_rent_period(db, apartment_id)

    trimmed_name = data.name.strip()
    if not trimmed_name:
        raise HTTPException(status_code=400, detail="Podaj nazwę pokoju.")

    room = (
        db.query(Room)
        .filter(Room.id == room_id, Room.apartment_id == apartment_id)
        .first()
    )
    if not room:
        raise HTTPException(status_code=404, detail="Nie znaleziono pokoju.")

    room.name = trimmed_name
    room.area_m2 = normalize_room_area(data.area)
    db.commit()
    ensure_current_rent_period(db, apartment_id)

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
    ensure_current_rent_period(db, apartment_id)

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
    period = ensure_current_rent_period(db, apartment_id)
    if period and data.tenant_user_id:
        set_rent_period_inclusion(
            db,
            period,
            data.tenant_user_id,
            data.include_in_current_rent,
        )
        ensure_current_rent_period(db, apartment_id)

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
    ensure_current_rent_period(db, apartment_id)

    room = (
        db.query(Room)
        .filter(Room.id == room_id, Room.apartment_id == apartment_id)
        .first()
    )
    if not room:
        raise HTTPException(status_code=404, detail="Nie znaleziono pokoju.")

    db.delete(room)
    db.commit()
    ensure_current_rent_period(db, apartment_id)

    apt = db.query(Apartment).filter(Apartment.id == apartment_id).first()
    return serialize_apartment_state(db, apt, "admin")