"""One-time native model export and parity verification; does not retrain models.

Only run on the trusted repository model pickles. Deployment loads the exported
native JSON artifacts and NumPy isotonic thresholds, never these source pickles.
"""
from __future__ import annotations
import argparse
import csv
from datetime import datetime, timezone
import json
import pickle
from pathlib import Path
import random
import sys
import numpy as np
from xgboost import XGBClassifier
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'services' / 'digital-twin'))
from portable import SOURCE_FILES, MANIFEST_NAME, PortableIsotonic, load_portable_models, sha256


def sample_real_vectors(table_path, feature_names, per_patient=5):
    """Deterministic reservoir across every patient's full recorded history."""
    rng = random.Random(2026)
    samples, counts = {}, {}
    with Path(table_path).open(encoding='utf-8') as stream:
        for row in csv.DictReader(stream):
            pid = row['person_id']
            counts[pid] = counts.get(pid, 0) + 1
            bucket = samples.setdefault(pid, [])
            vector = [float(row[name]) for name in feature_names]
            if len(bucket) < per_patient:
                bucket.append(vector)
            else:
                index = rng.randrange(counts[pid])
                if index < per_patient:
                    bucket[index] = vector
    return np.asarray([v for pid in sorted(samples) for v in samples[pid]], dtype=np.float32), len(samples)


def export_models(model_dir, table_path, calibrator=None, trajectory=None):
    model_dir = Path(model_dir)
    # Fingerprint originals before loading to ensure the export reflects a stable source.
    source_hashes = {name: sha256(model_dir / name) for name in SOURCE_FILES}
    if calibrator is None:
        with (model_dir / 'calibrator.pkl').open('rb') as handle:
            calibrator = pickle.load(handle)
    if trajectory is None:
        with (model_dir / 'trajectory_regressor.pkl').open('rb') as handle:
            trajectory = pickle.load(handle)
    trajectory.n_jobs = 1
    for estimator in trajectory.estimators_:
        estimator.set_params(n_jobs=1)
    if len(trajectory.estimators_) != 8 or calibrator.out_of_bounds != 'clip':
        raise ValueError('Expected eight trajectory models and clipped isotonic calibration.')
    isotonic = {'format_version': 1, 'out_of_bounds': 'clip',
                'input_dtype': str(calibrator.X_thresholds_.dtype),
                'x_thresholds': calibrator.X_thresholds_.tolist(),
                'y_thresholds': calibrator.y_thresholds_.tolist()}
    (model_dir / 'isotonic_calibrator.json').write_text(json.dumps(isotonic, indent=2) + '\n', encoding='utf-8')
    export_names = ['isotonic_calibrator.json']
    for horizon, estimator in zip(range(15, 121, 15), trajectory.estimators_):
        name = f'trajectory_{horizon}m.json'
        estimator.save_model(model_dir / name)
        export_names.append(name)
    manifest = {'format_version': 1, 'created_at': datetime.now(timezone.utc).isoformat(),
                'horizons_minutes': list(range(15, 121, 15)),
                'source_sha256': source_hashes,
                'export_sha256': {name: sha256(model_dir / name) for name in export_names}}
    manifest_path = model_dir / MANIFEST_NAME
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    try:
        portable_calibrator, portable_trajectory, _ = load_portable_models(model_dir, require_parity=False)
        feature_names = json.loads((model_dir / 'feature_names.json').read_text())
        vectors, patient_count = sample_real_vectors(table_path, feature_names)
        classifier = XGBClassifier(n_jobs=1)
        classifier.load_model(model_dir / 'classifier.json')
        classifier.set_params(n_jobs=1)
        probabilities = classifier.predict_proba(vectors)[:, 1]
        # Also verify clipping and interpolation at knots and midpoints.
        knots = np.asarray(calibrator.X_thresholds_)
        calibration_probes = np.concatenate([probabilities, [-1., 0., 1., 2.], knots, (knots[1:] + knots[:-1]) / 2])
        legacy_calibration = calibrator.predict(calibration_probes)
        native_calibration = portable_calibrator.predict(calibration_probes)
        legacy_trajectory = trajectory.predict(vectors)
        native_trajectory = portable_trajectory.predict(vectors)
        np.testing.assert_allclose(native_calibration, legacy_calibration, rtol=0, atol=1e-6)
        np.testing.assert_allclose(native_trajectory, legacy_trajectory, rtol=0, atol=1e-4)
        if source_hashes != {name: sha256(model_dir / name) for name in SOURCE_FILES}:
            raise ValueError('Source files changed during export; retry after training finishes.')
        manifest['parity_verification'] = {
            'clinical_vectors': len(vectors), 'patients': patient_count,
            'calibration_probes': len(calibration_probes),
            'max_calibrated_probability_abs_error': float(np.max(np.abs(native_calibration - legacy_calibration))),
            'max_trajectory_abs_error_mg_dl': float(np.max(np.abs(native_trajectory - legacy_trajectory))),
            'method': 'Deterministic per-patient reservoir across real cohort feature table; calibration knots, midpoints and out-of-bounds clipping.'}
        manifest_path.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    except Exception:
        # A failed verification must never leave a deployable manifest behind.
        manifest_path.unlink(missing_ok=True)
        raise
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model-dir', type=Path, default=ROOT / 'data' / 'digital_twin' / 'model')
    parser.add_argument('--table', type=Path, default=ROOT / 'data' / 'digital_twin' / 'training' / 'examples.csv')
    args = parser.parse_args()
    print(json.dumps(export_models(args.model_dir, args.table)['parity_verification'], indent=2))


if __name__ == '__main__':
    main()
