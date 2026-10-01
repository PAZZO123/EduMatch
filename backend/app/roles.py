"""The UI's four job titles mapped onto three server-enforced permission levels.

ADMIN   — seed/import/edit inputs, reset, switch models, manage users, plus everything below.
OFFICER — generate runs and approve / change / reject proposals (the SRS "Officer").
VIEWER  — read-only: dashboards, proposals, explanations, exports.
"""
TITLE_TO_ROLE = {
    'Super Administrator': 'ADMIN',
    'Placement Administrator': 'ADMIN',
    'Placement Officer': 'OFFICER',
    'School Administrator': 'VIEWER',
}
DEFAULT_TITLE = {'ADMIN': 'Super Administrator', 'OFFICER': 'Placement Officer', 'VIEWER': 'School Administrator'}
SELF_REGISTRATION_TITLES = ('Placement Officer', 'School Administrator')
REVIEWER_ROLES = ('ADMIN', 'OFFICER')
