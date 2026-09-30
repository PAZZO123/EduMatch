"""Loads every trusted model listed in ml/models/registry.json once at startup.

* Each artifact's SHA-256 must match the registry before joblib is allowed to unpickle it
  (joblib files can execute code, so only the team's own hashed artifacts are loaded).
* Feature order is checked against the backend's feature contract.
* A failed load never falls back to random scores: the model is reported unavailable and
  runs switch to explicitly labelled RULES_ONLY mode (SRS failure behaviour).
"""
import hashlib
import json
import logging
import threading
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd

from .domain.records import FEATURES

log = logging.getLogger('edumatch.model')


@dataclass
class LoadedModel:
    key: str
    model_version: str
    display_name: str
    sha256: str
    metadata: dict
    estimator: object = field(repr=False)

    def score(self, features: np.ndarray) -> np.ndarray:
        frame = pd.DataFrame(np.asarray(features, dtype=float).reshape(-1, len(FEATURES)), columns=FEATURES)
        return np.clip(self.estimator.predict(frame), 0.0, 1.0)

    @property
    def explainable(self) -> bool:
        return hasattr(self.estimator, 'coef_') and hasattr(self.estimator, 'intercept_')

    def breakdown(self, features: list[float]) -> dict | None:
        """Exact additive decomposition of a linear model's score, in fit-score points (0-100).
        Returns None for non-linear models, whose scores have no exact per-feature split."""
        if not self.explainable:
            return None
        coef, intercept = np.ravel(self.estimator.coef_), float(np.ravel([self.estimator.intercept_])[0])
        parts = {name: round(100 * float(c * v), 2) for name, c, v in zip(FEATURES, coef, features)}
        raw = 100 * (intercept + float(np.dot(coef, features)))
        return {'method': 'exact linear decomposition', 'baseline': round(100 * intercept, 2),
                'contributions': parts, 'weights': {n: round(float(c), 4) for n, c in zip(FEATURES, coef)},
                'total': round(min(max(raw, 0.0), 100.0), 2)}


class ModelRegistry:
    def __init__(self, model_dir: Path, preferred: str | None = None):
        self.model_dir = Path(model_dir)
        self.models: dict[str, LoadedModel] = {}
        self.errors: dict[str, str] = {}
        self.champion: str | None = None
        self.registry: dict = {}
        self._active: str | None = None
        self._lock = threading.Lock()
        self._load(preferred)

    def _load(self, preferred):
        path = self.model_dir / 'registry.json'
        try:
            self.registry = json.loads(path.read_text(encoding='utf-8'))
        except Exception as exc:  # noqa: BLE001
            self.errors['registry'] = f'Cannot read {path.name}: {exc.__class__.__name__}'
            log.error('model registry unavailable: %s', exc)
            return
        if self.registry.get('feature_order') != FEATURES:
            self.errors['registry'] = 'Feature order in registry does not match backend contract.'
            return
        import joblib
        for entry in self.registry.get('models', []):
            key = entry['key']
            try:
                file = self.model_dir / entry['path']
                digest = hashlib.sha256(file.read_bytes()).hexdigest()
                if digest != entry['sha256']:
                    raise ValueError('SHA-256 mismatch — artifact is not the trusted build')
                meta = json.loads((self.model_dir / entry['metadata']).read_text(encoding='utf-8'))
                if meta.get('feature_order') != FEATURES:
                    raise ValueError('feature order mismatch')
                model = LoadedModel(key, entry['model_version'], entry['display_name'], digest, meta, joblib.load(file))
                model.score(np.zeros((1, len(FEATURES))))          # smoke-test inference
                self.models[key] = model
            except Exception as exc:  # noqa: BLE001
                self.errors[key] = f'{exc.__class__.__name__}: {exc}'
                log.error('model %s failed to load: %s', key, exc)
        self.champion = self.registry.get('champion')
        for candidate in (preferred, self.champion, *self.models):
            if candidate in self.models:
                self._active = candidate
                break

    @property
    def active(self) -> LoadedModel | None:
        return self.models.get(self._active) if self._active else None

    def set_active(self, key: str) -> LoadedModel:
        with self._lock:
            if key not in self.models:
                raise KeyError(key)
            self._active = key
            return self.models[key]

    def get(self, key: str | None) -> LoadedModel | None:
        return self.active if key is None else self.models.get(key)

    def status(self) -> dict:
        m = self.active
        base = {'loaded': m is not None, 'mode': 'AI' if m else 'RULES_ONLY',
                'label': 'Local model loaded' if m else 'AI unavailable',
                'champion': self.champion, 'available_models': sorted(self.models),
                'load_errors': self.errors, 'feature_schema': FEATURES,
                'target_formula': self.registry.get('target_formula'), 'synthetic': True,
                'selection_rule': self.registry.get('selection_rule')}
        if m:
            meta = m.metadata
            base.update({'model_key': m.key, 'model_version': m.model_version, 'display_name': m.display_name,
                         'algorithm': meta.get('algorithm'), 'sha256': m.sha256,
                         'training_source': meta.get('training_source'), 'train_students_used': meta.get('train_students_used'),
                         'train_pairs_used': meta.get('train_pairs_used'), 'fixed_seed': meta.get('fixed_seed'),
                         'metrics': meta.get('metrics'), 'versions': meta.get('versions'),
                         'evaluation_scope': meta.get('evaluation_scope')})
        return base

    def catalog(self) -> list[dict]:
        rows = []
        for entry in self.registry.get('models', []):
            m = self.models.get(entry['key'])
            meta = m.metadata if m else {}
            rows.append({'model_key': entry['key'], 'display_name': entry['display_name'],
                         'model_version': entry['model_version'], 'loaded': m is not None,
                         'active': entry['key'] == self._active, 'champion': entry['key'] == self.champion,
                         'algorithm': meta.get('algorithm'), 'description': meta.get('description'),
                         'metrics': meta.get('metrics'), 'fit_seconds': meta.get('fit_seconds'),
                         'model_bytes': meta.get('model_bytes'), 'error': self.errors.get(entry['key'])})
        return rows
