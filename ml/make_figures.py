"""Render the model-comparison figures from ml/reports/results.json (run compare_models.py first)."""
import json
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.patches import FancyBboxPatch
from sklearn.metrics import precision_recall_curve, roc_curve

ROOT = Path(__file__).resolve().parent
REPORT = json.loads((ROOT / 'reports' / 'results.json').read_text(encoding='utf-8'))
PREDS = np.load(ROOT / 'reports' / 'validation_predictions.npz')
FIG = ROOT / 'reports' / 'figures'; FIG.mkdir(parents=True, exist_ok=True)
R = REPORT['results']; CHAMPION = REPORT['champion']; T = REPORT['strong_match_threshold']

# Validated reference palette (light mode). Colour follows the model everywhere.
SURFACE, INK, INK2, MUTED, GRID = '#fcfcfb', '#0b0b0b', '#52514e', '#8a8983', '#e4e3df'
COLORS = {'linear_regression': '#2a78d6', 'decision_tree': '#eb6834', 'random_forest': '#1baf7a',
          'extra_trees': '#eda100', 'hist_gradient_boosting': '#e87ba4', 'knn': '#008300',
          'mlp': '#4a3aa7', 'mean_baseline': MUTED}
BLUE_SEQ = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b']
GOOD_TINT, BAD_TINT = '#cde2fb', '#f6d3d2'
MODELS = [k for k in COLORS if k in R and k != 'mean_baseline']
ALL = MODELS + ['mean_baseline']


def name(key):
    base = REPORT['model_info'].get(key, ('Mean baseline',))[0]
    return base + (' ★' if key == CHAMPION else '')


plt.rcParams.update({
    'figure.facecolor': SURFACE, 'axes.facecolor': SURFACE, 'savefig.facecolor': SURFACE,
    'axes.edgecolor': GRID, 'axes.labelcolor': INK2, 'xtick.color': INK2, 'ytick.color': INK2,
    'text.color': INK, 'axes.titlecolor': INK, 'axes.titleweight': 'bold', 'axes.titlesize': 12,
    'axes.titlelocation': 'left', 'axes.spines.top': False, 'axes.spines.right': False,
    'axes.grid': True, 'grid.color': GRID, 'grid.linewidth': 0.8, 'axes.axisbelow': True,
    'font.family': 'DejaVu Sans', 'font.size': 10, 'legend.frameon': False, 'lines.linewidth': 2,
})


def save(fig, filename, note=None):
    footer = 'Synthetic data · demo policy · error vs. an invented teaching formula, not real placement accuracy'
    fig.text(0.01, -0.02, footer + (f'\n{note}' if note else ''), fontsize=7.5, color=MUTED, va='top')
    fig.savefig(FIG / filename, dpi=150, bbox_inches='tight', pad_inches=0.25)
    plt.close(fig); print('wrote', filename)


def hbar(ax, keys, values, fmt, log=False):
    y = np.arange(len(keys))[::-1]
    ax.barh(y, values, color=[COLORS[k] for k in keys], height=0.62, edgecolor=SURFACE, linewidth=2)
    ax.set_yticks(y, [name(k) for k in keys]); ax.grid(axis='y', visible=False)
    if log: ax.set_xscale('log')
    for yi, v in zip(y, values):
        ax.text(v * (1.08 if log else 1) + (0 if log else max(values) * 0.01), yi, fmt(v),
                va='center', fontsize=9, color=INK2)
    ax.set_xlim(right=(max(values) * (6 if log else 1.18)))


