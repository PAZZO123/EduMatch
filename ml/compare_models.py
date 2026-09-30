"""Train, evaluate and compare several compatibility regressors on the EduMatch synthetic pairs.

Selection discipline
--------------------
* Every model is trained on the same student-grouped training subset (seed 42).
* Hyperparameters are fixed up front; nothing is tuned against validation or test.
* The champion is chosen on VALIDATION only (top-1 ranking accuracy, then MAE).
* Test metrics are reported for every model but never used for selection.

The target is the dataset's invented teaching formula. Nothing here measures real
NESA placement quality.

Usage:  python ml/compare_models.py [--max-train-students 2500]
"""
import argparse
import hashlib
import json
import platform
import sys
import time
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.dummy import DummyRegressor
from sklearn.ensemble import ExtraTreesRegressor, HistGradientBoostingRegressor, RandomForestRegressor
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LinearRegression
from sklearn.metrics import r2_score, roc_auc_score, average_precision_score
from sklearn.neighbors import KNeighborsRegressor
from sklearn.neural_network import MLPRegressor
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeRegressor

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'EduMatch_AI_Synthetic_Data'
sys.path.insert(0, str(DATA / 'tools'))
from common import FEATURES, allocate, allocation_metrics, load_csv, verify_plan  # noqa: E402

OUT = ROOT / 'ml'
SEED = 42
STRONG_MATCH = 0.65          # "strong match" cut-off on the 0-1 target (~median of eligible pairs)
NOISE_SIGMA = 0.05           # label noise for the robustness experiment
LEARNING_CURVE_SIZES = [100, 250, 500, 1000, 2500, 5000, 10000, 20000]

MODEL_INFO = {
    'linear_regression': ('Linear Regression', 'Ordinary least squares on the 4 features.'),
    'decision_tree': ('Decision Tree', 'Single CART tree, depth 12, min 5 samples per leaf.'),
    'random_forest': ('Random Forest (SRS)', 'SRS spec: 100 trees, depth 8, min 5 samples per leaf.'),
    'extra_trees': ('Extra Trees', '100 randomised trees, depth 12, min 5 samples per leaf.'),
    'hist_gradient_boosting': ('Gradient Boosting', 'Histogram GBM, up to 500 rounds, early stopping.'),
    'knn': ('k-Nearest Neighbours', 'k=15, distance-weighted, standardised features.'),
    'mlp': ('Neural Network (MLP)', '64-32 ReLU network, Adam, early stopping, standardised features.'),
}


def build_models():
    return {
        'mean_baseline': DummyRegressor(strategy='mean'),
        'linear_regression': LinearRegression(),
        'decision_tree': DecisionTreeRegressor(max_depth=12, min_samples_leaf=5, random_state=SEED),
        'random_forest': RandomForestRegressor(n_estimators=100, max_depth=8, min_samples_leaf=5,
                                               random_state=SEED, n_jobs=-1),
        'extra_trees': ExtraTreesRegressor(n_estimators=100, max_depth=12, min_samples_leaf=5,
                                           random_state=SEED, n_jobs=-1),
        'hist_gradient_boosting': HistGradientBoostingRegressor(max_iter=500, learning_rate=0.1,
                                                                early_stopping=True, random_state=SEED),
        'knn': make_pipeline(StandardScaler(), KNeighborsRegressor(n_neighbors=15, weights='distance')),
        'mlp': make_pipeline(StandardScaler(), MLPRegressor(hidden_layer_sizes=(64, 32), early_stopping=True,
                                                            max_iter=200, random_state=SEED)),
    }


def finalize(model):
    """Force single-threaded, deterministic inference after fitting."""
    est = model.steps[-1][1] if hasattr(model, 'steps') else model
    if 'n_jobs' in est.get_params():
        est.set_params(n_jobs=1)
    return model


def predict(model, frame):
    return np.clip(model.predict(frame[FEATURES]), 0, 1)


def load_split(split, student_ids=None):
    cols = ['student_id', 'offer_id'] + FEATURES + ['y_demo', 'eligible']
    path = DATA / 'model_training' / split / 'pairs.csv'
    if not path.exists():
        sys.exit(f'{path} is missing (kept out of git). Run: python ml/prepare_data.py')
    df = pd.read_csv(path, usecols=cols)
    df['eligible'] = df['eligible'].astype(str).str.lower() == 'true'
    if student_ids is not None:
        df = df[df.student_id.isin(student_ids)].reset_index(drop=True)
    return df


