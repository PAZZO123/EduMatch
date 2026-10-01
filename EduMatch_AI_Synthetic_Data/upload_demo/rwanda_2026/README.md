# Rwanda demo upload set (2026)

Upload these files in **Placements -> 01 Upload** (or Data & Cohort -> CSV import).

| File | Purpose | Required |
|---|---|---|
| `students_2026.csv` | One row per applicant: scores 0-100 and up to 3 ranked choices (`choice_1..choice_3` = `offer_id`) | yes |
| `schools_2026.csv` | One row per school combination: seats, entry cutoff, optional subject minimums, subject weights | yes |
| `placement_rules.json` | Machine-readable placement policy the system applies | recommended |
| `placement_rules.pdf` | The same rules for people to read (the system does not parse PDFs) | optional |

## Columns

`students_2026.csv`: `student_id, display_name, cohort_id, province, overall_score, math_score, science_score,
language_score, allow_fallback (true/false), choice_1, choice_2, choice_3`

`schools_2026.csv`: `offer_id, school_name, province, district, stage_programme, capacity, min_overall,
subject_min_math, subject_min_science, subject_min_language, weight_math, weight_science, weight_language`
(weights are non-negative and sum to 1; blank subject minimum = none; capacity 0 = no seats this year).

A separate `preferences.csv` (`student_id, offer_id, rank`) is also accepted instead of the choice columns.

## Data notice

- **Students are synthetic.** Names are random pairings of common Kinyarwanda family names and common
  first names; marks are generated. No real student is represented (SRS NFR-06).
- **Schools are real Rwandan secondary schools**, but the A-Level combinations, seats and cutoffs are
  invented for the demonstration and are not official NESA figures.

`../rwanda_2026_with_errors/` contains the same data with 5 deliberate mistakes (the duplicated student also triggers follow-on
choice errors, so 9 problems are listed), to demonstrate that the
whole batch is rejected with exact file / row / column messages and nothing is saved.

Regenerate: `python EduMatch_AI_Synthetic_Data/tools/generate_rwanda_upload.py` (deterministic, seed 2026).