# 00 — explainer sketch of the confusion matrix, in EduMatch terms --------------------------------
def explainer():
    fig, ax = plt.subplots(figsize=(11, 7)); ax.set_xlim(0, 11); ax.set_ylim(0, 7.2); ax.axis('off'); ax.grid(False)
    ax.text(0, 7.0, 'How to read a confusion matrix (TP · TN · FP · FN)', fontsize=15, weight='bold', va='top')
    ax.text(0, 6.55, f'Question the model answers: "Is this eligible school a STRONG match for this student?" '
                     f'(compatibility ≥ {int(T * 100)} / 100)', fontsize=10, color=INK2, va='top')
    x0, y0, w, h = 2.2, 1.0, 3.2, 2.1
    cells = [  # (col, row, code, title, meaning, tint)
        (0, 1, 'TP', 'True Positive', 'Model: strong match\nTruth: strong match\n→ correct recommendation', GOOD_TINT),
        (1, 1, 'FN', 'False Negative', 'Model: not strong\nTruth: strong match\n→ a good school was missed', BAD_TINT),
        (0, 0, 'FP', 'False Positive', 'Model: strong match\nTruth: not strong\n→ a weak school was oversold', BAD_TINT),
        (1, 0, 'TN', 'True Negative', 'Model: not strong\nTruth: not strong\n→ correctly not promoted', GOOD_TINT),
    ]
    for col, row, code, title, meaning, tint in cells:
        x, y = x0 + col * (w + 0.12), y0 + row * (h + 0.12)
        ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle='round,pad=0,rounding_size=0.08', fc=tint, ec=SURFACE, lw=2))
        ax.text(x + 0.2, y + h - 0.22, code, fontsize=22, weight='bold', va='top')
        ax.text(x + 1.25, y + h - 0.3, title, fontsize=11, weight='bold', va='top')
        ax.text(x + 0.2, y + 0.25, meaning, fontsize=9.5, color=INK2, va='bottom', linespacing=1.5)
    ax.text(x0 + w / 2, y0 + 2 * h + 0.35, 'Model says: STRONG', ha='center', weight='bold', color=INK2)
    ax.text(x0 + w * 1.5 + 0.12, y0 + 2 * h + 0.35, 'Model says: NOT strong', ha='center', weight='bold', color=INK2)
    ax.text(x0 - 0.2, y0 + h * 1.5 + 0.12, 'Truth:\nSTRONG', ha='right', va='center', weight='bold', color=INK2)
    ax.text(x0 - 0.2, y0 + h / 2, 'Truth:\nNOT strong', ha='right', va='center', weight='bold', color=INK2)
    ax.text(x0 + w + 0.06, y0 - 0.35, 'Blue = the model was right   ·   Red = the model was wrong',
            ha='center', fontsize=9, color=INK2)
    fx = 9.05
    ax.text(fx, 5.15, 'Scores built from the four cells', weight='bold', fontsize=11)
    for i, (label, formula) in enumerate([
            ('Accuracy', '(TP + TN) / all'), ('Precision', 'TP / (TP + FP)\n"when it says strong, is it?"'),
            ('Recall', 'TP / (TP + FN)\n"how many strong ones it finds"'),
            ('Specificity', 'TN / (TN + FP)'), ('F1', '2·P·R / (P + R)')]):
        ax.text(fx, 4.7 - i * 0.78, label, weight='bold', fontsize=10, va='top')
        ax.text(fx, 4.45 - i * 0.78, formula, fontsize=8.8, color=INK2, va='top', linespacing=1.3)
    save(fig, '00_confusion_matrix_explained.png')


# 01 — validation MAE -------------------------------------------------------------------------------
def mae_comparison():
    keys = sorted(ALL, key=lambda k: R[k]['validation']['mae'])
    fig, ax = plt.subplots(figsize=(10, 4.8))
    hbar(ax, keys, [R[k]['validation']['mae'] * 100 for k in keys], lambda v: f'{v:.4f} pts', log=True)
    ax.set_title('Validation error — average points off on the 0–100 fit score (lower is better, log scale)')
    ax.set_xlabel('Mean absolute error (fit-score points, log scale)')
    save(fig, '01_validation_mae_comparison.png', '5,000 unseen validation students · 300,000 pairs · ★ = champion')


# 02 — train / validation / test --------------------------------------------------------------------
def overfit_check():
    fig, ax = plt.subplots(figsize=(10, 4.8)); keys = MODELS
    y = np.arange(len(keys))[::-1]
    for split, colour, marker, off in [('train', BLUE_SEQ[2], 'o', 0.18), ('validation', BLUE_SEQ[4], 's', 0),
                                       ('test', BLUE_SEQ[6], 'D', -0.18)]:
        ax.scatter([R[k][split]['mae'] * 100 for k in keys], y + off, s=64, color=colour, marker=marker,
                   edgecolor=SURFACE, linewidth=1.5, label=split.capitalize(), zorder=3)
    for yi, k in zip(y, keys):
        vals = [R[k][s]['mae'] * 100 for s in ['train', 'validation', 'test']]
        ax.plot([min(vals), max(vals)], [yi, yi], color=GRID, lw=6, zorder=1, solid_capstyle='round')
    ax.set_xscale('log'); ax.set_yticks(y, [name(k) for k in keys]); ax.grid(axis='y', visible=False)
    ax.set_title('Overfitting check — train vs validation vs test error (points close together = generalises)')
    ax.set_xlabel('Mean absolute error (fit-score points, log scale)'); ax.legend(loc='lower right', ncol=3)
    save(fig, '02_train_validation_test_error.png')