def sample_students(n):
    ids = [s['student_id'] for s in load_csv(DATA / 'model_training' / 'train' / 'students.csv')]
    n = len(ids) if n == 0 else min(n, len(ids))
    return set(np.random.default_rng(SEED).choice(ids, size=n, replace=False))


def confusion(actual, predicted):
    actual, predicted = np.asarray(actual, bool), np.asarray(predicted, bool)
    tp = int((actual & predicted).sum()); tn = int((~actual & ~predicted).sum())
    fp = int((~actual & predicted).sum()); fn = int((actual & ~predicted).sum())
    safe = lambda a, b: a / b if b else None
    precision, recall = safe(tp, tp + fp), safe(tp, tp + fn)
    return {'tp': tp, 'tn': tn, 'fp': fp, 'fn': fn,
            'accuracy': safe(tp + tn, tp + tn + fp + fn), 'precision': precision, 'recall': recall,
            'specificity': safe(tn, tn + fp),
            'f1': safe(2 * precision * recall, precision + recall) if precision and recall else 0.0}


def top_recommendation(eligible_df, pred):
    """Per student with >=2 eligible offers: is the model's #1 offer the formula's #1 offer?"""
    df = eligible_df[['student_id', 'offer_id', 'y_demo']].copy(); df['pred'] = pred
    df = df[df.groupby('student_id').offer_id.transform('size') >= 2]
    true_best = df.sort_values(['student_id', 'y_demo', 'offer_id'], ascending=[True, False, True]) \
        .groupby('student_id').head(1).set_index('student_id')
    model_best = df.sort_values(['student_id', 'pred', 'offer_id'], ascending=[True, False, True]) \
        .groupby('student_id').head(1).set_index('student_id')
    joined = true_best.join(model_best, lsuffix='_true', rsuffix='_model')
    regret = (joined.y_demo_true - joined.y_demo_model) * 100
    key = df.student_id + '|' + df.offer_id
    actual = key.isin(true_best.index.to_series() + '|' + true_best.offer_id)
    predicted = key.isin(model_best.index.to_series() + '|' + model_best.offer_id)
    wrong = regret[regret > 0]
    return {'students': int(len(joined)), 'top1_accuracy': float((regret == 0).mean()),
            'mean_regret_when_wrong_pts': float(wrong.mean()) if len(wrong) else 0.0,
            'max_regret_pts': float(regret.max()), 'confusion': confusion(actual, predicted)}


def evaluate(model, df, baseline_mean):
    pred = predict(model, df); err = np.abs(pred - df.y_demo.to_numpy())
    elig = df.eligible.to_numpy(); ep = pred[elig]; ey = df.y_demo.to_numpy()[elig]
    label = ey >= STRONG_MATCH
    return {'pairs': int(len(df)), 'students': int(df.student_id.nunique()),
            'mae': float(err.mean()), 'rmse': float(np.sqrt((err ** 2).mean())),
            'max_abs_error': float(err.max()), 'p99_abs_error': float(np.quantile(err, .99)),
            'r2': float(r2_score(df.y_demo, pred)),
            'baseline_mae': float(np.abs(baseline_mean - df.y_demo).mean()),
            'eligible_pairs': int(elig.sum()), 'eligible_mae': float(np.abs(ep - ey).mean()),
            'strong_match': {**confusion(label, ep >= STRONG_MATCH),
                             'roc_auc': float(roc_auc_score(label, ep)),
                             'average_precision': float(average_precision_score(label, ep))},
            'top_recommendation': top_recommendation(df[elig], ep)}, pred


def speed(model, frame):
    one, batch = frame[FEATURES].iloc[:1], frame[FEATURES].iloc[:1000]
    def best_of(x, reps):
        times = []
        for _ in range(reps):
            t = time.perf_counter(); model.predict(x); times.append(time.perf_counter() - t)
        return float(np.median(times) * 1000)
    return {'single_pair_ms': best_of(one, 20), 'batch_1000_ms': best_of(batch, 5)}


