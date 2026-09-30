import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  Student,
  Offer,
  Preference,
  PlacementProposal,
  PlacementRun,
  AuditEvent,
  DemoRules,
  DashboardMetrics
} from './src/types';
import {
  DEFAULT_RULES,
  MODEL_METADATA,
  executePlacement,
  getFeasibleAlternatives,
  checkEligibility
} from './src/services/placementEngine';
import {
  FIXTURE_6_OFFERS,
  FIXTURE_6_STUDENTS,
  FIXTURE_6_PREFERENCES,
  SYNTHETIC_12_OFFERS,
  generateSyntheticCohort,
  generateStressBenchmark
} from './src/services/fixtures';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-Memory Database Store (persistent across calls during process runtime)
interface Store {
  cohortId: string;
  sourceLabel: string;
  inputVersion: number;
  rules: DemoRules;
  students: Student[];
  offers: Offer[];
  preferences: Preference[];
  activeRun: PlacementRun | null;
  proposals: PlacementProposal[];
  auditHistory: AuditEvent[];
  sessionUser: { username: string; role: string; name: string } | null;
}

const defaultCohort = generateSyntheticCohort(200, 42, SYNTHETIC_12_OFFERS);

const store: Store = {
  cohortId: 'COHORT-RW-2026-SYNTH',
  sourceLabel: 'Synthetic demonstration data (Group 3 / NESA pilot demo)',
  inputVersion: 1,
  rules: { ...DEFAULT_RULES },
  students: defaultCohort.students,
  offers: [...SYNTHETIC_12_OFFERS],
  preferences: defaultCohort.preferences,
  activeRun: null,
  proposals: [],
  auditHistory: [
    {
      id: 'AUD-001',
      timestamp: new Date().toISOString(),
      actor: 'system',
      action: 'SEED',
      reason: 'Initialized default 200-student synthetic demo cohort with 12 school offers.'
    }
  ],
  sessionUser: {
    username: 'officer.demo@nesa.gov.rw',
    role: 'Officer',
    name: 'Aline Umutoni (NESA Senior Placement Officer)'
  }
};

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.use(express.json());

  // -------------------------------------------------------------
  // REST API Routes (/api/...) matching SRS Contracts
  // -------------------------------------------------------------

  // Health
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'healthy',
      system: 'EduMatch AI Placement Engine',
      version: 'v1.0-demo',
      time: new Date().toISOString()
    });
  });

  // Auth: Login
  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Missing username or password' });
    }
    // Accept demo officer or admin
    store.sessionUser = {
      username: username || 'officer.demo@nesa.gov.rw',
      role: username.toLowerCase().includes('admin') ? 'Administrator' : 'Officer',
      name: 'Aline Umutoni (NESA Senior Placement Officer)'
    };
    res.json({ success: true, user: store.sessionUser });
  });

  // Auth: Current User
  app.get('/api/auth/me', (req, res) => {
    res.json({ user: store.sessionUser });
  });

  // Auth: Logout
  app.post('/api/auth/logout', (req, res) => {
    store.sessionUser = null;
    res.json({ success: true, message: 'Logged out successfully' });
  });

  // Model Status (FR-07, SRS Section 12)
  app.get('/api/model/status', (req, res) => {
    res.json({
      ...MODEL_METADATA,
      status: 'OPERATIONAL',
      runtime_notes: 'Scores provide numeric compatibility ranking [0,100] for eligible unlisted fallbacks. Not admission probability.'
    });
  });

  // Cohort Summary (SRS page 9)
  app.get('/api/cohorts/:id/summary', (req, res) => {
    res.json({
      cohort_id: store.cohortId,
      source_label: store.sourceLabel,
      is_synthetic: true,
      input_version: store.inputVersion,
      rules_version: store.rules.rule_version,
      student_count: store.students.length,
      offer_count: store.offers.length,
      preference_count: store.preferences.length,
      active_run_id: store.activeRun?.run_id || null,
      active_run_status: store.activeRun?.status || null
    });
  });

  // Offers Catalog (SRS page 9)
  app.get('/api/offers', (req, res) => {
    // Calculate current reserved and approved counts from proposals
    const reservedMap = new Map<string, number>();
    const approvedMap = new Map<string, number>();

    for (const p of store.proposals) {
      if (p.offer_id && (p.status === 'DRAFT' || p.status === 'APPROVED' || p.status === 'CHANGED')) {
        reservedMap.set(p.offer_id, (reservedMap.get(p.offer_id) || 0) + 1);
      }
      if (p.offer_id && p.status === 'APPROVED') {
        approvedMap.set(p.offer_id, (approvedMap.get(p.offer_id) || 0) + 1);
      }
    }

    const offersWithUsage = store.offers.map(o => ({
      ...o,
      reserved_count: reservedMap.get(o.offer_id) || 0,
      approved_count: approvedMap.get(o.offer_id) || 0,
      remaining_seats: Math.max(0, o.capacity - (reservedMap.get(o.offer_id) || 0))
    }));

    res.json({
      cohort_id: store.cohortId,
      input_version: store.inputVersion,
      offers: offersWithUsage
    });
  });

  // Seed / Reset Demo Data (FR-02, AT-01, AT-02, AT-04, AT-08)
  app.post('/api/demo/seed', (req, res) => {
    const { fixture = '200_standard', reset = false, custom_s3_fallback } = req.body;

    if (store.proposals.some(p => p.status === 'APPROVED') && !reset) {
      return res.status(409).json({
        code: 'APPROVALS_EXIST',
        message: 'Active cohort has approved decisions. Explicit reset=true is required to overwrite.'
      });
    }

    let loadedType = '';
    if (fixture === '6_fixture') {
      store.cohortId = 'COHORT-DEMO-6';
      store.offers = FIXTURE_6_OFFERS.map(o => ({ ...o }));
      store.students = FIXTURE_6_STUDENTS.map(s => {
        if (s.student_id === 'S3' && custom_s3_fallback !== undefined) {
          return { ...s, allow_fallback: custom_s3_fallback };
        }
        return { ...s };
      });
      store.preferences = FIXTURE_6_PREFERENCES.map(p => ({ ...p }));
      loadedType = '6-Student Verifiable Benchmark (Section 21)';
    } else if (fixture === '500_stress') {
      const benchmark = generateStressBenchmark();
      store.cohortId = 'COHORT-STRESS-500';
      store.offers = benchmark.offers;
      store.students = benchmark.students;
      store.preferences = benchmark.preferences;
      loadedType = '500-Student Stress Benchmark (NFR-02)';
    } else {
      const standard = generateSyntheticCohort(200, 42, SYNTHETIC_12_OFFERS);
      store.cohortId = 'COHORT-RW-2026-SYNTH';
      store.offers = SYNTHETIC_12_OFFERS.map(o => ({ ...o }));
      store.students = standard.students;
      store.preferences = standard.preferences;
      loadedType = '200-Student Standard Synthetic Cohort (FR-02)';
    }

    store.inputVersion += 1;
    store.activeRun = null;
    store.proposals = [];

    store.auditHistory.unshift({
      id: `AUD-${Date.now().toString().slice(-5)}`,
      timestamp: new Date().toISOString(),
      actor: store.sessionUser?.name || 'Demo Administrator',
      action: 'SEED',
      reason: `Loaded seed fixture: ${loadedType}`
    });

    res.json({
      success: true,
      cohort_id: store.cohortId,
      student_count: store.students.length,
      offer_count: store.offers.length,
      input_version: store.inputVersion,
      fixture_loaded: loadedType
    });
  });

  // Patch Offer Capacity / Threshold (Administrator, FR-05)
  app.patch('/api/offers/:id', (req, res) => {
    const { id } = req.params;
    const { capacity, min_overall } = req.body;

    // Check if any approval exists
    if (store.proposals.some(p => p.status === 'APPROVED')) {
      return res.status(409).json({
        code: 'COHORT_LOCKED',
        message: 'Cannot edit school offers when approved decisions exist. Administrator must reset the cohort.'
      });
    }

    const offerIndex = store.offers.findIndex(o => o.offer_id === id);
    if (offerIndex === -1) {
      return res.status(404).json({ error: 'Offer not found' });
    }

    if (capacity !== undefined) {
      if (typeof capacity !== 'number' || capacity < 0) {
        return res.status(422).json({ code: 'INVALID_CAPACITY', message: 'Capacity must be a non-negative integer' });
      }
      store.offers[offerIndex].capacity = capacity;
    }

    if (min_overall !== undefined) {
      if (typeof min_overall !== 'number' || min_overall < 0 || min_overall > 100) {
        return res.status(422).json({ code: 'INVALID_SCORE', message: 'Threshold must be between 0 and 100' });
      }
      store.offers[offerIndex].min_overall = min_overall;
    }

    store.inputVersion += 1;
    if (store.activeRun) {
      store.activeRun.status = 'STALE';
    }

    store.auditHistory.unshift({
      id: `AUD-${Date.now().toString().slice(-5)}`,
      timestamp: new Date().toISOString(),
      actor: store.sessionUser?.name || 'Administrator',
      action: 'CHANGE',
      reason: `Updated offer ${id} properties. Incremented input version to ${store.inputVersion}. Marked existing run as STALE.`
    });

    res.json({
      success: true,
      updated_offer: store.offers[offerIndex],
      input_version: store.inputVersion
    });
  });

  // Execute Allocation Run (FR-06, FR-07, FR-08, FR-09)
  app.post('/api/runs', (req, res) => {
    const { mode = 'AI_ASSISTED' } = req.body;

    // Cannot run if existing approved decisions exist without reset
    if (store.proposals.some(p => p.status === 'APPROVED')) {
      return res.status(409).json({
        code: 'APPROVED_RESULTS_EXIST',
        message: 'Final approvals are locked in the active plan. Administrator must reset before re-running.'
      });
    }

    const rules = { ...store.rules };
    if (mode === 'RULES_ONLY') {
      rules.allow_unlisted_fallback = false;
    }

    const result = executePlacement(store.students, store.offers, store.preferences, rules);
    const runId = `RUN-${Date.now().toString().slice(-6)}`;

    store.proposals = result.proposals;
    store.activeRun = {
      run_id: runId,
      cohort_id: store.cohortId,
      status: 'UNDER_REVIEW',
      mode: mode === 'RULES_ONLY' ? 'RULES_ONLY' : 'AI_ASSISTED',
      input_version: store.inputVersion,
      rule_version: rules.rule_version,
      model_version: MODEL_METADATA.version,
      runtime_ms: result.runtime_ms,
      created_at: new Date().toISOString(),
      metrics: result.metrics
    };

    store.auditHistory.unshift({
      id: `AUD-${Date.now().toString().slice(-5)}`,
      timestamp: new Date().toISOString(),
      actor: store.sessionUser?.name || 'NESA Officer',
      action: 'GENERATE',
      run_id: runId,
      reason: `Generated placement proposals for ${store.students.length} applicants across ${store.offers.length} offers in ${result.runtime_ms}ms (${mode} mode).`
    });

    res.json({
      success: true,
      run_id: runId,
      metrics: result.metrics,
      runtime_ms: result.runtime_ms,
      status: store.activeRun.status,
      proposals_count: store.proposals.length
    });
  });

  // Get Proposals for current/specific run (FR-10)
  app.get('/api/runs/:id/proposals', (req, res) => {
    const { status, offer_id, search, unassigned_only } = req.query;

    let filtered = [...store.proposals];

    if (unassigned_only === 'true') {
      filtered = filtered.filter(p => p.status === 'UNASSIGNED' || p.status === 'REJECTED' || !p.offer_id);
    } else if (status) {
      filtered = filtered.filter(p => p.status === status);
    }

    if (offer_id) {
      filtered = filtered.filter(p => p.offer_id === offer_id);
    }

    // Join with student information and offer info
    const studentsMap = new Map(store.students.map(s => [s.student_id, s]));
    const offersMap = new Map(store.offers.map(o => [o.offer_id, o]));
    const prefsMap = new Map<string, Preference[]>();
    for (const p of store.preferences) {
      const list = prefsMap.get(p.student_id) || [];
      list.push(p);
      prefsMap.set(p.student_id, list);
    }

    let results = filtered.map(p => {
      const student = studentsMap.get(p.student_id);
      const offer = p.offer_id ? offersMap.get(p.offer_id) : null;
      const prefs = (prefsMap.get(p.student_id) || []).sort((a, b) => a.rank - b.rank);

      return {
        proposal: p,
        student,
        offer,
        choices: prefs.map(pref => {
          const choiceOffer = offersMap.get(pref.offer_id);
          return {
            rank: pref.rank,
            offer_id: pref.offer_id,
            school_name: choiceOffer?.school_name || pref.offer_id,
            min_overall: choiceOffer?.min_overall,
            capacity: choiceOffer?.capacity
          };
        })
      };
    });

    if (search && typeof search === 'string') {
      const query = search.toLowerCase();
      results = results.filter(r =>
        r.student?.student_id.toLowerCase().includes(query) ||
        r.student?.display_name.toLowerCase().includes(query) ||
        r.offer?.school_name.toLowerCase().includes(query)
      );
    }

    res.json({
      run_id: req.params.id,
      total_count: results.length,
      metrics: store.activeRun?.metrics || null,
      results
    });
  });

  // Alternatives for a Proposal (SRS Section 17 & page 9)
  app.get('/api/proposals/:student_id/alternatives', (req, res) => {
    const { student_id } = req.params;
    const student = store.students.find(s => s.student_id === student_id);
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const alternatives = getFeasibleAlternatives(student, store.offers, store.proposals);
    res.json({
      student_id,
      student_name: student.display_name,
      overall_score: student.overall_score,
      alternatives
    });
  });

  // Decision on Proposal: Approve, Change, or Reject (FR-11, FR-12, FR-13, FR-14)
  app.post('/api/proposals/:student_id/decision', (req, res) => {
    const { student_id } = req.params;
    const { action, offer_id, reason, expected_revision } = req.body;

    const proposalIndex = store.proposals.findIndex(p => p.student_id === student_id);
    if (proposalIndex === -1) {
      return res.status(404).json({ error: 'Proposal for student not found' });
    }

    const curProposal = store.proposals[proposalIndex];
    const student = store.students.find(s => s.student_id === student_id)!;

    // Check stale revision (FR-14)
    if (expected_revision !== undefined && curProposal.revision !== expected_revision) {
      return res.status(409).json({
        code: 'STALE_REVISION',
        message: `Conflict: Proposal revision is ${curProposal.revision}, expected ${expected_revision}. Please reload data.`
      });
    }

    const actor = store.sessionUser?.name || 'NESA Officer';

    if (action === 'APPROVE') {
      if (!curProposal.offer_id) {
        return res.status(422).json({
          code: 'CANNOT_APPROVE_UNASSIGNED',
          message: 'Cannot approve an unassigned case without assigning a feasible offer first.'
        });
      }

      curProposal.status = 'APPROVED';
      curProposal.reviewer = actor;
      curProposal.revision += 1;
      curProposal.updated_at = new Date().toISOString();

      store.auditHistory.unshift({
        id: `AUD-${Date.now().toString().slice(-5)}`,
        timestamp: new Date().toISOString(),
        actor,
        action: 'APPROVE',
        student_id,
        new_offer_id: curProposal.offer_id,
        reason: reason || 'Officer verified eligibility and capacity requirements'
      });

      // Update approved count in metrics
      if (store.activeRun) {
        store.activeRun.metrics.approved_count = store.proposals.filter(p => p.status === 'APPROVED').length;
      }

      return res.json({ success: true, proposal: curProposal });
    }

    if (action === 'CHANGE') {
      if (!reason || reason.trim().length === 0) {
        return res.status(422).json({
          code: 'MISSING_REASON',
          message: 'Controlled officer overrides require a mandatory, non-empty reason.'
        });
      }

      if (!offer_id) {
        return res.status(400).json({ error: 'Target offer_id is required for change action' });
      }

      const targetOffer = store.offers.find(o => o.offer_id === offer_id);
      if (!targetOffer) {
        return res.status(404).json({ error: 'Target school offer not found' });
      }

      // Check eligibility (SRS Section 17: returns 422 INELIGIBLE_OFFER)
      const { eligible, reasons } = checkEligibility(student, targetOffer);
      if (!eligible) {
        return res.status(422).json({
          code: 'INELIGIBLE_OFFER',
          message: `Cannot assign ${targetOffer.school_name}: ${reasons.join(', ')}`
        });
      }

      // Check capacity against other active reservations (excluding student's current reservation)
      let activeUsage = 0;
      for (const p of store.proposals) {
        if (p.student_id !== student_id && p.offer_id === offer_id && (p.status === 'DRAFT' || p.status === 'APPROVED' || p.status === 'CHANGED')) {
          activeUsage++;
        }
      }

      if (activeUsage >= targetOffer.capacity) {
        return res.status(409).json({
          code: 'CAPACITY_FULL',
          message: `Cannot assign ${targetOffer.school_name}: Capacity is completely full (${activeUsage}/${targetOffer.capacity})`
        });
      }

      const oldOfferId = curProposal.offer_id;
      curProposal.offer_id = offer_id;
      curProposal.status = 'CHANGED'; // New draft revision requiring officer approval
      curProposal.decision_reason = reason;
      curProposal.reviewer = actor;
      curProposal.revision += 1;
      curProposal.updated_at = new Date().toISOString();

      store.auditHistory.unshift({
        id: `AUD-${Date.now().toString().slice(-5)}`,
        timestamp: new Date().toISOString(),
        actor,
        action: 'CHANGE',
        student_id,
        old_offer_id: oldOfferId,
        new_offer_id: offer_id,
        reason
      });

      return res.json({ success: true, proposal: curProposal });
    }

    if (action === 'REJECT') {
      if (!reason || reason.trim().length === 0) {
        return res.status(422).json({
          code: 'MISSING_REASON',
          message: 'Rejecting a proposal requires an explanatory reason for the exception queue.'
        });
      }

      const oldOfferId = curProposal.offer_id;
      // Rejection releases provisional seat without losing student (FR-13)
      curProposal.offer_id = null;
      curProposal.status = 'REJECTED';
      curProposal.decision_reason = reason;
      curProposal.reviewer = actor;
      curProposal.revision += 1;
      curProposal.updated_at = new Date().toISOString();

      store.auditHistory.unshift({
        id: `AUD-${Date.now().toString().slice(-5)}`,
        timestamp: new Date().toISOString(),
        actor,
        action: 'REJECT',
        student_id,
        old_offer_id: oldOfferId,
        reason
      });

      return res.json({ success: true, proposal: curProposal });
    }

    res.status(400).json({ error: `Unsupported action '${action}'` });
  });

  // Bulk Approval of Unchanged Valid Proposals (P1 scope)
  app.post('/api/runs/:id/bulk-approve', (req, res) => {
    const actor = store.sessionUser?.name || 'NESA Officer';
    let approvedCount = 0;

    for (const p of store.proposals) {
      if (p.offer_id && (p.status === 'DRAFT' || p.status === 'CHANGED')) {
        p.status = 'APPROVED';
        p.reviewer = actor;
        p.revision += 1;
        p.updated_at = new Date().toISOString();
        approvedCount++;
      }
    }

    if (store.activeRun) {
      store.activeRun.metrics.approved_count = store.proposals.filter(p => p.status === 'APPROVED').length;
    }

    store.auditHistory.unshift({
      id: `AUD-${Date.now().toString().slice(-5)}`,
      timestamp: new Date().toISOString(),
      actor,
      action: 'APPROVE',
      reason: `Bulk approved ${approvedCount} valid draft proposals after verification.`
    });

    res.json({
      success: true,
      bulk_approved_count: approvedCount,
      total_approved: store.proposals.filter(p => p.status === 'APPROVED').length
    });
  });

  // Export Approved CSV (FR-15, Section 17)
  app.get('/api/runs/:id/export.csv', (req, res) => {
    const approvedProposals = store.proposals.filter(p => p.status === 'APPROVED' && p.offer_id);
    const studentsMap = new Map(store.students.map(s => [s.student_id, s]));
    const offersMap = new Map(store.offers.map(o => [o.offer_id, o]));

    const headers = [
      'student_id',
      'student_name',
      'offer_id',
      'school_name',
      'stage_programme',
      'preference_rank',
      'is_fallback',
      'fit_score',
      'officer_reviewer',
      'decision_timestamp',
      'rule_version',
      'model_version'
    ];

    const rows = approvedProposals.map(p => {
      const s = studentsMap.get(p.student_id);
      const o = offersMap.get(p.offer_id!);
      return [
        `"${p.student_id}"`,
        `"${s?.display_name || ''}"`,
        `"${p.offer_id}"`,
        `"${o?.school_name || ''}"`,
        `"${o?.stage_programme || ''}"`,
        p.preference_rank || 'N/A',
        p.is_fallback ? 'TRUE' : 'FALSE',
        p.fit_score !== null ? p.fit_score : '',
        `"${p.reviewer || 'NESA Officer'}"`,
        `"${p.updated_at}"`,
        `"${p.rule_version}"`,
        `"${p.model_version}"`
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="edumatch_approved_placements.csv"');
    res.send(csvContent);
  });

  // Export Exceptions CSV
  app.get('/api/runs/:id/exceptions.csv', (req, res) => {
    const exceptions = store.proposals.filter(p => !p.offer_id || p.status === 'UNASSIGNED' || p.status === 'REJECTED');
    const studentsMap = new Map(store.students.map(s => [s.student_id, s]));

    const headers = ['student_id', 'student_name', 'overall_score', 'province', 'status', 'reason_codes', 'decision_reason'];
    const rows = exceptions.map(p => {
      const s = studentsMap.get(p.student_id);
      return [
        `"${p.student_id}"`,
        `"${s?.display_name || ''}"`,
        s?.overall_score || '',
        `"${s?.province || ''}"`,
        p.status,
        `"${p.reason_codes.join('; ')}"`,
        `"${p.decision_reason || ''}"`
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="edumatch_unassigned_exceptions.csv"');
    res.send(csvContent);
  });

  // Audit History
  app.get('/api/audit-trail', (req, res) => {
    res.json({ audit_trail: store.auditHistory });
  });

  // -------------------------------------------------------------
  // Vite Middleware Integration for React SPA
  // -------------------------------------------------------------
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`EduMatch AI server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start EduMatch AI server:', err);
});