# 03 — ranking quality ------------------------------------------------------------------------------
def ranking():
    keys = sorted(MODELS, key=lambda k: -R[k]['validation']['top_recommendation']['top1_accuracy'])
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(13, 4.8), gridspec_kw={'wspace': 0.55})
    err = [(1 - R[k]['validation']['top_recommendation']['top1_accuracy']) * 100 for k in keys]
    hbar(a1, keys, err, lambda v: f'{v:.2f}%')
    a1.set_title('Wrong #1 recommendation rate'); a1.set_xlabel('% of students whose model-ranked best school ≠ true best')
    reg = [R[k]['validation']['top_recommendation']['mean_regret_when_wrong_pts'] for k in keys]
    hbar(a2, keys, reg, lambda v: f'{v:.2f} pts')
    a2.set_title('Cost of a wrong #1 pick'); a2.set_xlabel('Average fit-score points lost when the pick is wrong')
    fig.suptitle('Ranking quality — the job the model actually does in fallback', x=0.01, ha='left', weight='bold', fontsize=13)
    save(fig, '03_ranking_quality.png', f"Validation students with ≥2 eligible schools: "
                                       f"{R[CHAMPION]['validation']['top_recommendation']['students']:,}")


# 04/05 — confusion-matrix grids --------------------------------------------------------------------
def confusion_grid(kind, filename, title, pos_label):
    keys = ALL
    fig, axes = plt.subplots(2, 4, figsize=(15, 7.6), gridspec_kw={'hspace': 0.55, 'wspace': 0.35})
    for ax, k in zip(axes.flat, keys):
        c = R[k]['validation'][kind] if kind == 'strong_match' else R[k]['validation'][kind]['confusion']
        grid = np.array([[c['tp'], c['fn']], [c['fp'], c['tn']]]); total = grid.sum()
        tints = np.array([[GOOD_TINT, BAD_TINT], [BAD_TINT, GOOD_TINT]])
        ax.grid(False); ax.set_xlim(0, 2); ax.set_ylim(0, 2); ax.invert_yaxis()
        for (i, j), v in np.ndenumerate(grid):
            ax.add_patch(plt.Rectangle((j, i), 1, 1, fc=tints[i, j], ec=SURFACE, lw=3))
            code = [['TP', 'FN'], ['FP', 'TN']][i][j]
            ax.text(j + 0.5, i + 0.32, code, ha='center', va='center', fontsize=9, color=INK2, weight='bold')
            ax.text(j + 0.5, i + 0.58, f'{v:,}', ha='center', va='center', fontsize=11.5, weight='bold')
            ax.text(j + 0.5, i + 0.8, f'{v / total:.2%}', ha='center', va='center', fontsize=8.5, color=INK2)
        ax.set_xticks([0.5, 1.5], ['Pred: yes', 'Pred: no']); ax.set_yticks([0.5, 1.5], ['True: yes', 'True: no'])
        ax.tick_params(length=0); [s.set_visible(False) for s in ax.spines.values()]
        ax.set_title(f"{name(k)}\nacc {c['accuracy']:.2%} · F1 {c['f1']:.3f}", fontsize=10, loc='center',
                     color=COLORS[k] if k != 'mean_baseline' else INK2)
    fig.suptitle(title, x=0.01, y=1.0, ha='left', weight='bold', fontsize=13)
    fig.text(0.01, 0.955, f'"Yes" = {pos_label}. Blue cells = correct, red cells = errors. Validation set.',
             fontsize=9.5, color=INK2)
    save(fig, filename)


# 06 — classification metrics heatmap ---------------------------------------------------------------
def metrics_table():
    cols = [('accuracy', 'Accuracy'), ('precision', 'Precision'), ('recall', 'Recall'),
            ('specificity', 'Specificity'), ('f1', 'F1'), ('roc_auc', 'ROC AUC')]
    keys = sorted(MODELS, key=lambda k: -R[k]['validation']['strong_match']['f1'])
    data = np.array([[R[k]['validation']['strong_match'][c] or 0 for c, _ in cols] for k in keys])
    fig, ax = plt.subplots(figsize=(10, 4.6)); ax.grid(False)
    from matplotlib.colors import LinearSegmentedColormap
    cmap = LinearSegmentedColormap.from_list('blue', BLUE_SEQ)
    ax.imshow(data, cmap=cmap, vmin=0.9, vmax=1.0, aspect='auto')
    for (i, j), v in np.ndenumerate(data):
        ax.text(j, i, f'{v:.4f}', ha='center', va='center', fontsize=9.5, color='#ffffff' if v > 0.975 else INK)
    ax.set_xticks(range(len(cols)), [c[1] for c in cols]); ax.set_yticks(range(len(keys)), [name(k) for k in keys])
    ax.tick_params(length=0); [s.set_visible(False) for s in ax.spines.values()]
    ax.set_title(f'Strong-match classification scores (fit ≥ {int(T * 100)}) — darker = better (scale 0.90 → 1.00)')
    save(fig, '06_classification_metrics.png')


