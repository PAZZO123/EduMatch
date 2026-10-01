"""Persistent entities (SRS §10). Integrity that the database can enforce, it does:
composite foreign keys reject orphan preferences, and a partial unique index guarantees
at most one APPROVED placement per cohort/student even if application checks were bypassed."""
import uuid
from datetime import datetime, timezone

from sqlalchemy import (JSON, Boolean, DateTime, Float, ForeignKey, ForeignKeyConstraint, Index, Integer,
                        String, Text, UniqueConstraint, text)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = 'users'
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(128), unique=True)   # sign-in name (an email for UI accounts)
    display_name: Mapped[str] = mapped_column(String(128))
    role: Mapped[str] = mapped_column(String(16))            # ADMIN | OFFICER | VIEWER (enforced server-side)
    title: Mapped[str] = mapped_column(String(64), default='')   # UI role label, e.g. "Placement Officer"
    department: Mapped[str] = mapped_column(String(128), default='')
    password_hash: Mapped[str] = mapped_column(String(256))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_via: Mapped[str] = mapped_column(String(16), default='SEED')   # SEED | ADMIN | SELF
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AuthSession(Base):
    __tablename__ = 'auth_sessions'
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'))
    csrf_token: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    user: Mapped[User] = relationship(lazy='joined')


class Cohort(Base):
    __tablename__ = 'cohorts'
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    source_label: Mapped[str] = mapped_column(String(128))       # e.g. SEED:demo_200 or IMPORT
    synthetic: Mapped[bool] = mapped_column(Boolean, default=True)
    input_version: Mapped[int] = mapped_column(Integer, default=1)
    rules: Mapped[dict] = mapped_column(JSON)
    checksum: Mapped[str] = mapped_column(String(64))
    validation_status: Mapped[str] = mapped_column(String(16), default='VALID')
    original_snapshot: Mapped[dict] = mapped_column(JSON)          # restored by reset
    active_run_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    @property
    def rule_version(self) -> str:
        return self.rules.get('rule_version', 'unknown')


class Student(Base):
    __tablename__ = 'students'
    cohort_id: Mapped[str] = mapped_column(ForeignKey('cohorts.id', ondelete='CASCADE'), primary_key=True)
    student_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(128))
    province: Mapped[str] = mapped_column(String(64))
    overall_score: Mapped[float] = mapped_column(Float)
    math_score: Mapped[float] = mapped_column(Float)
    science_score: Mapped[float] = mapped_column(Float)
    language_score: Mapped[float] = mapped_column(Float)
    allow_fallback: Mapped[bool] = mapped_column(Boolean)


class Offer(Base):
    __tablename__ = 'offers'
    cohort_id: Mapped[str] = mapped_column(ForeignKey('cohorts.id', ondelete='CASCADE'), primary_key=True)
    offer_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    school_name: Mapped[str] = mapped_column(String(128))
    province: Mapped[str] = mapped_column(String(64))
    stage_programme: Mapped[str] = mapped_column(String(64))
    capacity: Mapped[int] = mapped_column(Integer)
    min_overall: Mapped[float] = mapped_column(Float)
    subject_min_math: Mapped[float | None] = mapped_column(Float, nullable=True)
    subject_min_science: Mapped[float | None] = mapped_column(Float, nullable=True)
    subject_min_language: Mapped[float | None] = mapped_column(Float, nullable=True)
    weight_math: Mapped[float] = mapped_column(Float)
    weight_science: Mapped[float] = mapped_column(Float)
    weight_language: Mapped[float] = mapped_column(Float)


class Preference(Base):
    __tablename__ = 'preferences'
    cohort_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    student_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    rank: Mapped[int] = mapped_column(Integer, primary_key=True)
    offer_id: Mapped[str] = mapped_column(String(64))
    __table_args__ = (
        ForeignKeyConstraint(['cohort_id', 'student_id'], ['students.cohort_id', 'students.student_id'], ondelete='CASCADE'),
        ForeignKeyConstraint(['cohort_id', 'offer_id'], ['offers.cohort_id', 'offers.offer_id'], ondelete='CASCADE'),
        UniqueConstraint('cohort_id', 'student_id', 'offer_id', name='uq_pref_choice'),
    )


