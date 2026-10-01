"""Request bodies. Responses are plain dicts built by the services so their shape is explicit there."""
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid')


class LoginIn(Strict):
    username: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=1, max_length=256)


Title = Literal['Super Administrator', 'Placement Administrator', 'Placement Officer', 'School Administrator']
EMAIL = r'^[^@\s]+@[^@\s]+\.[^@\s]+$'


class RegisterIn(Strict):
    name: str = Field(min_length=2, max_length=128)
    email: str = Field(pattern=EMAIL, max_length=128)
    password: str = Field(min_length=8, max_length=256)
    role: Literal['Placement Officer', 'School Administrator']
    department: str | None = Field(default=None, max_length=128)


class ProfilePatch(Strict):
    display_name: str | None = Field(default=None, min_length=2, max_length=128)
    department: str | None = Field(default=None, max_length=128)


class PasswordChangeIn(Strict):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=8, max_length=256)


class UserCreate(Strict):
    name: str = Field(min_length=2, max_length=128)
    email: str = Field(pattern=EMAIL, max_length=128)
    role: Title
    department: str | None = Field(default=None, max_length=128)


class UserPatch(Strict):
    display_name: str | None = Field(default=None, min_length=2, max_length=128)
    department: str | None = Field(default=None, max_length=128)
    role: Title | None = None
    is_active: bool | None = None


class SeedIn(Strict):
    fixture: str = 'demo_200'
    reset: bool = False


class ResetIn(Strict):
    confirm: Literal[True]


class OfferPatch(Strict):
    expected_input_version: int
    capacity: int | None = Field(default=None, ge=0, le=100000)
    min_overall: float | None = Field(default=None, ge=0, le=100)
    subject_min_math: float | None = Field(default=None, ge=0, le=100)
    subject_min_science: float | None = Field(default=None, ge=0, le=100)
    subject_min_language: float | None = Field(default=None, ge=0, le=100)
    clear_subject_minimums: list[Literal['math', 'science', 'language']] = []


class RulesPatch(Strict):
    expected_input_version: int
    allow_unlisted_fallback: bool | None = None
    rule_version: str | None = Field(default=None, min_length=1, max_length=64)


class StudentPatch(Strict):
    expected_input_version: int
    overall_score: float | None = Field(default=None, ge=0, le=100)
    math_score: float | None = Field(default=None, ge=0, le=100)
    science_score: float | None = Field(default=None, ge=0, le=100)
    language_score: float | None = Field(default=None, ge=0, le=100)
    allow_fallback: bool | None = None


class RunIn(Strict):
    cohort_id: str
    expected_input_version: int
    mode: Literal['AI', 'RULES_ONLY'] = 'AI'
    model_key: str | None = None


class SimulateIn(Strict):
    mode: Literal['AI', 'RULES_ONLY'] = 'AI'
    model_key: str | None = None
    capacity_overrides: dict[str, int] = {}


class WhatIfIn(Strict):
    student_id: str
    overall_score: float | None = Field(default=None, ge=0, le=100)
    math_score: float | None = Field(default=None, ge=0, le=100)
    science_score: float | None = Field(default=None, ge=0, le=100)
    language_score: float | None = Field(default=None, ge=0, le=100)
    model_key: str | None = None


class DecisionIn(Strict):
    action: Literal['approve', 'change', 'reject', 'assign']
    expected_revision: int
    offer_id: str | None = None
    reason: str | None = Field(default=None, max_length=1000)
    allow_below_cutoff: bool = False   # assign only: confirm an eligibility exception


class BulkApproveIn(Strict):
    expected_run_revision: int


class ActiveModelIn(Strict):
    model_key: str