# 07 — ROC & precision-recall -----------------------------------------------------------------------
def roc_pr():
    elig = PREDS['eligible']; y = PREDS['y_true'][elig] >= T
    fig, axes = plt.subplots(1, 3, figsize=(16, 5.2), gridspec_kw={'wspace': 0.3})
    for k in MODELS:
        p = PREDS[k][elig]; fpr, tpr, _ = roc_curve(y, p); prec, rec, _ = precision_recall_curve(y, p)
        auc = R[k]['validation']['strong_match']['roc_auc']
        for ax in axes[:2]:
            ax.plot(fpr, tpr, color=COLORS[k], label=f'{name(k)} (AUC {auc:.4f})')
        axes[2].plot(rec, prec, color=COLORS[k], label=name(k))
    axes[0].plot([0, 1], [0, 1], ls='--', color=MUTED, lw=1.2, label='Random guess')
    axes[0].set(title='ROC curve', xlabel='False-positive rate', ylabel='True-positive rate (recall)')
    axes[1].set(title='ROC — zoomed top-left corner', xlim=(0, 0.1), ylim=(0.9, 1.0), xlabel='False-positive rate')
    axes[2].set(title='Precision–recall', xlabel='Recall', ylabel='Precision', ylim=(0.8, 1.005))
    axes[0].legend(fontsize=8, loc='lower right')
    save(fig, '07_roc_and_precision_recall.png', f'Strong match = fit ≥ {int(T * 100)} · eligible validation pairs')


# 08 — predicted vs actual --------------------------------------------------------------------------
def pred_vs_actual():
    y = PREDS['y_true'] * 100
    fig, axes = plt.subplots(2, 4, figsize=(15, 7.8), gridspec_kw={'hspace': 0.4, 'wspace': 0.25})
    for ax, k in zip(axes.flat, ALL):
        from matplotlib.colors import LinearSegmentedColormap
        cmap = LinearSegmentedColormap.from_list(k, [SURFACE, COLORS[k]])
        ax.hexbin(y, PREDS[k] * 100, gridsize=60, cmap=cmap, bins='log', mincnt=1, linewidths=0)
        ax.plot([0, 100], [0, 100], color=INK, lw=0.8, ls='--')
        ax.set(xlim=(0, 100), ylim=(0, 100), title=f"{name(k)}\nR² {R[k]['validation']['r2']:.4f}")
        ax.title.set_fontsize(10)
    for ax in axes[1]: ax.set_xlabel('True fit score')
    for ax in axes[:, 0]: ax.set_ylabel('Predicted fit score')
    fig.suptitle('Predicted vs true fit score — perfect models sit on the dashed diagonal', x=0.01, ha='left',
                 weight='bold', fontsize=13)
    save(fig, '08_predicted_vs_actual.png', 'Colour intensity = number of pairs (log)')


# 09 — residual distributions -----------------------------------------------------------------------
def residuals():
    y = PREDS['y_true'] * 100
    fig, axes = plt.subplots(2, 4, figsize=(15, 6.8), sharex=True, gridspec_kw={'hspace': 0.45, 'wspace': 0.3})
    bins = np.linspace(-4, 4, 81)
    for ax, k in zip(axes.flat, ALL):
        r = np.clip(PREDS[k] * 100 - y, -4, 4)
        ax.hist(r, bins=bins, color=COLORS[k], edgecolor=SURFACE, linewidth=0.3)
        ax.axvline(0, color=INK, lw=0.8)
        ax.set_title(f"{name(k)}\n95% within ±{np.quantile(np.abs(PREDS[k] * 100 - y), .95):.2f} pts", fontsize=10)
        ax.set_yticks([])
    for ax in axes[1]: ax.set_xlabel('Prediction error (points; clipped to ±4)')
    fig.suptitle('Error distribution — narrow and centred on 0 is best', x=0.01, ha='left', weight='bold', fontsize=13)
    save(fig, '09_residual_distribution.png')


