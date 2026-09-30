"""Plain, immutable input records used by the pure domain layer (no DB, no HTTP)."""
from dataclasses import dataclass, field

SUBJECTS = ('math', 'science', 'language')
FEATURES = ['overall_norm', 'subject_fit', 'eligibility_margin', 'same_province']

DEFAULT_RULES = {
    'rule_version': 'demo-policy-v1',
    'synthetic': True,
    'score_scale': '0-100',
    'score_direction': 'higher_better',
    'priority': 'overall_desc_then_student_id_asc',
    'allow_unlisted_fallback': True,
    'allocation': 'serial_priority',
    'notice': 'Invented demonstration rules; not NESA-approved policy.',
}


@dataclass(frozen=True)
class StudentRec:
    student_id: str
    display_name: str
    province: str
    overall_score: float
    math_score: float
    science_score: float
    language_score: float
    allow_fallback: bool

    def subject(self, name: str) -> float:
        return getattr(self, f'{name}_score')


@dataclass(frozen=True)
class OfferRec:
    offer_id: str
    school_name: str
    province: str
    stage_programme: str
    capacity: int
    min_overall: float
    subject_min_math: float | None
    subject_min_science: float | None
    subject_min_language: float | None
    weight_math: float
    weight_science: float
    weight_language: float

    def subject_min(self, name: str) -> float | None:
        return getattr(self, f'subject_min_{name}')

    def weight(self, name: str) -> float:
        return getattr(self, f'weight_{name}')


@dataclass(frozen=True)
class PrefRec:
    student_id: str
    offer_id: str
    rank: int


@dataclass
class CohortInputs:
    students: list[StudentRec]
    offers: list[OfferRec]
    preferences: list[PrefRec]
    rules: dict = field(default_factory=lambda: dict(DEFAULT_RULES))

    @property
    def fallback_enabled(self) -> bool:
        return bool(self.rules.get('allow_unlisted_fallback', False))