class PlacementRun(Base):
    __tablename__ = 'placement_runs'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    cohort_id: Mapped[str] = mapped_column(ForeignKey('cohorts.id', ondelete='CASCADE'), index=True)
    status: Mapped[str] = mapped_column(String(16))   # GENERATED | UNDER_REVIEW | COMPLETED | STALE | SUPERSEDED
    mode: Mapped[str] = mapped_column(String(16))     # AI | RULES_ONLY
    input_version: Mapped[int] = mapped_column(Integer)
    rule_version: Mapped[str] = mapped_column(String(64))
    model_key: Mapped[str | None] = mapped_column(String(64), nullable=True)
    model_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    model_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    metrics: Mapped[dict] = mapped_column(JSON)
    runtime_ms: Mapped[float] = mapped_column(Float)
    invariants: Mapped[dict] = mapped_column(JSON)
    stale_reason: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_by: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    proposals: Mapped[list['Proposal']] = relationship(back_populates='run', cascade='all, delete-orphan')


class Proposal(Base):
    __tablename__ = 'proposals'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    run_id: Mapped[str] = mapped_column(ForeignKey('placement_runs.id', ondelete='CASCADE'))
    cohort_id: Mapped[str] = mapped_column(String(64))
    student_id: Mapped[str] = mapped_column(String(64))
    offer_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(16))   # DRAFT | CHANGED | APPROVED | REJECTED | UNASSIGNED
    priority_position: Mapped[int] = mapped_column(Integer)
    preference_rank: Mapped[int | None] = mapped_column(Integer, nullable=True)
    fallback_used: Mapped[bool] = mapped_column(Boolean, default=False)
    fit_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    reason_code: Mapped[str] = mapped_column(String(48))
    reason_codes: Mapped[list] = mapped_column(JSON)
    trace: Mapped[list] = mapped_column(JSON)
    engine_offer_id: Mapped[str | None] = mapped_column(String(64), nullable=True)   # what the engine proposed
    released_offer_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    decision_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewer: Mapped[str | None] = mapped_column(String(64), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Officer assignment of an unplaced student may deliberately go beyond the default rules. Each flag is a
    # recorded, reasoned exception that the plan checker accepts (capacity and uniqueness never have exceptions).
    override_preference: Mapped[bool] = mapped_column(Boolean, default=False)    # school not among the student's choices
    override_eligibility: Mapped[bool] = mapped_column(Boolean, default=False)   # student below the school's entry rules
    run: Mapped[PlacementRun] = relationship(back_populates='proposals')
    __table_args__ = (
        UniqueConstraint('run_id', 'student_id', name='uq_run_student'),
        Index('ix_proposal_run_status', 'run_id', 'status'),
        Index('uq_one_approved_per_student', 'cohort_id', 'student_id', unique=True,
              sqlite_where=text("status = 'APPROVED'")),
    )


class AuditEvent(Base):
    """Append-only history. No foreign keys, so it survives run/cohort resets."""
    __tablename__ = 'audit_events'
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    actor: Mapped[str] = mapped_column(String(64))
    role: Mapped[str] = mapped_column(String(16))
    action: Mapped[str] = mapped_column(String(32))
    cohort_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    run_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    proposal_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    student_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    old_offer_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    new_offer_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    details: Mapped[dict] = mapped_column(JSON, default=dict)


class PlacementHistory(Base):
    """Permanent snapshot of a placement run and every student's result. Written when a run completes, is
    replaced by a newer run, or before a reset / re-import / delete removes it. No foreign keys, so it survives."""
    __tablename__ = 'placement_history'
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(String(36), unique=True)
    cohort_id: Mapped[str] = mapped_column(String(64), index=True)
    cohort_source: Mapped[str] = mapped_column(String(64))
    run_created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    run_created_by: Mapped[str] = mapped_column(String(128))
    archived_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    archived_reason: Mapped[str] = mapped_column(String(32))   # COMPLETED | SUPERSEDED | COHORT_RESET | COHORT_REPLACED | COHORT_DELETED
    run_status: Mapped[str] = mapped_column(String(16))
    mode: Mapped[str] = mapped_column(String(16))
    model_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    rule_version: Mapped[str] = mapped_column(String(64))
    input_version: Mapped[int] = mapped_column(Integer)
    runtime_ms: Mapped[float] = mapped_column(Float)
    metrics: Mapped[dict] = mapped_column(JSON)
    results: Mapped[list] = mapped_column(JSON)


RESERVING = ('DRAFT', 'CHANGED', 'APPROVED')   # statuses that hold a seat