# 10 — error across the score range -----------------------------------------------------------------
def error_by_score():
    y = PREDS['y_true'] * 100; edges = np.arange(0, 101, 10); mids = edges[:-1] + 5
    fig, ax = plt.subplots(figsize=(10, 5))
    for k in MODELS:
        e = np.abs(PREDS[k] * 100 - y)
        vals = [e[(y >= lo) & (y < hi + (hi == 100))].mean() if ((y >= lo) & (y < hi + (hi == 100))).any() else np.nan
                for lo, hi in zip(edges[:-1], edges[1:])]
        ax.plot(mids, vals, color=COLORS[k], marker='o', ms=5, label=name(k))
    ax.set_yscale('log'); ax.set_xticks(edges)
    ax.set(title='Where models struggle — error by true fit-score band (tree models squeeze the extremes)',
           xlabel='True fit score band', ylabel='Mean absolute error (points, log)')
    ax.legend(fontsize=8, ncol=2)
    save(fig, '10_error_by_score_band.png')


# 11 — permutation importance -----------------------------------------------------------------------
def importance():
    feats = ['subject_fit', 'same_province', 'overall_norm', 'eligibility_margin']
    labels = ['Subject fit', 'Same province', 'Overall score', 'Eligibility margin']
    data = np.array([[max(R[k]['permutation_importance'][f], 0) for f in feats] for k in MODELS])
    share = data / data.sum(axis=1, keepdims=True)
    fig, ax = plt.subplots(figsize=(10, 4.8)); ax.grid(False)
    from matplotlib.colors import LinearSegmentedColormap
    ax.imshow(share, cmap=LinearSegmentedColormap.from_list('b', [SURFACE] + BLUE_SEQ), vmin=0, vmax=1, aspect='auto')
    for (i, j), v in np.ndenumerate(share):
        ax.text(j, i, f'{v:.1%}', ha='center', va='center', fontsize=10, color='#ffffff' if v > 0.55 else INK)
    ax.set_xticks(range(4), labels); ax.set_yticks(range(len(MODELS)), [name(k) for k in MODELS])
    ax.tick_params(length=0); [s.set_visible(False) for s in ax.spines.values()]
    ax.set_title('What each model relies on — share of permutation importance')
    save(fig, '11_feature_importance.png', 'True formula weights: subject fit 0.75 · overall 0.15 · same province 0.10 · '
                                          'eligibility margin 0 (not in the formula)')


# 12 — learning curve -------------------------------------------------------------------------------
def learning_curve():
    curve = REPORT.get('learning_curve') or {}
    if not curve: return
    fig, ax = plt.subplots(figsize=(10, 5.2))
    for k, pts in curve.items():
        n = [p['students'] for p in pts]
        ax.plot(n, [p['validation_mae'] * 100 for p in pts], color=COLORS[k], marker='o', ms=5, label=f'{name(k)} — validation')
        ax.plot(n, [p['train_mae'] * 100 for p in pts], color=COLORS[k], ls=':', lw=1.5)
    ax.set_xscale('log'); ax.set_yscale('log')
    ax.axvline(REPORT['train_students'], color=MUTED, lw=1, ls='--')
    ax.text(REPORT['train_students'] * 1.05, ax.get_ylim()[1] * 0.7, 'size used', color=MUTED, fontsize=8.5)
    ax.set(title='Learning curve — does more data help? (solid = validation, dotted = training)',
           xlabel='Training students (60 pairs each, log)', ylabel='Mean absolute error (points, log)')
    ax.legend(fontsize=8)
    save(fig, '12_learning_curve.png')


# 13 — cost: training time, latency, size -----------------------------------------------------------
def cost():
    fig, axes = plt.subplots(1, 3, figsize=(16, 4.8), gridspec_kw={'wspace': 0.7})
    specs = [('Training time', lambda k: R[k]['fit_seconds'], lambda v: f'{v:.1f} s', 'Seconds (log)'),
             ('Latency to score 1,000 pairs', lambda k: R[k]['speed']['batch_1000_ms'], lambda v: f'{v:.1f} ms', 'Milliseconds (log)'),
             ('Model file size', lambda k: R[k]['model_bytes'] / 1e6, lambda v: f'{v:.2f} MB', 'Megabytes (log)')]
    for ax, (title, fn, fmt, xl) in zip(axes, specs):
        keys = sorted(MODELS, key=fn); hbar(ax, keys, [fn(k) for k in keys], fmt, log=True)
        ax.set_title(title); ax.set_xlabel(xl)
    fig.suptitle('Operational cost on this laptop (lower is better)', x=0.01, ha='left', weight='bold', fontsize=13)
    save(fig, '13_operational_cost.png', 'Measured once on the build laptop; single-threaded inference.')


