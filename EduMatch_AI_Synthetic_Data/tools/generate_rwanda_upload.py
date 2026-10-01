"""Generate the Rwanda demo upload set: realistic Rwandan names, real Rwandan secondary schools.

Output (in the upload-wizard format: choices are columns of the students file):
    upload_demo/rwanda_2026/            students_2026.csv, schools_2026.csv, placement_rules.json,
                                        placement_rules.pdf (human-readable), README.md
    upload_demo/rwanda_2026_with_errors/ the same files with 5 deliberate mistakes, to show validation

Privacy (SRS NFR-06): the students are NOT real people. Each name is a random pairing of a common
Kinyarwanda family name with a common first name, and every mark is generated. The schools are real,
publicly known institutions, but their A-Level combinations, seats and entry cutoffs here are invented
demo values, not official NESA figures.

Usage:  python EduMatch_AI_Synthetic_Data/tools/generate_rwanda_upload.py      (deterministic, seed 2026)
"""
import csv
import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / 'upload_demo'
SEED = 2026
N_STUDENTS = 320
COHORT_ID = 'RW-2026-S3-DEMO'

# (code, school, district, province, tier) - tier 1 = most competitive. Real schools; demo figures.
SCHOOLS = [
    ('LDK', 'Lycée de Kigali', 'Nyarugenge', 'Kigali City', 1),
    ('CSA', 'Collège Saint André', 'Nyarugenge', 'Kigali City', 2),
    ('GHA', 'Green Hills Academy', 'Gasabo', 'Kigali City', 1),
    ('RHS', 'Riviera High School', 'Gasabo', 'Kigali City', 2),
    ('GSOB', 'Groupe Scolaire Officiel de Butare', 'Huye', 'Southern Province', 1),
    ('ESB', 'Ecole des Sciences de Byimana', 'Ruhango', 'Southern Province', 1),
    ('CCR', 'Collège du Christ-Roi de Nyanza', 'Nyanza', 'Southern Province', 2),
    ('ESM', 'Ecole des Sciences de Musanze', 'Musanze', 'Northern Province', 2),
    ('GSVM', 'Groupe Scolaire Saint Vincent Muhoza', 'Musanze', 'Northern Province', 3),
    ('CIR', 'Collège Inyemeramihigo', 'Rubavu', 'Western Province', 3),
    ('GSAR', 'Groupe Scolaire Saint Aloys Rwamagana', 'Rwamagana', 'Eastern Province', 3),
    ('GSG', 'Groupe Scolaire de Gahini', 'Kayonza', 'Eastern Province', 3),
]

# A-Level combinations -> (full name, weight_math, weight_science, weight_language, subject minimum or None)
COMBINATIONS = {
    'PCM': ('Physics-Chemistry-Mathematics', .50, .40, .10, ('math', 55)),
    'PCB': ('Physics-Chemistry-Biology', .20, .70, .10, ('science', 55)),
    'MCB': ('Mathematics-Chemistry-Biology', .35, .55, .10, None),
    'MPC': ('Mathematics-Physics-Computer Science', .55, .35, .10, ('math', 55)),
    'MEG': ('Mathematics-Economics-Geography', .55, .10, .35, None),
    'HEG': ('History-Economics-Geography', .15, .10, .75, ('language', 50)),
}
OFFERED = {  # which combinations each school runs in this demo
    'LDK': ['PCM', 'MEG', 'HEG'], 'CSA': ['PCB', 'MEG'], 'GHA': ['MPC', 'MCB'], 'RHS': ['MPC', 'HEG'],
    'GSOB': ['PCM', 'PCB', 'HEG'], 'ESB': ['PCM', 'MCB'], 'CCR': ['PCB', 'MEG'], 'ESM': ['PCM', 'MCB'],
    'GSVM': ['MEG', 'HEG'], 'CIR': ['PCB', 'MEG', 'HEG'], 'GSAR': ['MCB', 'HEG'], 'GSG': ['PCB', 'MEG'],
}
TIER_CUTOFF = {1: (72, 78), 2: (60, 66), 3: (44, 50)}
TIER_SEATS = {1: (8, 12), 2: (10, 14), 3: (14, 20)}

