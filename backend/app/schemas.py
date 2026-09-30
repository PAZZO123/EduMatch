"""Request bodies. Responses are plain dicts built by the services so their shape is explicit there."""
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid')


class LoginIn(Strict):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


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
    action: Literal['approve', 'change', 'reject']
    expected_revision: int
    offer_id: str | None = None
    reason: str | None = Field(default=None, max_length=1000)


class BulkApproveIn(Strict):
    expected_run_revision: int


class ActiveModelIn(Strict):
    model_key: str
