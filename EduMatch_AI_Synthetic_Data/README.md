# EduMatch AI synthetic dataset package

All students, schools, marks, capacities, preferences, eligibility thresholds and
reference placements in this package are synthetic. No real student records were
used. The schema follows the team's Software Requirements Specification, not a
verified NESA export. Geographic province names are contextual labels only.
The simulated distributions are not estimates of Rwanda's student population.

## Start here for tomorrow's demonstration

1. Load `demo/demo_200/students.csv`, `offers.csv`, `preferences.csv` and `rules.json`
   into the application. This is one synthetic province, 200 students and 12 offers.
2. Use `scenarios/six_student_base/` for a hand-checkable six-student demonstration.
   Expected placements: S1 -> A, S2 -> A, S3 -> B, S4 -> C; S5 and S6 unassigned.
3. Use `scenarios/six_student_fallback_on/` to demonstrate an actual AI fallback
   call: S3 has opted in, B is unavailable, and C has two seats. S3 can receive C.
4. Generate draft recommendations, inspect explanations, approve one placement and
   export only approved rows. Reference files in this package are drafts, not final
   official decisions. Human approval must happen in your application.
5. Use `demo/stress_500/` or `demo/large_5000/` for larger demonstrations.

Do not load multiple cohort folders together. Each folder has its own capacity
pool and context. The same offer catalog IDs in model splits deliberately describe
the same profiles with capacities scaled for that split. Shared six-student IDs
across scenario variants intentionally identify alternative versions of one fixture.
`model_training/offer_catalog.csv` is a profile template. Its capacity column is
illustrative; import each split's own `offers.csv` for allocation or capacity tests.

## Model datasets

| Folder | Students | Offer profiles | Candidate pairs | Ordered choice rows |
| --- | ---: | ---: | ---: | ---: |
| `model_training/train/` | 20,000 | 60 | 1,200,000 | 60,000 |
| `model_training/validation/` | 5,000 | 60 | 300,000 | 15,000 |
| `model_training/test/` | 5,000 | 60 | 300,000 | 15,000 |

Every split contains all four required matching inputs: students/results, offers/
capacity, ordered choices, and rules. Each additionally includes `pairs.csv` for
model fitting, `expected_rules_only_placements.csv` and a summary.

Student IDs are disjoint across train, validation and test. All pair rows belonging
to a student stay in that student's split. Never randomly split candidate-pair
rows across these files. Offer identities are shared across model splits, so the
test evaluates new synthetic students at known profiles, not unseen schools.
The model data spans five province labels to vary the same-province feature.
The smaller demonstration cohorts each use Southern Province only.

## Train the embedded model

From the extracted package folder, with Python 3.10+:

```bash
python -m pip install -r requirements.txt
python tools/validate_data.py
python tools/train_model.py
```

The default training script randomly samples 2,500 training students (150,000 pairs)
using a fixed seed so it is practical on a laptop. All validation pairs are evaluated.
To use every training row, run:

```bash
python tools/train_model.py --max-train-students 0
```

After choosing the model settings, evaluate the test once:

```bash
python tools/train_model.py --evaluate-test
```

Outputs go to `model_artifacts/`: `model.joblib`, `metadata.json`, and model-based
draft placements/metrics for the three demo sizes. Prebuilt artifacts are also
included for immediate integration; their metadata states the exact subset used
and installed versions. Rebuild locally if scikit-learn versions differ. Load only
the trusted model artifact from this package or one your team builds.
The included starter model's validation and test have already been evaluated and
reported in its metadata. Do not repeatedly tune settings against the test results.

Pass exactly four model features in this order:

1. `overall_norm` = overall_score / 100.
2. `subject_fit` = weighted math/science/language score / 100.
3. `eligibility_margin` = max(0, overall_score - min_overall) / 100.
4. `same_province` = 1 if the student and offer province labels match, else 0.

The only target is:

`y_demo = 0.75 * subject_fit + 0.15 * overall_norm + 0.10 * same_province`

This target is an invented teaching formula. It is not probability of admission,
future examination success, school completion, or evidence of the best real placement.
Recovering this formula is a demonstration of model training/inference; a direct
formula could produce the same intended compatibility score. Do not report these
tests as NESA placement accuracy or real-world AI effectiveness.

Exclude `student_id`, `offer_id`, `split`, `eligible`, `listed_preference_rank`,
`synthetic`, `y_demo`, and expected placement outputs from the model input features.
Names, IDs and capacity are not learned priorities. Eligibility and capacity must
be enforced by the backend after/before scoring as appropriate.

## Synthetic placement policy

Scores are on 0-100; higher is better. Overall score orders students descending.
Student ID ascending is only a deterministic tie-break for this demo. For each
student, consider listed choices in rank order and reserve the first eligible offer
with capacity. Unlisted alternatives are allowed only with `allow_fallback=true`.
The model ranks such alternatives; officers approve final decisions.
Fallback can reserve a seat before a lower-priority student's listed choice is
considered. Measure both placement coverage and preference satisfaction; this
serial demo algorithm does not promise a globally optimal matching.

Every offer has an overall threshold and optional subject minima. Blank subject
minimum means no constraint; zero capacity means no available seats. Three offer
profile weights sum to one. `stage_programme` is `DEMO_GENERIC_OFFER`, because the
actual placement stage and programme schema remain unconfirmed.

`expected_rules_only_placements.csv` is an exact deterministic regression reference
for the invented listed-choice policy. `expected_teacher_fallback_placements.csv`
uses the disclosed formula to rank feasible alternatives. A learned model may
choose a different fallback when approximate scores are close; enforce constraints
and compare metrics, rather than demanding exact teacher-match on every fallback.
These files are not historical data and must not become additional training features.

## Tests and deliberately invalid input files

`scenarios/` contains 11 valid cohorts: base six-student, fallback on/off, all-zero
capacity, excess capacity, a shared-demand hotspot, seat shortage, tied scores, no
eligible destination, eligibility boundary, and fallback disabled.

`invalid_inputs/` contains 8 isolated rejection fixtures: missing score, duplicate
student, unknown offer, duplicate rank, negative capacity, out-of-range score,
missing choices and duplicate choice. Their expected error codes are supplied.
These are for import validation only. Never append them to clean training data.

Read `data_dictionary.csv` for field definitions, `schema.json` for machine-readable
contracts, `generation_metadata.json` for provenance/settings, `validation_report.json`
for checks, and `manifest.json` for counts and SHA-256 checksums.

The Excel preview contains the complete 200-student demo inputs, draft reference
placements and a 200-row sample of training pairs. The 1.8 million full pair records
are supplied as CSV; they exceed the row limit of a single Excel worksheet.

## Generate more data reproducibly

```bash
python tools/generate_data.py --output extra_data --train-students 50000 --validation-students 10000 --test-students 10000 --model-offers 100
python tools/validate_data.py --root extra_data
python tools/train_model.py --root extra_data --max-train-students 2500
```

The example creates 7 million pairs, so allow more disk space and generation time.
Use a new output directory when changing dimensions. The included generator creates
CSV/JSON data and does not regenerate the Excel preview, README counts or manifest.
Regenerated counts and settings are recorded in the new `generation_metadata.json`.
Package created 30 September 2026 for the EduMatch AI hackathon demonstration.