FAMILY_NAMES = [
    'Uwimana', 'Mukamana', 'Niyonzima', 'Habimana', 'Nshimiyimana', 'Uwase', 'Ishimwe', 'Mugisha', 'Nsengiyumva',
    'Iradukunda', 'Hakizimana', 'Niyonsenga', 'Tuyishime', 'Mutoni', 'Ingabire', 'Uwineza', 'Umutoni', 'Kayitesi',
    'Mugabo', 'Nkurunziza', 'Bizimana', 'Ndayisaba', 'Twizerimana', 'Munyaneza', 'Ndagijimana', 'Irakoze',
    'Nizeyimana', 'Uwamahoro', 'Mukeshimana', 'Niyigena', 'Byiringiro', 'Rukundo', 'Kwizera', 'Shema', 'Gatete',
    'Karenzi', 'Kalisa', 'Mutabazi', 'Manzi', 'Rwema', 'Cyiza', 'Keza', 'Teta', 'Gisa', 'Umuhoza', 'Uwera',
    'Nyirahabimana', 'Mukandayisenga', 'Habyarimana', 'Ntwari',
]
FIRST_NAMES = [
    'Jean de Dieu', 'Jean Claude', 'Emmanuel', 'Eric', 'Patrick', 'Olivier', 'Aimable', 'Fabrice', 'Didier',
    'Innocent', 'Pacifique', 'Theogene', 'Gilbert', 'Samuel', 'David', 'Joseph', 'Kevin', 'Yves', 'Clement',
    'Fiston', 'Diane', 'Alice', 'Aline', 'Claudine', 'Divine', 'Grace', 'Josiane', 'Clarisse', 'Sandrine',
    'Chantal', 'Esther', 'Ange', 'Belyse', 'Gloria', 'Yvette', 'Solange', 'Denise', 'Vanessa', 'Liliane', 'Diane',
]
PROVINCE_SHARE = [('Kigali City', .26), ('Southern Province', .22), ('Northern Province', .16),
                  ('Western Province', .17), ('Eastern Province', .19)]


def clamp(x):
    return max(0.0, min(100.0, round(x, 1)))