def placement_check(model):
    """Run the demo cohorts and SRS fixtures end to end with this model as the fallback ranker."""
    out = {}
    predictor = lambda f: np.clip(model.predict(pd.DataFrame(f, columns=FEATURES)), 0, 1)
    cohorts = [('demo_200', DATA / 'demo' / 'demo_200'), ('stress_500', DATA / 'demo' / 'stress_500'),
               ('large_5000', DATA / 'demo' / 'large_5000'),
               ('six_student_fallback_on', DATA / 'scenarios' / 'six_student_fallback_on')]
    for name, folder in cohorts:
        s, o, p = (load_csv(folder / f) for f in ['students.csv', 'offers.csv', 'preferences.csv'])
        t = time.perf_counter(); rows = allocate(s, o, p, True, predictor); runtime = time.perf_counter() - t
        violations = verify_plan(s, o, p, rows, True)
        teacher = {r['student_id']: r['offer_id'] for r in load_csv(folder / 'expected_teacher_fallback_placements.csv')}
        summary = allocation_metrics(s, o, rows)
        summary.update({'runtime_ms': round(runtime * 1000, 2), 'violations': sum(violations.values()),
                        'agreement_with_formula': float(np.mean([r['offer_id'] == teacher[r['student_id']] for r in rows]))})
        if name == 'six_student_fallback_on':
            summary['placements'] = {r['student_id']: r['offer_id'] or None for r in rows}
        out[name] = summary
    return out


