"""Portable native XGBoost/NumPy inference without sklearn pickle dependencies."""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
import numpy as np
from xgboost import XGBRegressor

SOURCE_FILES = ('classifier.json', 'calibrator.pkl', 'trajectory_regressor.pkl', 'feature_names.json', 'metrics.json')
MANIFEST_NAME = 'portable_manifest.json'


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class PortableIsotonic:
    def __init__(self, specification: dict):
        if specification.get('out_of_bounds') != 'clip':
            raise ValueError('Only clipped isotonic calibration is supported.')
        self.dtype = np.dtype(specification['input_dtype'])
        self.x = np.asarray(specification['x_thresholds'], dtype=self.dtype)
        self.y = np.asarray(specification['y_thresholds'], dtype=self.dtype)
        if self.x.ndim != 1 or len(self.x) != len(self.y) or len(self.x) < 2:
            raise ValueError('Invalid isotonic threshold dimensions.')
        if not np.isfinite(self.x).all() or not np.isfinite(self.y).all() or not np.all(np.diff(self.x) > 0) or np.any(np.diff(self.y) < 0):
            raise ValueError('Invalid isotonic threshold ordering or values.')

    def predict(self, values):
        values = np.asarray(values, dtype=self.dtype)
        return np.interp(values, self.x, self.y).astype(self.dtype)


class PortableTrajectory:
    def __init__(self, estimators):
        self.estimators_ = estimators
        self.n_jobs = 1

    def predict(self, values):
        return np.column_stack([estimator.predict(values) for estimator in self.estimators_])


def load_portable_models(model_dir: Path, require_parity: bool = True):
    """Reject missing/stale/corrupt portable exports before using any model."""
    manifest = json.loads((model_dir / MANIFEST_NAME).read_text(encoding='utf-8'))
    if manifest.get('format_version') != 1 or manifest.get('horizons_minutes') != list(range(15, 121, 15)):
        raise ValueError('Unsupported portable model manifest.')
    if set(manifest.get('source_sha256', {})) != set(SOURCE_FILES):
        raise ValueError('Incomplete portable source fingerprint.')
    for name in SOURCE_FILES:
        if sha256(model_dir / name) != manifest['source_sha256'][name]:
            raise ValueError(f'Portable model is stale: source fingerprint differs for {name}.')
    parity = manifest.get('parity_verification', {})
    if require_parity and (parity.get('clinical_vectors', 0) <= 0 or parity.get('max_calibrated_probability_abs_error', 1) > 1e-6 or parity.get('max_trajectory_abs_error_mg_dl', 1) > 1e-4):
        raise ValueError('Portable artifacts have no successful prediction parity verification.')
    trajectory_names = [f'trajectory_{h}m.json' for h in manifest['horizons_minutes']]
    expected_outputs = ['isotonic_calibrator.json'] + trajectory_names
    if set(manifest.get('export_sha256', {})) != set(expected_outputs):
        raise ValueError('Incomplete portable output fingerprint.')
    for name in expected_outputs:
        if sha256(model_dir / name) != manifest['export_sha256'][name]:
            raise ValueError(f'Portable artifact failed integrity check: {name}.')
    calibrator = PortableIsotonic(json.loads((model_dir / 'isotonic_calibrator.json').read_text()))
    estimators = []
    for name in trajectory_names:
        estimator = XGBRegressor(n_jobs=1)
        estimator.load_model(model_dir / name)
        estimator.set_params(n_jobs=1)
        estimators.append(estimator)
    return calibrator, PortableTrajectory(estimators), manifest