def build(rng: random.Random):
    offers = []
    for code, school, district, province, tier in SCHOOLS:
        for combo in OFFERED[code]:
            full, wm, ws, wl, minimum = COMBINATIONS[combo]
            lo, hi = TIER_CUTOFF[tier]
            s_lo, s_hi = TIER_SEATS[tier]
            row = {'offer_id': f'{code}-{combo}', 'school_name': f'{school} ({combo})', 'province': province,
                   'district': district, 'stage_programme': f'S4 A-Level {combo}: {full}',
                   'capacity': rng.randint(s_lo, s_hi), 'min_overall': rng.randint(lo, hi),
                   'subject_min_math': '', 'subject_min_science': '', 'subject_min_language': '',
                   'weight_math': wm, 'weight_science': ws, 'weight_language': wl}
            if minimum and tier <= 2:
                row[f'subject_min_{minimum[0]}'] = minimum[1] + (5 if tier == 1 else 0)
            offers.append(row)

    provinces = [p for p, _ in PROVINCE_SHARE]
    weights = [w for _, w in PROVINCE_SHARE]
    students, used_names = [], set()
    for i in range(1, N_STUDENTS + 1):
        while True:
            name = f'{rng.choice(FIRST_NAMES)} {rng.choice(FAMILY_NAMES)}'
            if name not in used_names:
                used_names.add(name); break
        ability = rng.gauss(63, 13)
        lean = rng.choice(['science', 'math', 'language', 'balanced'])
        bump = {'math': (6, 0, -4), 'science': (0, 6, -4), 'language': (-4, -3, 7), 'balanced': (0, 0, 0)}[lean]
        math_s = clamp(ability + bump[0] + rng.gauss(0, 7))
        sci_s = clamp(ability + bump[1] + rng.gauss(0, 7))
        lang_s = clamp(ability + bump[2] + rng.gauss(0, 7))
        overall = clamp((math_s + sci_s + lang_s) / 3 + rng.gauss(0, 2))
        province = rng.choices(provinces, weights)[0]

        # Ranked choices: students aim at combinations that suit their strengths, prefer competitive schools
        # they can realistically reach (some still aim too high), lean towards their home province, and
        # rarely list the same school three times.
        def appeal(o):
            fit = (o['weight_math'] * math_s + o['weight_science'] * sci_s + o['weight_language'] * lang_s) / 100
            tier = next(t for c, _, _, _, t in SCHOOLS if o['offer_id'].startswith(c + '-'))
            reach = -2.2 if overall < o['min_overall'] - 6 else 0      # clearly out of reach: usually avoided
            return (fit * 3 + (4 - tier) * .7 + reach + (0.9 if o['province'] == province else 0)
                    + rng.random() * 1.8)
        n_choices = rng.choices([3, 2, 1], [.82, .13, .05])[0]
        picks, schools_used = [], set()
        for o in sorted(offers, key=appeal, reverse=True):
            school = o['offer_id'].split('-')[0]
            if school in schools_used and rng.random() < .7:
                continue
            picks.append(o['offer_id']); schools_used.add(school)
            if len(picks) == n_choices:
                break
        students.append({'student_id': f'RW26-{i:04d}', 'display_name': name, 'cohort_id': COHORT_ID,
                         'province': province, 'overall_score': overall, 'math_score': math_s,
                         'science_score': sci_s, 'language_score': lang_s,
                         'allow_fallback': 'true' if rng.random() < .65 else 'false',
                         'choice_1': picks[0], 'choice_2': picks[1] if n_choices > 1 else '',
                         'choice_3': picks[2] if n_choices > 2 else ''})
    return students, offers


RULES = {
    'rule_version': 'rw-demo-policy-2026-v1',
    'synthetic': True,
    'score_scale': '0-100',
    'score_direction': 'higher_better',
    'priority': 'overall_desc_then_student_id_asc',
    'allow_unlisted_fallback': True,
    'allocation': 'serial_priority',
    'stage_status': 'S3 national exam -> S4 A-Level combination (demo assumption)',
    'notice': 'Demo policy for the EduMatch AI presentation. Not an official NESA rule. Real school names; '
              'combinations, seats and cutoffs are invented. Student names and marks are synthetic.',
}

STUDENT_FIELDS = ['student_id', 'display_name', 'cohort_id', 'province', 'overall_score', 'math_score',
                  'science_score', 'language_score', 'allow_fallback', 'choice_1', 'choice_2', 'choice_3']
OFFER_FIELDS = ['offer_id', 'school_name', 'province', 'district', 'stage_programme', 'capacity', 'min_overall',
                'subject_min_math', 'subject_min_science', 'subject_min_language',
                'weight_math', 'weight_science', 'weight_language']