def file_sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--max-train-students', type=int, default=2500, help='0 = all 20,000')
    ap.add_argument('--skip-learning-curve', action='store_true')
    args = ap.parse_args()

    selected = sample_students(args.max_train_students)
    print(f'Loading data ({len(selected)} training students)...', flush=True)
    train_all = load_split('train'); train = train_all[train_all.student_id.isin(selected)].reset_index(drop=True)
    valid, test = load_split('validation'), load_split('test')
    assert not (set(train.student_id) & set(valid.student_id)) and not (set(train.student_id) & set(test.student_id))
    baseline_mean = float(train.y_demo.mean())

    results, val_preds, models = {}, {}, {}
    for key, model in build_models().items():
        print(f'Training {key}...', flush=True)
        t = time.perf_counter(); model.fit(train[FEATURES], train.y_demo); fit_s = time.perf_counter() - t
        finalize(model); models[key] = model
        entry = {'fit_seconds': round(fit_s, 3)}
        for split, frame in [('train', train), ('validation', valid), ('test', test)]:
            entry[split], pred = evaluate(model, frame, baseline_mean)
            if split == 'validation':
                val_preds[key] = pred.astype(np.float32)
        entry['speed'] = speed(model, valid)
        results[key] = entry
        v = entry['validation']
        print(f"  val MAE={v['mae']:.5f}  top1={v['top_recommendation']['top1_accuracy']:.4f}  fit={fit_s:.1f}s", flush=True)

    candidates = [k for k in results if k != 'mean_baseline']
    champion = min(candidates, key=lambda k: (-results[k]['validation']['top_recommendation']['top1_accuracy'],
                                              results[k]['validation']['mae']))
    print(f'Champion on validation: {champion}', flush=True)

    # Permutation importance on a fixed validation sample (model-agnostic, comparable across models).
    sample = valid.sample(20000, random_state=SEED)
    for key in candidates:
        imp = permutation_importance(models[key], sample[FEATURES], sample.y_demo, n_repeats=5,
                                     random_state=SEED, scoring='neg_mean_absolute_error')
        results[key]['permutation_importance'] = dict(zip(FEATURES, imp.importances_mean.round(6).tolist()))

    # Robustness: train on noisy labels, score against the clean validation target.
    print('Noise robustness experiment...', flush=True)
    noisy = train.copy()
    noisy['y_demo'] = np.clip(noisy.y_demo + np.random.default_rng(SEED).normal(0, NOISE_SIGMA, len(noisy)), 0, 1)
    for key, model in build_models().items():
        if key == 'mean_baseline':
            continue
        model.fit(noisy[FEATURES], noisy.y_demo); finalize(model)
        pred = predict(model, valid)
        results[key]['noisy_labels'] = {
            'sigma': NOISE_SIGMA, 'clean_validation_mae': float(np.abs(pred - valid.y_demo).mean()),
            'top1_accuracy': top_recommendation(valid[valid.eligible], pred[valid.eligible.to_numpy()])['top1_accuracy']}

    # Learning curve for the tree ensembles, boosting and linear models.
    curve = {}
    if not args.skip_learning_curve:
        print('Learning curve...', flush=True)
        all_ids = np.array(sorted(train_all.student_id.unique()))
        order = np.random.default_rng(SEED).permutation(all_ids)
        for key in ['linear_regression', 'decision_tree', 'random_forest', 'extra_trees', 'hist_gradient_boosting']:
            curve[key] = []
            for n in LEARNING_CURVE_SIZES:
                subset = train_all[train_all.student_id.isin(set(order[:n]))]
                model = build_models()[key]; model.fit(subset[FEATURES], subset.y_demo); finalize(model)
                pred = predict(model, valid)
                curve[key].append({'students': n, 'pairs': int(len(subset)),
                                   'train_mae': float(np.abs(predict(model, subset) - subset.y_demo).mean()),
                                   'validation_mae': float(np.abs(pred - valid.y_demo).mean())})
            print(f'  {key} done', flush=True)

    # End-to-end placement with every model as the fallback ranker.
    print('Placement checks...', flush=True)
    for key in candidates:
        results[key]['placement'] = placement_check(models[key])

    # Persist every candidate model + metadata and a registry the backend reads.
    versions = {'python': platform.python_version(), 'scikit_learn': sklearn.__version__,
                'numpy': np.__version__, 'pandas': pd.__version__, 'joblib': joblib.__version__}
    registry = {'champion': champion, 'selection_rule': 'Highest validation top-1 ranking accuracy, then lowest validation MAE.',
                'feature_order': FEATURES, 'target_formula': '.75*subject_fit + .15*overall_norm + .10*same_province',
                'synthetic': True, 'models': []}
    for key in candidates:
        folder = OUT / 'models' / key; folder.mkdir(parents=True, exist_ok=True)
        path = folder / 'model.joblib'; joblib.dump(models[key], path, compress=3)
        reloaded = joblib.load(path)
        assert np.array_equal(models[key].predict(valid[FEATURES].iloc[:500]), reloaded.predict(valid[FEATURES].iloc[:500]))
        name, description = MODEL_INFO[key]
        meta = {'model_key': key, 'model_version': f'{key.replace("_", "-")}-synthetic-v1', 'display_name': name,
                'algorithm': type(models[key].steps[-1][1] if hasattr(models[key], 'steps') else models[key]).__name__,
                'description': description, 'params': {k: v for k, v in models[key].get_params().items()
                                                       if isinstance(v, (int, float, str, bool, type(None), tuple))},
                'synthetic': True, 'training_source': 'Generated synthetic pairs; no real records',
                'target_formula': registry['target_formula'], 'feature_order': FEATURES,
                'train_students_used': len(selected), 'train_pairs_used': int(len(train)),
                'selected_student_ids_sha256': hashlib.sha256('\n'.join(sorted(selected)).encode()).hexdigest(),
                'fixed_seed': SEED, 'fit_seconds': results[key]['fit_seconds'],
                'metrics': {s: {k: results[key][s][k] for k in ['mae', 'rmse', 'r2', 'baseline_mae']}
                            | {'top1_accuracy': results[key][s]['top_recommendation']['top1_accuracy']}
                            for s in ['train', 'validation', 'test']},
                'versions': versions, 'model_sha256': file_sha256(path), 'model_bytes': path.stat().st_size,
                'artifact_reload_prediction_check': 'PASS', 'is_champion': key == champion,
                'evaluation_scope': 'New synthetic students at known offer profiles. Not real placement accuracy.'}
        (folder / 'metadata.json').write_text(json.dumps(meta, indent=2) + '\n', encoding='utf-8')
        results[key]['model_bytes'] = meta['model_bytes']
        registry['models'].append({'key': key, 'path': f'{key}/model.joblib', 'metadata': f'{key}/metadata.json',
                                   'model_version': meta['model_version'], 'display_name': name,
                                   'sha256': meta['model_sha256']})
    (OUT / 'models' / 'registry.json').write_text(json.dumps(registry, indent=2) + '\n', encoding='utf-8')

    report = {'generated_utc': pd.Timestamp.now(tz='UTC').isoformat(), 'champion': champion,
              'selection_rule': registry['selection_rule'], 'strong_match_threshold': STRONG_MATCH,
              'train_students': len(selected), 'train_pairs': int(len(train)), 'versions': versions,
              'model_info': MODEL_INFO, 'results': results, 'learning_curve': curve}
    (OUT / 'reports').mkdir(parents=True, exist_ok=True)
    (OUT / 'reports' / 'results.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    np.savez_compressed(OUT / 'reports' / 'validation_predictions.npz', y_true=valid.y_demo.to_numpy(np.float32),
                        eligible=valid.eligible.to_numpy(), **val_preds)
    print(json.dumps({k: {'val_mae': round(results[k]['validation']['mae'], 6),
                          'val_top1': round(results[k]['validation']['top_recommendation']['top1_accuracy'], 4)}
                      for k in results}, indent=1))


if __name__ == '__main__':
    main()
