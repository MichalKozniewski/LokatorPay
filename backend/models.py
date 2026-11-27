import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)

from database import Base


def new_id() -> str:
    return str(uuid.uuid4())


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=new_id)
    name = Column(String(120), nullable=False)
    email = Column(String(320), nullable=False, unique=True, index=True)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)


class Apartment(Base):
    __tablename__ = "apartments"

    id = Column(String(36), primary_key=True, default=new_id)
    name = Column(String(160), nullable=False)
    address = Column(String(300))
    created_by = Column(String(36), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)


class ApartmentMember(Base):
    __tablename__ = "apartment_members"
    __table_args__ = (
        UniqueConstraint("apartment_id", "user_id", name="uq_apartment_member"),
        CheckConstraint("role IN ('admin', 'tenant')", name="ck_apartment_member_role"),
    )

    id = Column(String(36), primary_key=True, default=new_id)
    apartment_id = Column(
        String(36), ForeignKey("apartments.id", ondelete="CASCADE"), nullable=False
    )
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(16), nullable=False)
    joined_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)


class Invite(Base):
    __tablename__ = "invites"

    token = Column(String(64), primary_key=True)
    apartment_id = Column(
        String(36), ForeignKey("apartments.id", ondelete="CASCADE"), nullable=False
    )
    email = Column(String(320))
    created_by = Column(String(36), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    used_at = Column(DateTime(timezone=True))
    used_by = Column(String(36), ForeignKey("users.id"))


class Room(Base):
    __tablename__ = "rooms"
    __table_args__ = (
        UniqueConstraint("apartment_id", "tenant_user_id", name="uq_room_tenant_per_apartment"),
        CheckConstraint("area_m2 > 0", name="ck_room_area_positive"),
    )

    id = Column(String(36), primary_key=True, default=new_id)
    apartment_id = Column(
        String(36), ForeignKey("apartments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name = Column(String(100), nullable=False)
    area_m2 = Column(Numeric(6, 2), nullable=False)
    tenant_user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"))
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)


class RentSettings(Base):
    __tablename__ = "rent_settings"
    __table_args__ = (
        CheckConstraint("billing_start_day BETWEEN 1 AND 28", name="ck_rent_billing_start_day"),
        CheckConstraint("rent_amount > 0", name="ck_rent_amount_positive"),
    )

    apartment_id = Column(
        String(36),
        ForeignKey("apartments.id", ondelete="CASCADE"),
        primary_key=True,
    )
    rent_amount = Column(Numeric(10, 2), nullable=False)
    billing_start_day = Column(Integer, nullable=False, default=1)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)


class RentPeriod(Base):
    __tablename__ = "rent_periods"
    __table_args__ = (
        UniqueConstraint("apartment_id", "starts_on", name="uq_rent_period_apartment_start"),
    )

    id = Column(String(36), primary_key=True, default=new_id)
    apartment_id = Column(
        String(36), ForeignKey("apartments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    starts_on = Column(Date, nullable=False)
    ends_on = Column(Date, nullable=False)
    rent_amount = Column(Numeric(10, 2), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)


class RentAllocation(Base):
    __tablename__ = "rent_allocations"
    __table_args__ = (
        UniqueConstraint("period_id", "tenant_user_id", name="uq_rent_allocation_period_tenant"),
    )

    id = Column(String(36), primary_key=True, default=new_id)
    period_id = Column(
        String(36), ForeignKey("rent_periods.id", ondelete="CASCADE"), nullable=False, index=True
    )
    tenant_user_id = Column(String(36), nullable=False)
    tenant_name = Column(String(120), nullable=False)
    tenant_email = Column(String(320), nullable=False)
    room_id = Column(String(36), nullable=False)
    room_name = Column(String(100), nullable=False)
    area_m2 = Column(Numeric(6, 2), nullable=False)
    amount = Column(Numeric(10, 2), nullable=False)


class RentPeriodExclusion(Base):
    __tablename__ = "rent_period_exclusions"

    period_id = Column(
        String(36),
        ForeignKey("rent_periods.id", ondelete="CASCADE"),
        primary_key=True,
    )
    tenant_user_id = Column(String(36), primary_key=True)


class Expense(Base):
    __tablename__ = "expenses"
    __table_args__ = (
        CheckConstraint("amount >= 0.01", name="ck_expense_amount_positive"),
    )

    id = Column(String(36), primary_key=True, default=new_id)
    apartment_id = Column(
        String(36), ForeignKey("apartments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    description = Column(String(200), nullable=False)
    amount = Column(Numeric(10, 2), nullable=False)
    payer_user_id = Column(String(36), nullable=False)
    payer_name = Column(String(120), nullable=False)
    payer_email = Column(String(320), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)


class ExpenseShare(Base):
    __tablename__ = "expense_shares"
    __table_args__ = (
        UniqueConstraint("expense_id", "participant_user_id", name="uq_expense_share_participant"),
        CheckConstraint("amount_owed >= 0", name="ck_expense_share_nonnegative"),
    )

    id = Column(String(36), primary_key=True, default=new_id)
    expense_id = Column(
        String(36), ForeignKey("expenses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    participant_user_id = Column(String(36), nullable=False)
    participant_name = Column(String(120), nullable=False)
    participant_email = Column(String(320), nullable=False)
    amount_owed = Column(Numeric(10, 2), nullable=False)


class TransferPayment(Base):
    __tablename__ = "transfer_payments"
    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_transfer_payment_amount_positive"),
    )

    id = Column(String(36), primary_key=True, default=new_id)
    apartment_id = Column(
        String(36), ForeignKey("apartments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    from_user_id = Column(String(36), nullable=False)
    from_name = Column(String(120), nullable=False)
    to_user_id = Column(String(36), nullable=False)
    to_name = Column(String(120), nullable=False)
    amount = Column(Numeric(10, 2), nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