def write_csv(path: Path, fields, rows):
    with path.open('w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=fields, lineterminator='\n')
        w.writeheader(); w.writerows(rows)


def write_rules_pdf(path: Path, offers, n_students):
    """A short human-readable version of the rules for officers. The system reads placement_rules.json."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.backends.backend_pdf import PdfPages

    pages = [[
        ('EduMatch AI: Placement Rules (Demo, 2026)', 16, 'bold'),
        ('', 10, 'normal'),
        (f'Rule version: {RULES["rule_version"]}  -  Cohort: {COHORT_ID}  -  {n_students} applicants, '
         f'{len(offers)} school offers', 9, 'normal'),
        ('Demo policy only. Not an official NESA rule. Student names and marks are synthetic.', 9, 'italic'),
        ('', 10, 'normal'),
        ('1. Priority', 12, 'bold'),
        ('Applicants are processed by overall score (highest first). Equal scores: lower student ID first.', 10, 'normal'),
        ('2. Ranked choices', 12, 'bold'),
        ('Each applicant lists up to 3 school combinations in order. The first listed choice that the applicant', 10, 'normal'),
        ('qualifies for AND that still has a free seat is proposed.', 10, 'normal'),
        ('3. Entry requirements', 12, 'bold'),
        ('Overall score must reach the school cutoff (min_overall). Some combinations also set a minimum', 10, 'normal'),
        ('mathematics, science or language score.', 10, 'normal'),
        ('4. Capacity', 12, 'bold'),
        ('A combination never receives more students than its seats (draft + approved).', 10, 'normal'),
        ('5. AI-suggested alternative (fallback)', 12, 'bold'),
        ('Only if no listed choice works AND the applicant allowed alternatives (allow_fallback = true):', 10, 'normal'),
        ('the local AI model ranks eligible schools with free seats by subject fit and home province;', 10, 'normal'),
        ('the best one is proposed. The score is a compatibility score (0-100), not a probability.', 10, 'normal'),
        ('6. Human approval', 12, 'bold'),
        ('Every proposal is a draft. An officer approves, changes (with a reason) or rejects it.', 10, 'normal'),
        ('Only approved placements are exported. Every decision is recorded in the audit log.', 10, 'normal'),
    ], [('School offers in this cohort', 14, 'bold'), ('', 8, 'normal')] + [
        (f"{o['offer_id']:<10} {o['school_name'][:52]:<52} {o['district']:<11} seats {o['capacity']:>2}  "
         f"cutoff {o['min_overall']}", 7.5, 'normal') for o in offers]]
    with PdfPages(path) as pdf:
        for lines in pages:
            fig = plt.figure(figsize=(8.27, 11.69))
            y = .95
            for text, size, style in lines:
                fig.text(.07, y, text, fontsize=size, family='monospace' if size < 8 else 'sans-serif',
                         weight='bold' if style == 'bold' else 'normal',
                         style='italic' if style == 'italic' else 'normal')
                y -= .012 + size * .0022
            pdf.savefig(fig); plt.close(fig)


README = """# Rwanda demo upload set (2026)

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
"""


def main():
    rng = random.Random(SEED)
    students, offers = build(rng)
    good = ROOT / 'rwanda_2026'
    good.mkdir(parents=True, exist_ok=True)
    write_csv(good / 'students_2026.csv', STUDENT_FIELDS, students)
    write_csv(good / 'schools_2026.csv', OFFER_FIELDS, offers)
    (good / 'placement_rules.json').write_text(json.dumps(RULES, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    write_rules_pdf(good / 'placement_rules.pdf', offers, len(students))
    (good / 'README.md').write_text(README, encoding='utf-8')

    # Same data with deliberate mistakes, each on a different row, for the validation demo.
    bad_students = [dict(s) for s in students]
    bad_offers = [dict(o) for o in offers]
    bad_students[4]['math_score'] = '105'                       # score out of range
    bad_students[9]['science_score'] = ''                        # blank score (never treated as zero)
    bad_students[14]['student_id'] = bad_students[13]['student_id']  # duplicate student
    bad_students[19]['choice_2'] = 'LDK-XYZ'                     # unknown school combination
    bad_offers[2]['capacity'] = '-3'                             # negative seats
    bad = ROOT / 'rwanda_2026_with_errors'
    bad.mkdir(parents=True, exist_ok=True)
    write_csv(bad / 'students_2026.csv', STUDENT_FIELDS, bad_students)
    write_csv(bad / 'schools_2026.csv', OFFER_FIELDS, bad_offers)
    (bad / 'placement_rules.json').write_text(json.dumps(RULES, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

    seats = sum(o['capacity'] for o in offers)
    print(f'{len(students)} students, {len(offers)} school offers, {seats} seats -> {good}')
    print(f'error variant -> {bad}')


if __name__ == '__main__':
    main()