# 14 — robustness to noisy labels -------------------------------------------------------------------
def robustness():
    keys = sorted(MODELS, key=lambda k: R[k]['noisy_labels']['clean_validation_mae'])
    y = np.arange(len(keys))[::-1]
    fig, ax = plt.subplots(figsize=(10, 4.8))
    for yi, k in zip(y, keys):
        clean, noisy = R[k]['validation']['mae'] * 100, R[k]['noisy_labels']['clean_validation_mae'] * 100
        ax.plot([clean, noisy], [yi, yi], color=GRID, lw=6, solid_capstyle='round', zorder=1)
        ax.scatter(clean, yi, s=60, color=BLUE_SEQ[2], edgecolor=SURFACE, zorder=3, label='Clean labels' if yi == y[0] else None)
        ax.scatter(noisy, yi, s=70, color=COLORS[k], marker='D', edgecolor=SURFACE, zorder=3)
        ax.text(noisy * 1.12, yi, f'{noisy:.2f} pts', va='center', fontsize=9, color=INK2)
    ax.scatter([], [], marker='D', color=INK2, label=f"Noisy labels (σ = {R[MODELS[0]]['noisy_labels']['sigma'] * 100:.0f} pts)")
    ax.set_xscale('log'); ax.set_yticks(y, [name(k) for k in keys]); ax.grid(axis='y', visible=False)
    ax.set(title='Robustness — trained on noisy labels, scored against the clean truth (real data will be noisy)',
           xlabel='Validation MAE (points, log)')
    ax.legend(loc='lower left')
    save(fig, '14_noise_robustness.png')


# 15 — end-to-end placement -------------------------------------------------------------------------
def placement():
    cohorts = [('demo_200', 'Demo 200'), ('stress_500', 'Stress 500'), ('large_5000', 'Large 5,000')]
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(14, 4.8), gridspec_kw={'wspace': 0.55})
    y = np.arange(len(MODELS))[::-1]; offs = [0.2, 0, -0.2]
    for (c, label), off, colour in zip(cohorts, offs, [BLUE_SEQ[2], BLUE_SEQ[4], BLUE_SEQ[6]]):
        a1.barh(y + off, [(1 - R[k]['placement'][c]['agreement_with_formula']) * 100 for k in MODELS], height=0.2,
                color=colour, edgecolor=SURFACE, linewidth=1, label=label)
        a2.barh(y + off, [R[k]['placement'][c]['runtime_ms'] for k in MODELS], height=0.2, color=colour,
                edgecolor=SURFACE, linewidth=1, label=label)
    for ax in (a1, a2):
        ax.set_yticks(y, [name(k) for k in MODELS]); ax.grid(axis='y', visible=False)
    a1.set(title='Students placed differently from the formula', xlabel='% of cohort')
    a2.set(title='Full placement run time', xlabel='Milliseconds (log)', xscale='log')
    a1.legend(loc='lower right', fontsize=8)
    viol = sum(R[k]['placement'][c]['violations'] for k in MODELS for c, _ in cohorts)
    fig.suptitle('End-to-end placement with each model as the fallback ranker', x=0.01, ha='left', weight='bold', fontsize=13)
    save(fig, '15_placement_end_to_end.png', f'Hard-constraint violations across all runs: {viol}. Run time uses the dataset reference engine (one model call per '
                                                   'student); the backend batches all fallback pairs into one call.')


if __name__ == '__main__':
    explainer(); mae_comparison(); overfit_check(); ranking()
    confusion_grid('strong_match', '04_confusion_strong_match.png',
                   f'Confusion matrices — "is this school a strong match?" (fit ≥ {int(T * 100)})',
                   f'strong match, fit ≥ {int(T * 100)}')
    confusion_grid('top_recommendation', '05_confusion_top_recommendation.png',
                   'Confusion matrices — "is this the student\'s best eligible school?"',
                   "this school is the student's #1 eligible school")
    metrics_table(); roc_pr(); pred_vs_actual(); residuals(); error_by_score(); importance()
    learning_curve(); cost(); robustness(); placement()
