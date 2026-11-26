import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
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
