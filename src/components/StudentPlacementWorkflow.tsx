import React, { useState, useEffect, useRef } from 'react';
import {
  UploadCloud,
  FileText,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  RefreshCw,
  X,
  Search,
  Filter,
  Sliders,
  ChevronDown,
  ChevronRight,
  Check,
  Eye,
  Download,
  Sparkles,
  Building,
  MapPin,
  UserCheck,
  AlertCircle,
  Lock,
  Layers,
  RotateCcw,
  CheckSquare,
  Info,
  User,
  ExternalLink
} from 'lucide-react';
import { api, ImportFiles, ImportPreview, OpenOffer } from '../services/api';
import { authService, UserAccount, canReviewRole } from '../services/auth';
import {
  Student,
  Offer,
  PlacementProposal,
  DashboardMetrics,
  AuditEvent,
  AlternativeOfferOption
} from '../types';

type FileRole = 'students' | 'schools' | 'preferences' | 'rules' | 'reference' | 'unsupported';

interface UploadedFileItem {
  id: string;
  name: string;
  type: 'CSV' | 'JSON' | 'XLSX' | 'PDF' | 'OTHER';
  size: string;
  role: FileRole;
  file: File;
  description: string;
}

/** What the backend validated (dry run for uploads, or the loaded sample cohort). All numbers are real. */
interface ValidationData {
  source: 'upload' | 'sample';
  cohortId: string;
  students: number;
  schools: number;
  seats: number;
  preferences: number;
  provinces: string[];
  fallbackOptIn: number | null;
  ruleVersion: string;
  zeroCapacity: string[];
  cohortExists: boolean;
  cohortHasApprovals: boolean;
}

interface ImportError {
  file: string;
  row: number | null;
  field: string | null;
  code: string;
  message: string;
}

const WORKFLOW_STEPS = [
  { num: '01', key: 1, label: 'Upload', desc: 'Placement Files' },
  { num: '02', key: 2, label: 'Validate', desc: 'Data Integrity' },
  { num: '03', key: 3, label: 'AI Match', desc: 'Matching Engine' },
  { num: '04', key: 4, label: 'Review', desc: 'Inspect Results' },
  { num: '05', key: 5, label: 'Approve', desc: 'Sign-off' },
  { num: '06', key: 6, label: 'Complete', desc: 'Finalized' }
];

const ROLE_LABEL: Record<FileRole, string> = {
  students: 'Students & ranked choices',
  schools: 'Schools, seats & entry cutoffs',
  preferences: 'Ranked choices (separate file)',
  rules: 'Placement rules (machine-readable)',
  reference: 'Reference document (not machine-read)',
  unsupported: 'Not recognised'
};

const ORDINAL = (n: number) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);

/** Recognise an uploaded file by its extension and CSV header row. */
async function classifyFile(file: File): Promise<{ role: FileRole; type: UploadedFileItem['type']; description: string }> {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (ext === 'pdf') {
    return {
      role: 'reference',
      type: 'PDF',
      description: 'Kept for officers to read. The system does not read PDFs; it applies the JSON rules file (or the built-in demo policy).'
    };
  }
  if (ext === 'json') return { role: 'rules', type: 'JSON', description: 'Placement policy the engine will apply.' };
  if (ext === 'xlsx' || ext === 'xls') {
    return { role: 'unsupported', type: 'XLSX', description: 'Excel files are not read directly. Save the sheet as CSV (UTF-8) and upload that.' };
  }
  if (ext !== 'csv') return { role: 'unsupported', type: 'OTHER', description: 'Upload CSV, JSON or PDF files.' };
  const header = (await file.slice(0, 4096).text()).split(/\r?\n/)[0].replace(/^﻿/, '').toLowerCase();
  const cols = header.split(',').map(c => c.trim());
  const has = (...names: string[]) => names.every(n => cols.includes(n));
  if (has('student_id', 'offer_id', 'rank')) return { role: 'preferences', type: 'CSV', description: 'One row per student choice (student_id, offer_id, rank).' };
  if (has('offer_id', 'capacity')) return { role: 'schools', type: 'CSV', description: 'One row per school combination: seats, cutoff, subject weights.' };
  if (has('student_id', 'overall_score')) {
    return {
      role: 'students',
      type: 'CSV',
      description: has('choice_1') ? 'Applicants with scores and ranked choices (choice_1..choice_3).' : 'Applicants with scores (choices must come from a preferences file).'
    };
  }
  return { role: 'unsupported', type: 'CSV', description: 'Columns not recognised as students, schools or preferences.' };
}

/** Labels for the recorded exceptions an officer assignment would need. */
const ExceptionBadges: React.FC<{ option: OpenOffer }> = ({ option }) => (
  <div className="flex flex-wrap gap-1 mt-1">
    {option.exceptions_needed.length === 0 && (
      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
        {option.listed_rank ? `Student's choice ${option.listed_rank}` : 'Allowed (student accepts alternatives)'}
      </span>
    )}
    {option.exceptions_needed.includes('OUTSIDE_CHOICES') && (
      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
        Exception: outside the student's choices
      </span>
    )}
    {option.exceptions_needed.includes('BELOW_ENTRY_REQUIREMENTS') && (
      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
        Exception: {option.shortfall} point(s) below entry requirements (
        {option.failures.map(f => `${f.rule.replace('subject_min_', '').replace('min_overall', 'overall')} ${f.actual} < ${f.required}`).join(', ')})
      </span>
    )}
  </div>
);

export const StudentPlacementWorkflow: React.FC<{
  initialStudentId?: string;
  onRefreshProposals?: () => void;
  onReturnDashboard?: () => void;
}> = ({ initialStudentId, onRefreshProposals, onReturnDashboard }) => {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [maxUnlockedStep, setMaxUnlockedStep] = useState<number>(1);

  // Step 1: Upload Files (real File objects, recognised by their columns)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 2: Validation (backend dry run, or the loaded sample cohort)
  const [validation, setValidation] = useState<ValidationData | null>(null);
  const [importErrors, setImportErrors] = useState<ImportError[]>([]);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [issuesAcknowledged, setIssuesAcknowledged] = useState(true);

  // Step 3: AI Matching Engine
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStageIndex, setProcessingStageIndex] = useState(0);
  const [aiMatchingComplete, setAiMatchingComplete] = useState(false);
  const [runSummary, setRunSummary] = useState<{ runtime_ms: number; mode: string; model: string | null } | null>(null);

  const processingStages = [
    'Checking every applicant against school entry cutoffs...',
    'Allocating seats in priority order (highest score first)...',
    'Trying each applicant’s ranked choices...',
    'Asking the AI model to rank alternatives for opted-in applicants...',
    'Re-checking capacity, eligibility and one-seat-per-student...'
  ];

  // Step 4 & 5: Proposals Data
  const [proposals, setProposals] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [offersList, setOffersList] = useState<Offer[]>([]);
  const [auditList, setAuditList] = useState<AuditEvent[]>([]);
  const [loadingProposals, setLoadingProposals] = useState(false);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DRAFT' | 'APPROVED' | 'CHANGED' | 'UNASSIGNED'>('ALL');
  const [schoolFilter, setSchoolFilter] = useState('ALL');
  const [basisFilter, setBasisFilter] = useState<'ALL' | 'CHOICE_1' | 'CHOICE_2_3' | 'AI'>('ALL');

  // Bulk Selection
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());

  // Student Details (backend explanation) & Manual Override (feasible alternatives only)
  const [detailStudent, setDetailStudent] = useState<any | null>(null);
  const [detailData, setDetailData] = useState<any | null>(null);
  const [detailAlternatives, setDetailAlternatives] = useState<AlternativeOfferOption[] | null>(null);
  const [manualOverrideModalOpen, setManualOverrideModalOpen] = useState(false);
  const [manualTargetStudent, setManualTargetStudent] = useState<any | null>(null);
  const [manualOptions, setManualOptions] = useState<AlternativeOfferOption[] | null>(null);
  const [manualSelectedOfferId, setManualSelectedOfferId] = useState('');
  const [manualReason, setManualReason] = useState('Family request after consultation');
  const [manualReasonNote, setManualReasonNote] = useState('');
  const [manualLoading, setManualLoading] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  // Officer assignment of an unplaced student to ANY school with free seats (recorded exceptions)
  const [detailOpenOffers, setDetailOpenOffers] = useState<OpenOffer[] | null>(null);
  const [assignTarget, setAssignTarget] = useState<any | null>(null);
  const [assignOptions, setAssignOptions] = useState<OpenOffer[] | null>(null);
  const [assignSelected, setAssignSelected] = useState('');
  const [assignReason, setAssignReason] = useState('Officer placement of an unplaced student');
  const [assignNote, setAssignNote] = useState('');
  const [assignConfirmBelow, setAssignConfirmBelow] = useState(false);
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  // Step 5: Final Confirmation Modal
  const [approveConfirmModalOpen, setApproveConfirmModalOpen] = useState(false);
  const [finalApprovalAgreement, setFinalApprovalAgreement] = useState(false);
  const [finalizingLoading, setFinalizingLoading] = useState(false);

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const currentUser: UserAccount | null = authService.getCurrentUser();
  const canReview = canReviewRole(currentUser?.role);
  const canImport = currentUser?.role === 'Super Administrator' || currentUser?.role === 'Placement Administrator';

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 5000);
  };

  const goToStep = (stepNumber: number) => {
    setCurrentStep(stepNumber);
    setMaxUnlockedStep(prev => Math.max(prev, stepNumber));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /** Reload proposals, offers, metrics and audit from the backend (the single source of truth). */
  const loadData = async (openStudentId?: string) => {
    setLoadingProposals(true);
    try {
      const summary = await api.getCohortSummary();
      const offersRes = await api.getOffers();
      setOffersList(offersRes.offers);
      const runId = summary.active_run_id;
      setActiveRunId(runId);
      if (runId) {
        const propRes = await api.getProposals(runId);
        setProposals(propRes.results);
        setMetrics(propRes.metrics);
        setMaxUnlockedStep(prev => Math.max(prev, 4));
        const wanted = openStudentId || initialStudentId;
        if (wanted) {
          const found = propRes.results.find(r => r.student.student_id === wanted);
          if (found) openDetails(found);
        }
      } else {
        setProposals([]);
        setMetrics(null);
      }
      const auditRes = await api.getAuditTrail();
      setAuditList(auditRes.audit_trail || []);
      return runId;
    } catch (err) {
      console.error('Failed to load placement data:', err);
      return null;
    } finally {
      setLoadingProposals(false);
    }
  };

  useEffect(() => {
    // An existing run opens straight on the review step; otherwise start at upload.
    loadData().then(runId => {
      if (runId) setCurrentStep(4);
    });
  }, []);

  // ==========================================
  // Step 1: Upload
  // ==========================================
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const picked = Array.from(files); // copy now: the input is cleared right after this call returns
    const added: UploadedFileItem[] = [];
    for (let i = 0; i < picked.length; i++) {
      const file = picked[i];
      const info = await classifyFile(file);
      added.push({
        id: `f-${Date.now()}-${i}`,
        name: file.name,
        size: file.size < 1024 * 1024 ? `${Math.max(1, Math.round(file.size / 1024))} KB` : `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
        file,
        ...info
      });
    }
    // A new file of the same role replaces the previous one (reference PDFs and unsupported files are just listed).
    setUploadedFiles(prev => {
      const replaced = new Set(added.filter(f => !['reference', 'unsupported'].includes(f.role)).map(f => f.role));
      return [...prev.filter(f => !replaced.has(f.role)), ...added];
    });
    setValidation(null);
    setImportErrors([]);
    showToast(`Added ${added.length} file(s).`, 'info');
  };

  const handleRemoveFile = (id: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== id));
    setValidation(null);
    setImportErrors([]);
  };

  const fileFor = (role: FileRole) => uploadedFiles.find(f => f.role === role)?.file || null;
  const nameFor = (canonical: string) => {
    // Show backend error file names as the names the officer actually uploaded.
    const role: Record<string, FileRole> = { 'students.csv': 'students', 'offers.csv': 'schools', 'preferences.csv': 'preferences', 'rules.json': 'rules' };
    return uploadedFiles.find(f => f.role === role[canonical])?.name || canonical;
  };
  const importFiles = (): ImportFiles | null => {
    const students = fileFor('students');
    const offers = fileFor('schools');
    if (!students || !offers) return null;
    return { students, offers, preferences: fileFor('preferences'), rules: fileFor('rules') };
  };

  const handleLoadPresetCohort = async (fixture: '200_standard' | '6_fixture' | '500_stress') => {
    try {
      showToast('Loading sample cohort...', 'info');
      const res = await api.seedDemo(fixture, true);
      const [summary, offersRes] = await Promise.all([api.getCohortSummary(), api.getOffers()]);
      setUploadedFiles([]);
      setImportErrors([]);
      setValidation({
        source: 'sample',
        cohortId: summary.cohort_id,
        students: summary.student_count,
        schools: summary.offer_count,
        seats: summary.total_seats,
        preferences: summary.preference_count,
        provinces: Array.from(new Set(offersRes.offers.map(o => o.province))).sort(),
        fallbackOptIn: null,
        ruleVersion: summary.rules_version,
        zeroCapacity: offersRes.offers.filter(o => o.capacity === 0).map(o => o.offer_id),
        cohortExists: true,
        cohortHasApprovals: false
      });
      setIssuesAcknowledged(true);
      setAiMatchingComplete(false);
      await loadData();
      if (onRefreshProposals) onRefreshProposals();
      showToast(`Loaded ${res.fixture_loaded}: ${res.student_count} students, ${res.offer_count} school offers.`);
      goToStep(2);
    } catch (err: any) {
      showToast(err.message || 'Failed to load the sample cohort', 'error');
    }
  };

  /** Step 1 -> 2: the backend validates the whole batch (dry run). Nothing is saved yet. */
  const handleValidateUpload = async () => {
    const files = importFiles();
    if (!files) {
      showToast('Upload at least a students file and a schools file (CSV).', 'error');
      return;
    }
    setValidating(true);
    setImportErrors([]);
    try {
      const p: ImportPreview = await api.previewImport(files);
      setValidation({
        source: 'upload',
        cohortId: p.cohort_id,
        students: p.counts.students,
        schools: p.counts.offers,
        seats: p.counts.total_seats,
        preferences: p.counts.preferences,
        provinces: p.provinces,
        fallbackOptIn: p.fallback_opt_in,
        ruleVersion: p.rule_version,
        zeroCapacity: p.zero_capacity_offers,
        cohortExists: p.cohort_exists,
        cohortHasApprovals: p.cohort_has_approvals
      });
      setIssuesAcknowledged(!p.cohort_exists);
    } catch (err: any) {
      setValidation(null);
      const errors: ImportError[] = err.details?.details?.errors || [];
      // Request-shape errors (400 BAD_REQUEST) list {field, message}; show those instead of the generic text.
      const shape: ImportError[] = Array.isArray(err.details?.details)
        ? err.details.details.map((d: any) => ({ file: '-', row: null, field: d.field || null, code: err.code || 'BAD_REQUEST', message: d.message }))
        : [];
      if (err.code === 'BAD_REQUEST' && shape.some(d => d.field === 'preferences')) {
        shape.push({
          file: '-', row: null, field: null, code: 'BACKEND_OUTDATED',
          message: 'The server requires a separate preferences.csv, so it is running an older version. Restart the backend, then upload again.'
        });
      }
      setImportErrors(errors.length ? errors : shape.length ? shape : [{ file: '-', row: null, field: null, code: err.code || 'ERROR', message: err.message }]);
    } finally {
      setValidating(false);
      goToStep(2);
    }
  };

  /** Step 2 -> 3: save the validated upload as the working cohort (sample cohorts are already loaded). */
  const handleConfirmData = async () => {
    if (!validation) return;
    if (validation.source === 'upload') {
      const files = importFiles();
      if (!files) return;
      setImporting(true);
      try {
        await api.importCohort(files, validation.cohortExists);
        setAiMatchingComplete(false);
        await loadData();
        if (onRefreshProposals) onRefreshProposals();
        showToast(`Imported cohort ${validation.cohortId}.`);
      } catch (err: any) {
        showToast(err.message || 'Import failed', 'error');
        return;
      } finally {
        setImporting(false);
      }
    }
    goToStep(3);
  };

  // ==========================================
  // Step 3: Run placement on the backend
  // ==========================================
  const handleStartAIProcessing = async () => {
    setIsProcessing(true);
    setAiMatchingComplete(false);
    setProcessingStageIndex(0);
    // Show the real pipeline stages while the backend works (at least ~2 s so officers can read them).
    const timer = setInterval(() => setProcessingStageIndex(i => Math.min(i + 1, processingStages.length - 1)), 450);
    const minDelay = new Promise(r => setTimeout(r, 2200));
    try {
      const [res] = await Promise.all([api.runPlacement('AI_ASSISTED'), minDelay]);
      const run = await api.getProposals(res.run_id);
      setActiveRunId(res.run_id);
      setMetrics(res.metrics);
      setProposals(run.results);
      setRunSummary({ runtime_ms: res.runtime_ms, mode: res.metrics.mode || 'AI', model: res.metrics.model_version || null });
      const [offersRes, auditRes] = await Promise.all([api.getOffers(), api.getAuditTrail()]);
      setOffersList(offersRes.offers);
      setAuditList(auditRes.audit_trail);
      setAiMatchingComplete(true);
      setMaxUnlockedStep(prev => Math.max(prev, 4));
      if (onRefreshProposals) onRefreshProposals();
      showToast('Placement proposals are ready for review.');
    } catch (err: any) {
      showToast(err.message || 'Placement run failed', 'error');
    } finally {
      clearInterval(timer);
      setIsProcessing(false);
    }
  };

  // ==========================================
  // Step 4: Details, Approve, Change
  // ==========================================
  const openDetails = (item: any) => {
    setDetailStudent(item);
    setDetailData(null);
    setDetailAlternatives(null);
    setDetailOpenOffers(null);
    const sid = item.student.student_id;
    api.getProposalDetail(sid).then(setDetailData).catch(() => setDetailData({ explanation: [] }));
    api.getAlternatives(sid).then(r => setDetailAlternatives(r.alternatives)).catch(() => setDetailAlternatives([]));
    if (isUnplaced(item)) {
      api.getOpenOffers(sid).then(r => setDetailOpenOffers(r.options)).catch(() => setDetailOpenOffers([]));
    }
  };

  const handleOpenAssign = async (item: any, preselect?: string) => {
    setAssignTarget(item);
    setAssignOptions(null);
    setAssignSelected(preselect || '');
    setAssignReason('Officer placement of an unplaced student');
    setAssignNote('');
    setAssignConfirmBelow(false);
    setAssignError(null);
    try {
      const res = await api.getOpenOffers(item.student.student_id);
      setAssignOptions(res.options);
      if (!preselect && res.options.length) setAssignSelected(res.options[0].offer_id);
    } catch (err: any) {
      setAssignOptions([]);
      setAssignError(err.details?.message || err.message || 'Could not load schools with free seats.');
    }
  };

  const handleConfirmAssign = async () => {
    if (!assignTarget || !assignSelected) return;
    const option = assignOptions?.find(o => o.offer_id === assignSelected);
    const reason = [assignReason, assignNote.trim()].filter(Boolean).join(': ');
    setAssignLoading(true);
    setAssignError(null);
    try {
      await api.submitDecision(assignTarget.student.student_id, 'ASSIGN', {
        offer_id: assignSelected,
        reason,
        allow_below_cutoff: assignConfirmBelow
      });
      showToast(`Assigned ${assignTarget.student.display_name} to ${option?.school_name}. The assignment still needs approval.`);
      const sid = assignTarget.student.student_id;
      setAssignTarget(null);
      await refreshAfterDecision(sid);
    } catch (err: any) {
      setAssignError(err.details?.message || err.message || 'The assignment was refused.');
    } finally {
      setAssignLoading(false);
    }
  };

  const refreshAfterDecision = async (studentId: string) => {
    await loadData();
    if (detailStudent && detailStudent.student.student_id === studentId) {
      const summary = await api.getCohortSummary();
      if (summary.active_run_id) {
        const res = await api.getProposals(summary.active_run_id);
        const found = res.results.find(r => r.student.student_id === studentId);
        if (found) openDetails(found);
      }
    }
    if (onRefreshProposals) onRefreshProposals();
  };

  const handleApproveProposal = async (studentId: string) => {
    try {
      await api.submitDecision(studentId, 'APPROVE', {
        reason: 'Officer verified eligibility, school capacity, and preference priority.'
      });
      showToast(`Placement approved for ${studentId}.`);
      await refreshAfterDecision(studentId);
    } catch (err: any) {
      showToast(err.details?.message || err.message || 'Approval failed', 'error');
    }
  };

  const handleOpenManualOverride = async (item: any, preselect?: string) => {
    setManualTargetStudent(item);
    setManualError(null);
    setManualReason('Family request after consultation');
    setManualReasonNote('');
    setManualOptions(null);
    setManualSelectedOfferId(preselect || '');
    setManualOverrideModalOpen(true);
    try {
      const res = await api.getAlternatives(item.student.student_id);
      const feasible = res.alternatives.filter(a => a.is_eligible && a.has_capacity);
      setManualOptions(feasible);
      if (!preselect && feasible.length) setManualSelectedOfferId(feasible[0].offer.offer_id);
    } catch (err: any) {
      setManualOptions([]);
      setManualError(err.details?.message || err.message || 'Could not load alternative schools.');
    }
  };

  const handleConfirmManualOverride = async () => {
    if (!manualTargetStudent || !manualSelectedOfferId) return;
    const reason = [manualReason, manualReasonNote.trim()].filter(Boolean).join(': ');
    setManualLoading(true);
    setManualError(null);
    try {
      await api.submitDecision(manualTargetStudent.student.student_id, 'CHANGE', {
        offer_id: manualSelectedOfferId,
        reason
      });
      const school = manualOptions?.find(o => o.offer.offer_id === manualSelectedOfferId)?.offer.school_name;
      showToast(`Changed ${manualTargetStudent.student.display_name} to ${school}. The change still needs approval.`);
      setManualOverrideModalOpen(false);
      await refreshAfterDecision(manualTargetStudent.student.student_id);
    } catch (err: any) {
      setManualError(err.details?.message || err.message || 'The change was refused.');
    } finally {
      setManualLoading(false);
    }
  };

  // Bulk Actions
  const handleToggleSelectAll = () => {
    if (selectedStudentIds.size === filteredProposals.length) {
      setSelectedStudentIds(new Set());
    } else {
      setSelectedStudentIds(new Set(filteredProposals.filter(p => p.proposal.offer_id).map(p => p.student.student_id)));
    }
  };

  const handleToggleSelectOne = (studentId: string) => {
    setSelectedStudentIds(prev => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  };

  const handleApproveSelected = async () => {
    const ids = Array.from(selectedStudentIds).filter(id => {
      const p = proposals.find(x => x.student.student_id === id)?.proposal;
      return p && p.offer_id && (p.status === 'DRAFT' || p.status === 'CHANGED');
    });
    if (ids.length === 0) return;
    let count = 0;
    const failed: string[] = [];
    for (const id of ids) {
      try {
        await api.submitDecision(id, 'APPROVE', { reason: 'Approved by officer after human review.' });
        count++;
      } catch {
        failed.push(id);
      }
    }
    setSelectedStudentIds(new Set());
    await loadData();
    if (onRefreshProposals) onRefreshProposals();
    showToast(
      failed.length ? `Approved ${count}; ${failed.length} could not be approved (${failed.slice(0, 3).join(', ')}).` : `Approved ${count} placements.`,
      failed.length ? 'error' : 'success'
    );
  };

  // Step 5: Final approval of every remaining valid draft
  const handleFinalizeAllPlacements = async () => {
    if (!activeRunId) return;
    setFinalizingLoading(true);
    try {
      // Officer changes are approved one by one (each is its own decision, re-checked by the server);
      // bulk approval then signs off the unchanged engine drafts in one transaction.
      const changed = proposals.filter(p => p.proposal.status === 'CHANGED' && p.proposal.offer_id);
      const failed: string[] = [];
      for (const p of changed) {
        try {
          await api.submitDecision(p.student.student_id, 'APPROVE', { reason: 'Officer change approved at final sign-off.' });
        } catch {
          failed.push(p.student.student_id);
        }
      }
      await api.bulkApprove(activeRunId);
      await loadData();
      setApproveConfirmModalOpen(false);
      goToStep(6);
      showToast(
        failed.length ? `Approved; ${failed.length} officer change(s) failed the server checks: ${failed.join(', ')}.` : 'All reviewed placements are approved.',
        failed.length ? 'error' : 'success'
      );
      if (onRefreshProposals) onRefreshProposals();
    } catch (err: any) {
      showToast(err.message || 'Final approval failed', 'error');
    } finally {
      setFinalizingLoading(false);
    }
  };

  // Export handlers (approved rows only, with the plain-language placement reason)
  const handleExportCSV = () => {
    if (!activeRunId) {
      showToast('No active run available for export', 'error');
      return;
    }
    window.open(api.getExportUrl(activeRunId), '_blank');
  };

  const handleExportExceptions = () => {
    if (activeRunId) window.open(api.getExceptionsExportUrl(activeRunId), '_blank');
  };

  const handleExportPDF = () => {
    window.print();
  };

  // ==========================================
  // Filtering & Computed Metrics (all from real proposals)
  // ==========================================
  const isUnplaced = (p: any) => !p.proposal.offer_id || p.proposal.status === 'UNASSIGNED' || p.proposal.status === 'REJECTED';

  const filteredProposals = proposals.filter(item => {
    const student = item.student;
    const offer = item.offer;
    const proposal = item.proposal;

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const matchName = student.display_name.toLowerCase().includes(term);
      const matchId = student.student_id.toLowerCase().includes(term);
      const matchSchool = offer?.school_name.toLowerCase().includes(term);
      if (!matchName && !matchId && !matchSchool) return false;
    }

    if (statusFilter !== 'ALL') {
      if (statusFilter === 'UNASSIGNED') {
        if (!isUnplaced(item)) return false;
      } else if (proposal.status !== statusFilter) {
        return false;
      }
    }

    if (schoolFilter !== 'ALL' && proposal.offer_id !== schoolFilter) return false;

    if (basisFilter === 'CHOICE_1' && proposal.preference_rank !== 1) return false;
    if (basisFilter === 'CHOICE_2_3' && !(proposal.preference_rank === 2 || proposal.preference_rank === 3)) return false;
    if (basisFilter === 'AI' && !proposal.is_fallback) return false;

    return true;
  });

  const totalStudentsCount = proposals.length;
  const matchedStudentsCount = proposals.filter(p => !isUnplaced(p)).length;
  const unmatchedStudentsCount = proposals.filter(isUnplaced).length;
  const approvedStudentsCount = proposals.filter(p => p.proposal.status === 'APPROVED').length;
  const overrideStudentsCount = proposals.filter(p => p.proposal.status === 'CHANGED').length;
  const readyForApprovalCount = proposals.filter(p => p.proposal.offer_id && (p.proposal.status === 'DRAFT' || p.proposal.status === 'CHANGED')).length;
  const aiSuggestedCount = proposals.filter(p => p.proposal.is_fallback && !isUnplaced(p)).length;

  const pref1Count = proposals.filter(p => p.proposal.preference_rank === 1 && !isUnplaced(p)).length;
  const pref2Count = proposals.filter(p => p.proposal.preference_rank === 2 && !isUnplaced(p)).length;
  const prefOtherCount = proposals.filter(p => (p.proposal.preference_rank === 3 || p.proposal.is_fallback) && !isUnplaced(p)).length;

  /** Short label for how this placement was decided. */
  const basisLabel = (proposal: PlacementProposal) => {
    if (proposal.reason_codes?.includes('OFFICER_ASSIGNED')) {
      return proposal.override_preference || proposal.override_eligibility ? 'Officer assigned · exception' : 'Officer assigned';
    }
    if (proposal.is_fallback) return `AI suggested${proposal.fit_score != null ? ` · ${Math.round(proposal.fit_score)}/100` : ''}`;
    if (proposal.preference_rank) return `${ORDINAL(proposal.preference_rank)} choice`;
    return 'Not placed';
  };

  return (
    <div
      className="w-full bg-[#F8FAFC] pb-24 font-sans antialiased text-[#0F172A]"
      style={{ minHeight: '100vh', height: 'auto', overflowY: 'auto' }}
    >
      {/* Toast Feedback Notification */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-[6px] shadow-xl text-xs font-semibold flex items-center gap-2.5 transition-all ${
            toastMessage.type === 'error'
              ? 'bg-[#DC2626] text-white'
              : toastMessage.type === 'info'
              ? 'bg-[#2563EB] text-white border border-[#2563EB]/40'
              : 'bg-[#0F9D8A] text-white'
          }`}
        >
          {toastMessage.type === 'error' ? (
            <AlertCircle className="w-4 h-4 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* ========================================================= */}
      {/* 1. PROGRESS STEPPER (Horizontal Responsive) */}
      {/* ========================================================= */}
      <header className="bg-white border-b border-[#E2E8F0] px-6 lg:px-10 py-5 sticky top-0 z-30 shadow-xs">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-[#64748B] font-medium mb-0.5">
              <span className="font-semibold text-[#2563EB]">National Placement Workflow</span>
              <span>•</span>
              <span className="inline-flex items-center gap-1 text-[#0F9D8A] font-semibold bg-[#0F9D8A]/10 px-2 py-0.5 rounded-[4px] border border-[#0F9D8A]/20">
                <ShieldCheck className="w-3.5 h-3.5" />
                AI recommends. Humans decide.
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-[#172554] tracking-tight">
              Student Placement
            </h1>
          </div>

          <div className="text-xs font-mono text-slate-500">
            Step {currentStep} of {WORKFLOW_STEPS.length}:{' '}
            <strong className="text-[#172554]">{WORKFLOW_STEPS[currentStep - 1].label}</strong>
          </div>
        </div>

        {/* Stepper Bar */}
        <div className="max-w-6xl mx-auto mt-4 pt-3 border-t border-[#F1F5F9]">
          <nav aria-label="Progress Stepper" className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {WORKFLOW_STEPS.map(step => {
              const isCompleted = step.key < currentStep;
              const isCurrent = step.key === currentStep;
              const isLocked = step.key > maxUnlockedStep;
              const isUnlocked = !isLocked && !isCurrent;

              return (
                <button
                  key={step.key}
                  disabled={isLocked}
                  onClick={() => {
                    if (!isLocked) goToStep(step.key);
                  }}
                  className={`p-2.5 rounded-[6px] text-left border transition-all ${
                    isCurrent
                      ? 'bg-[#2563EB] text-white border-[#2563EB] shadow-xs ring-2 ring-[#DBEAFE]'
                      : isCompleted
                      ? 'bg-[#EFF6FF] text-[#1D4ED8] border-[#DBEAFE] hover:bg-[#DBEAFE] cursor-pointer'
                      : isUnlocked
                      ? 'bg-white text-[#172554] border-[#E2E8F0] hover:border-[#2563EB]/40 cursor-pointer'
                      : 'bg-slate-50 text-slate-400 border-slate-200 opacity-60 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] font-mono font-bold">
                    <span>{step.num}</span>
                    {isCompleted ? (
                      <span className="text-[#16A34A] font-bold flex items-center gap-0.5">
                        <Check className="w-3.5 h-3.5" />
                      </span>
                    ) : isCurrent ? (
                      <span className="w-2 h-2 rounded-full bg-white ring-2 ring-white/40" />
                    ) : isLocked ? (
                      <Lock className="w-3 h-3 text-slate-400" />
                    ) : (
                      <span className="w-2 h-2 rounded-full border border-slate-400" />
                    )}
                  </div>
                  <div className="mt-1">
                    <div className={`text-xs font-bold truncate ${isCurrent ? 'text-white' : 'text-[#172554]'}`}>
                      {step.label}
                    </div>
                    <div className={`text-[10px] hidden sm:block truncate ${isCurrent ? 'text-blue-100' : 'text-[#64748B]'}`}>
                      {isCompleted ? '✓ Completed' : isCurrent ? '● Current' : isLocked ? '🔒 Locked' : '○ Available'}
                    </div>
                  </div>
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Single-Step Workspace */}
      <main className="max-w-4xl mx-auto px-6 lg:px-8 mt-8">

        {/* ========================================================= */}
        {/* STEP 1 — UPLOAD DATA */}
        {/* ========================================================= */}
        {currentStep === 1 && (
          <div className="bg-white rounded-[8px] border border-[#E2E8F0] p-6 sm:p-10 shadow-xs space-y-6 animate-fadeIn">
            <div>
              <span className="text-[11px] font-mono font-bold text-[#2563EB] uppercase tracking-wider">
                STEP 1 OF 6
              </span>
              <h2 className="text-2xl font-extrabold text-[#172554] tracking-tight mt-1">
                Upload Placement Data
              </h2>
              <p className="text-xs sm:text-sm text-[#64748B] mt-1 leading-relaxed">
                Upload a students file (scores and up to 3 ranked choices), a schools file (seats and entry cutoffs) and,
                optionally, the placement rules. Nothing is saved until the data passes validation.
              </p>
            </div>

            {!canImport && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-[6px] text-xs text-amber-900">
                Only administrators can upload or load cohorts. You can continue with the cohort that is already loaded.
              </div>
            )}

            {canImport && (
              <div className="p-3 bg-blue-50/70 border border-blue-200/80 rounded-[6px] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <span className="text-[#172554] font-medium">Or load a built-in synthetic sample cohort:</span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => handleLoadPresetCohort('200_standard')}
                    className="px-3 py-1.5 bg-white text-[#2563EB] hover:bg-blue-100 border border-blue-300 rounded-[4px] font-semibold transition-colors cursor-pointer"
                  >
                    Sample (200 students)
                  </button>
                  <button
                    onClick={() => handleLoadPresetCohort('6_fixture')}
                    className="px-3 py-1.5 bg-white text-slate-700 hover:bg-slate-100 border border-slate-300 rounded-[4px] font-semibold transition-colors cursor-pointer"
                  >
                    Benchmark (6 students)
                  </button>
                </div>
              </div>
            )}

            {canImport && (
              <div
                onDragOver={e => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={e => {
                  e.preventDefault();
                  setIsDragging(false);
                  handleFileUpload(e.dataTransfer.files);
                }}
                className={`border-2 border-dashed rounded-[8px] p-8 sm:p-12 text-center transition-all ${
                  isDragging ? 'border-[#2563EB] bg-blue-50/50' : 'border-[#CBD5E1] bg-[#F8FAFC] hover:bg-slate-50'
                }`}
              >
                <input
                  type="file"
                  multiple
                  ref={fileInputRef}
                  onChange={e => {
                    handleFileUpload(e.target.files);
                    e.target.value = '';
                  }}
                  accept=".csv,.json,.pdf,.xlsx,.xls"
                  className="hidden"
                />
                <div className="w-12 h-12 rounded-full bg-blue-100 text-[#2563EB] flex items-center justify-center mx-auto mb-3 shadow-xs">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <div className="text-sm font-bold text-[#172554]">Drag and drop files here</div>
                <div className="text-xs text-[#64748B] mt-1">
                  students_2026.csv · schools_2026.csv · placement_rules.json (optional) · rules PDF (optional, for reference)
                </div>
                <div className="mt-4">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 bg-[#2563EB] hover:bg-blue-700 text-white rounded-[6px] text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 mx-auto cursor-pointer"
                  >
                    <span>+ Upload Files</span>
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <div className="text-xs font-bold text-[#172554] uppercase tracking-wider">
                Uploaded Files ({uploadedFiles.length})
              </div>

              {uploadedFiles.length === 0 ? (
                <div className="p-6 bg-slate-50 border border-dashed border-slate-200 rounded-[6px] text-center text-xs text-slate-500">
                  No files uploaded yet.
                </div>
              ) : (
                uploadedFiles.map(file => (
                  <div
                    key={file.id}
                    className="p-3.5 rounded-[6px] border border-[#E2E8F0] bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-8 h-8 rounded-[6px] flex items-center justify-center shrink-0 ${
                          file.type === 'PDF'
                            ? 'bg-rose-100 text-rose-700'
                            : file.role === 'unsupported'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-blue-100 text-[#2563EB]'
                        }`}
                      >
                        {file.type === 'PDF' || file.type === 'JSON' ? <FileText className="w-4 h-4" /> : <FileSpreadsheet className="w-4 h-4" />}
                      </div>
                      <div>
                        <div className="font-bold text-[#172554] flex flex-wrap items-center gap-2">
                          <span>{file.name}</span>
                          <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-1 rounded">{file.size}</span>
                          <span className="text-[10px] font-semibold text-[#2563EB]">{ROLE_LABEL[file.role]}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">{file.description}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-center">
                      {file.role === 'unsupported' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-[4px]">
                          <AlertTriangle className="w-3 h-3" /> Not used
                        </span>
                      ) : file.role === 'reference' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-[4px]">
                          <Info className="w-3 h-3" /> Reference only
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-[4px]">
                          <CheckCircle2 className="w-3 h-3" /> Recognised
                        </span>
                      )}
                      <button
                        onClick={() => handleRemoveFile(file.id)}
                        className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                        title="Remove file"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}

              {uploadedFiles.length > 0 && (!fileFor('students') || !fileFor('schools')) && (
                <div className="text-[11px] text-amber-700">
                  Still needed: {[!fileFor('students') && 'a students CSV', !fileFor('schools') && 'a schools CSV'].filter(Boolean).join(' and ')}.
                </div>
              )}
            </div>

            <div className="p-3 bg-blue-50/60 border border-blue-200/80 rounded-[6px] flex items-start gap-2.5 text-xs text-[#172554]">
              <ShieldCheck className="w-4 h-4 text-[#2563EB] shrink-0 mt-0.5" />
              <p className="text-[#475569] leading-relaxed">
                <strong>Data Privacy:</strong> Real student data may only be uploaded through authorised NESA channels. Use
                synthetic or anonymised data for demonstrations.
              </p>
            </div>

            <div className="pt-4 border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3">
              {activeRunId ? (
                <button
                  onClick={() => goToStep(4)}
                  className="px-4 py-2 text-xs font-semibold text-[#2563EB] hover:underline cursor-pointer"
                >
                  Skip to the current run’s results →
                </button>
              ) : (
                <span />
              )}
              <button
                disabled={!canImport || !fileFor('students') || !fileFor('schools') || validating}
                onClick={handleValidateUpload}
                className="px-6 py-2.5 bg-[#2563EB] hover:bg-blue-700 text-white rounded-[6px] text-xs font-bold shadow-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {validating ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
                <span>{validating ? 'Validating on the server…' : 'Validate Files'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* STEP 2 — VALIDATE DATA */}
        {/* ========================================================= */}
        {currentStep === 2 && (
          <div className="bg-white rounded-[8px] border border-[#E2E8F0] p-6 sm:p-10 shadow-xs space-y-6 animate-fadeIn">
            <div>
              <span className="text-[11px] font-mono font-bold text-[#2563EB] uppercase tracking-wider">
                STEP 2 OF 6
              </span>
              <h2 className="text-2xl font-extrabold text-[#172554] tracking-tight mt-1">
                Validate Placement Data
              </h2>
              <p className="text-xs sm:text-sm text-[#64748B] mt-1 leading-relaxed">
                The server checked every row: IDs, 0–100 scores (blank is never treated as zero), seats, cutoffs, subject
                weights and ranked choices. Any error rejects the whole batch.
              </p>
            </div>

            {importErrors.length > 0 && (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-[6px] space-y-2 text-xs text-rose-900">
                <div className="font-bold flex items-center gap-1.5 text-rose-700">
                  <AlertCircle className="w-4 h-4" />
                  <span>{importErrors.length} problem(s) found. Nothing was saved. Fix the file(s) and upload again.</span>
                </div>
                <div className="max-h-72 overflow-y-auto border border-rose-200 rounded bg-white">
                  <table className="w-full text-[11px]">
                    <thead className="bg-rose-50 text-rose-700 sticky top-0">
                      <tr>
                        <th className="text-left px-2 py-1.5">File</th>
                        <th className="text-left px-2 py-1.5">Row</th>
                        <th className="text-left px-2 py-1.5">Column</th>
                        <th className="text-left px-2 py-1.5">Problem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-rose-100">
                      {importErrors.map((e, i) => (
                        <tr key={i} className="align-top">
                          <td className="px-2 py-1.5 font-mono">{nameFor(e.file)}</td>
                          <td className="px-2 py-1.5 font-mono">{e.row || '—'}</td>
                          <td className="px-2 py-1.5 font-mono">{e.field || '—'}</td>
                          <td className="px-2 py-1.5">
                            <span className="font-mono font-semibold">{e.code}</span> {e.message}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {validation && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-4 rounded-[6px] bg-[#F8FAFC] border border-[#E2E8F0]">
                    <div className="text-[11px] font-semibold text-[#64748B] uppercase">Students</div>
                    <div className="text-2xl font-black text-[#172554] mt-1">{validation.students}</div>
                    <div className="text-[11px] text-emerald-600 mt-1 font-semibold">✓ all rows valid</div>
                  </div>
                  <div className="p-4 rounded-[6px] bg-[#F8FAFC] border border-[#E2E8F0]">
                    <div className="text-[11px] font-semibold text-[#64748B] uppercase">School offers</div>
                    <div className="text-2xl font-black text-[#172554] mt-1">{validation.schools}</div>
                    <div className="text-[11px] text-slate-500 mt-1">{validation.seats} seats in total</div>
                  </div>
                  <div className="p-4 rounded-[6px] bg-[#F8FAFC] border border-[#E2E8F0]">
                    <div className="text-[11px] font-semibold text-[#64748B] uppercase">Ranked choices</div>
                    <div className="text-2xl font-black text-[#2563EB] mt-1">{validation.preferences}</div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      {validation.fallbackOptIn != null ? `${validation.fallbackOptIn} students allow alternatives` : '1–3 per student'}
                    </div>
                  </div>
                  <div className="p-4 rounded-[6px] bg-[#F8FAFC] border border-[#E2E8F0]">
                    <div className="text-[11px] font-semibold text-[#64748B] uppercase">Seats vs students</div>
                    <div className={`text-2xl font-black mt-1 ${validation.seats >= validation.students ? 'text-[#0F9D8A]' : 'text-amber-600'}`}>
                      {validation.seats >= validation.students ? '+' : ''}
                      {validation.seats - validation.students}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      {validation.seats >= validation.students ? 'more seats than students' : 'fewer seats than students'}
                    </div>
                  </div>
                </div>

                <div className="p-5 bg-emerald-50/50 border border-emerald-200/80 rounded-[6px] space-y-2 text-xs text-[#172554]">
                  <div className="text-xs font-bold uppercase tracking-wider">Checks passed</div>
                  <div className="flex items-center gap-2 font-medium">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      {validation.students} students with scores 0–100, no duplicates, 1–3 ranked choices each, every choice is a
                      known school offer
                    </span>
                  </div>
                  <div className="flex items-center gap-2 font-medium">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      {validation.schools} school offers across {validation.provinces.length} province(s): {validation.provinces.join(', ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 font-medium">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      Rules: <span className="font-mono">{validation.ruleVersion}</span>: priority by overall score, ranked
                      choices first, AI-ranked alternatives only for students who allowed them (demo policy)
                    </span>
                  </div>
                  {validation.zeroCapacity.length > 0 && (
                    <div className="flex items-center gap-2 font-medium text-amber-800">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>No seats this year (capacity 0): {validation.zeroCapacity.join(', ')}</span>
                    </div>
                  )}
                </div>

                {validation.source === 'upload' && validation.cohortExists && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-[6px] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-800">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                      <div>
                        <div className="font-bold">Cohort {validation.cohortId} already exists</div>
                        <div className="text-[11px] text-amber-700 mt-0.5">
                          Importing replaces its data and discards its runs
                          {validation.cohortHasApprovals ? ', including approved placements' : ''}. The audit history is kept.
                        </div>
                      </div>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer self-start sm:self-auto font-semibold">
                      <input
                        type="checkbox"
                        checked={issuesAcknowledged}
                        onChange={e => setIssuesAcknowledged(e.target.checked)}
                        className="rounded border-amber-300 text-[#2563EB] focus:ring-0 cursor-pointer"
                      />
                      <span>Replace it</span>
                    </label>
                  </div>
                )}
              </>
            )}

            <div className="pt-4 border-t border-[#E2E8F0] flex items-center justify-between">
              <button
                onClick={() => goToStep(1)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-[#172554] flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Upload</span>
              </button>

              <button
                disabled={!validation || !issuesAcknowledged || importing}
                onClick={handleConfirmData}
                className="px-6 py-2.5 bg-[#2563EB] hover:bg-blue-700 text-white rounded-[6px] text-xs font-bold shadow-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {importing ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
                <span>{validation?.source === 'upload' ? (importing ? 'Importing…' : 'Import & Continue') : 'Continue to AI Matching'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* STEP 3 — AI MATCHING */}
        {/* ========================================================= */}
        {currentStep === 3 && (
          <div className="bg-white rounded-[8px] border border-[#E2E8F0] p-6 sm:p-10 shadow-xs space-y-6 animate-fadeIn">
            <div>
              <span className="text-[11px] font-mono font-bold text-[#2563EB] uppercase tracking-wider">
                STEP 3 OF 6
              </span>
              <h2 className="text-2xl font-extrabold text-[#172554] tracking-tight mt-1">
                Ready for AI Matching
              </h2>
              <p className="text-xs sm:text-sm text-[#64748B] mt-1 leading-relaxed">
                The engine places students on the server. Every result is a draft until an officer approves it.
              </p>
            </div>

            {!isProcessing && !aiMatchingComplete && (
              <div className="p-6 rounded-[8px] bg-[#EFF6FF] border border-[#DBEAFE] text-[#172554] space-y-4">
                <div className="flex items-center gap-2 text-[#14B8A6] text-xs font-bold">
                  <Sparkles className="w-4 h-4 text-[#14B8A6]" />
                  <span>Serial priority allocation + local AI model</span>
                </div>
                <ol className="text-xs text-[#475569] leading-relaxed space-y-1 list-decimal pl-4 max-w-2xl">
                  <li>Students are taken in order of overall score (highest first; ties by student ID).</li>
                  <li>Each student gets the first ranked choice they qualify for that still has a free seat.</li>
                  <li>
                    If none works and the student allowed alternatives, the local AI model ranks the eligible schools with free
                    seats by subject fit and home province, and suggests the best one.
                  </li>
                  <li>The server re-checks capacity, eligibility and one seat per student before saving.</li>
                </ol>

                {canReview ? (
                  <button
                    onClick={handleStartAIProcessing}
                    className="px-6 py-3 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-[6px] text-xs font-bold shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Run AI Placement</span>
                  </button>
                ) : (
                  <div className="text-xs text-amber-800">Only officers and administrators can run placement.</div>
                )}
              </div>
            )}

            {isProcessing && (
              <div className="p-8 rounded-[8px] bg-gradient-to-br from-[#1E40AF] to-[#2563EB] text-white text-center space-y-5 shadow-lg">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 text-xs font-semibold text-[#CCFBF1]">
                  <Sparkles className="w-3.5 h-3.5 animate-pulse text-[#CCFBF1]" />
                  <span>EduMatch AI Matching Engine</span>
                </div>
                <h3 className="text-xl font-bold tracking-tight">Placing students...</h3>
                <p className="text-xs font-mono text-blue-100 h-4">{processingStages[processingStageIndex]}</p>
                <div className="grid grid-cols-2 gap-3 my-6 text-center text-xs max-w-sm mx-auto">
                  <div className="p-3 bg-white/10 rounded border border-white/20">
                    <div className="text-blue-200 text-[10px] uppercase font-bold">Students</div>
                    <div className="font-bold text-white mt-1">{validation?.students ?? '…'}</div>
                  </div>
                  <div className="p-3 bg-white/10 rounded border border-white/20">
                    <div className="text-blue-200 text-[10px] uppercase font-bold">School offers</div>
                    <div className="font-bold text-white mt-1">{validation?.schools ?? offersList.length}</div>
                  </div>
                </div>
                <div className="w-full max-w-md mx-auto h-2 bg-blue-900/50 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white transition-all duration-300"
                    style={{ width: `${((processingStageIndex + 1) / processingStages.length) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {aiMatchingComplete && (
              <div className="p-6 rounded-[8px] bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                  <h3 className="text-lg font-bold text-[#172554]">✓ Placement proposals ready</h3>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {totalStudentsCount} students processed in {runSummary ? Math.round(runSummary.runtime_ms) : '—'} ms on the server
                  {runSummary?.model ? ` (AI model ${runSummary.model})` : ' (rules only; AI not used)'}. Every student has a
                  recorded reason. {metrics ? `${metrics.violations_count} hard-constraint violations.` : ''}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
                  <div className="p-2.5 bg-white rounded border border-emerald-200 font-semibold">
                    <span className="text-slate-500 block text-[10px]">Placed</span>
                    <span className="text-emerald-700 text-base font-bold">{matchedStudentsCount}</span>
                  </div>
                  <div className="p-2.5 bg-white rounded border border-emerald-200 font-semibold">
                    <span className="text-slate-500 block text-[10px]">Got 1st choice</span>
                    <span className="text-[#2563EB] text-base font-bold">{pref1Count}</span>
                  </div>
                  <div className="p-2.5 bg-white rounded border border-emerald-200 font-semibold">
                    <span className="text-slate-500 block text-[10px]">AI-suggested alternative</span>
                    <span className="text-[#0F9D8A] text-base font-bold">{aiSuggestedCount}</span>
                  </div>
                  <div className="p-2.5 bg-white rounded border border-emerald-200 font-semibold">
                    <span className="text-slate-500 block text-[10px]">Not placed (needs review)</span>
                    <span className="text-amber-700 text-base font-bold">{unmatchedStudentsCount}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="pt-4 border-t border-[#E2E8F0] flex items-center justify-between">
              <button
                disabled={isProcessing}
                onClick={() => goToStep(2)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-[#172554] flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Validation</span>
              </button>

              <button
                disabled={!aiMatchingComplete && !activeRunId}
                onClick={() => goToStep(4)}
                className="px-6 py-2.5 bg-[#2563EB] hover:bg-blue-700 text-white rounded-[6px] text-xs font-bold shadow-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <span>Review Recommendations</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* STEP 4 — REVIEW RESULTS */}
        {/* ========================================================= */}
        {currentStep === 4 && (
          <div className="space-y-6 animate-fadeIn">
            {/* Header Box */}
            <div className="bg-white rounded-[8px] border border-[#E2E8F0] p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <span className="text-[11px] font-mono font-bold text-[#2563EB] uppercase tracking-wider">
                  STEP 4 OF 6
                </span>
                <h2 className="text-xl sm:text-2xl font-extrabold text-[#172554] tracking-tight mt-1">
                  Review AI Recommendations
                </h2>
                <p className="text-xs text-[#64748B] mt-0.5">
                  Every row shows how the student was placed and why. Click a student for the full explanation, alternatives and actions.
                </p>
              </div>

              <button
                onClick={() => goToStep(5)}
                className="px-5 py-2.5 bg-[#2563EB] hover:bg-blue-700 text-white rounded-[6px] text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer self-start md:self-auto"
              >
                <span>Continue to Approval</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Summary Statistics */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
              <div className="p-3 bg-white rounded border border-[#E2E8F0]">
                <div className="text-[10px] text-slate-500 font-semibold uppercase">Students</div>
                <div className="text-lg font-black text-[#172554] mt-1">{totalStudentsCount}</div>
              </div>
              <div className="p-3 bg-white rounded border border-[#E2E8F0]">
                <div className="text-[10px] text-slate-500 font-semibold uppercase">Placed</div>
                <div className="text-lg font-black text-emerald-700 mt-1">{matchedStudentsCount}</div>
              </div>
              <div className="p-3 bg-white rounded border border-[#E2E8F0]">
                <div className="text-[10px] text-slate-500 font-semibold uppercase">Needs Review</div>
                <div className="text-lg font-black text-amber-600 mt-1">{unmatchedStudentsCount}</div>
              </div>
              <div className="p-3 bg-white rounded border border-[#E2E8F0]">
                <div className="text-[10px] text-slate-500 font-semibold uppercase">Got 1st choice</div>
                <div className="text-lg font-black text-[#2563EB] mt-1">{metrics ? `${metrics.first_choice_rate}%` : '—'}</div>
              </div>
              <div className="p-3 bg-white rounded border border-[#E2E8F0]">
                <div className="text-[10px] text-slate-500 font-semibold uppercase">Got a top-3 choice</div>
                <div className="text-lg font-black text-[#172554] mt-1">{metrics ? `${metrics.top_three_rate}%` : '—'}</div>
              </div>
              <div className="p-3 bg-white rounded border border-[#E2E8F0]">
                <div className="text-[10px] text-slate-500 font-semibold uppercase">Rule violations</div>
                <div className={`text-lg font-black mt-1 ${metrics && metrics.violations_count > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                  {metrics ? metrics.violations_count : '—'}
                </div>
              </div>
            </div>

            {/* Filter Toolbar */}
            <div className="p-3 bg-white rounded-[6px] border border-[#E2E8F0] shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[260px]">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search student or school..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-[6px] text-xs focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                  />
                </div>

                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value as any)}
                  className="px-2.5 py-1.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-[6px] text-xs font-medium cursor-pointer"
                >
                  <option value="ALL">Status: All</option>
                  <option value="DRAFT">Status: Draft</option>
                  <option value="APPROVED">Status: Approved</option>
                  <option value="CHANGED">Status: Changed by officer</option>
                  <option value="UNASSIGNED">Status: Needs Review</option>
                </select>

                <select
                  value={basisFilter}
                  onChange={e => setBasisFilter(e.target.value as any)}
                  className="px-2.5 py-1.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-[6px] text-xs font-medium cursor-pointer"
                >
                  <option value="ALL">Placed by: All</option>
                  <option value="CHOICE_1">1st choice</option>
                  <option value="CHOICE_2_3">2nd / 3rd choice</option>
                  <option value="AI">AI-suggested alternative</option>
                </select>

                <select
                  value={schoolFilter}
                  onChange={e => setSchoolFilter(e.target.value)}
                  className="px-2.5 py-1.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-[6px] text-xs font-medium cursor-pointer max-w-[150px] truncate"
                >
                  <option value="ALL">School: All</option>
                  {offersList.map(o => (
                    <option key={o.offer_id} value={o.offer_id}>{o.school_name}</option>
                  ))}
                </select>
              </div>

              {canReview && selectedStudentIds.size > 0 && (
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-xs bg-blue-100 text-[#2563EB] px-2 py-0.5 rounded">
                    {selectedStudentIds.size} selected
                  </span>
                  <button
                    onClick={handleApproveSelected}
                    className="px-3 py-1 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded text-xs font-bold cursor-pointer"
                  >
                    Approve Selected
                  </button>
                </div>
              )}
            </div>

            {/* Students Recommendations Table */}
            <div className="bg-white rounded-[6px] border border-[#E2E8F0] shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#64748B] font-semibold text-[11px] uppercase tracking-wider select-none">
                      <th className="py-3 px-4 w-10 text-center">
                        {canReview && <input
                          type="checkbox"
                          checked={filteredProposals.length > 0 && selectedStudentIds.size === filteredProposals.length}
                          onChange={handleToggleSelectAll}
                          className="rounded border-slate-300 text-[#2563EB] focus:ring-0 cursor-pointer"
                        />}
                      </th>
                      <th className="py-3 px-4">Student ID</th>
                      <th className="py-3 px-4">Student Name</th>
                      <th className="py-3 px-4">Proposed School</th>
                      <th className="py-3 px-4">Placed by</th>
                      <th className="py-3 px-4 min-w-[260px]">Reason</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {filteredProposals.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-slate-400">
                          No students match the current filters.
                        </td>
                      </tr>
                    ) : (
                      filteredProposals.map(item => {
                        const student = item.student;
                        const offer = item.offer;
                        const proposal = item.proposal;
                        const isSelected = selectedStudentIds.has(student.student_id);
                        const unplaced = isUnplaced(item);

                        return (
                          <tr
                            key={student.student_id}
                            onClick={() => openDetails(item)}
                            className="hover:bg-slate-50 transition-colors cursor-pointer align-top"
                          >
                            <td className="py-3 px-4 text-center" onClick={e => e.stopPropagation()}>
                              {canReview && !unplaced && (
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleToggleSelectOne(student.student_id)}
                                  className="rounded border-slate-300 text-[#2563EB] focus:ring-0 cursor-pointer"
                                />
                              )}
                            </td>

                            <td className="py-3 px-4 font-mono font-bold text-[#172554] whitespace-nowrap">
                              {student.student_id}
                            </td>

                            <td className="py-3 px-4">
                              <div className="font-bold text-[#172554]">{student.display_name}</div>
                              <div className="text-[10px] text-slate-400 font-mono">Score: {student.overall_score}%</div>
                            </td>

                            <td className="py-3 px-4">
                              {offer && !unplaced ? (
                                <div className="font-bold text-[#172554] flex items-center gap-1.5">
                                  <Building className="w-3.5 h-3.5 text-[#2563EB] shrink-0" />
                                  <span>{offer.school_name}</span>
                                </div>
                              ) : (
                                <span className="text-rose-600 font-bold">Not placed</span>
                              )}
                            </td>

                            <td className="py-3 px-4 whitespace-nowrap">
                              <span className={`inline-block font-semibold px-2 py-0.5 rounded text-[11px] ${
                                unplaced
                                  ? 'bg-amber-100 text-amber-800'
                                  : proposal.is_fallback
                                  ? 'bg-teal-50 text-[#0F9D8A] border border-teal-200'
                                  : proposal.preference_rank === 1
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-blue-100 text-blue-800'
                              }`}>
                                {unplaced ? 'Not placed' : basisLabel(proposal)}
                              </span>
                            </td>

                            <td className="py-3 px-4 text-[11px] text-slate-600 leading-snug">
                              <div className="line-clamp-2" title={proposal.reason_text}>{proposal.reason_text || '—'}</div>
                              {proposal.suggested_action && (
                                <div className="mt-1 text-amber-700 line-clamp-2" title={proposal.suggested_action}>
                                  → {proposal.suggested_action}
                                </div>
                              )}
                            </td>

                            <td className="py-3 px-4">
                              {proposal.status === 'APPROVED' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                  <Check className="w-3 h-3" /> Approved
                                </span>
                              ) : proposal.status === 'CHANGED' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800">
                                  <Sliders className="w-3 h-3" /> Changed
                                </span>
                              ) : proposal.status === 'REJECTED' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                                  Rejected
                                </span>
                              ) : proposal.status === 'DRAFT' && proposal.offer_id ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                                  Draft
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                                  Needs Review
                                </span>
                              )}
                            </td>

                            <td className="py-3 px-4 text-right" onClick={e => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1.5">
                                {canReview && !unplaced && proposal.status !== 'APPROVED' && (
                                  <button
                                    onClick={() => handleApproveProposal(student.student_id)}
                                    className="px-2.5 py-1 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded font-semibold text-[11px] cursor-pointer"
                                  >
                                    Approve
                                  </button>
                                )}
                                {canReview && proposal.status !== 'APPROVED' && (
                                  <button
                                    onClick={() => (unplaced ? handleOpenAssign(item) : handleOpenManualOverride(item))}
                                    className={`px-2.5 py-1 rounded font-semibold text-[11px] cursor-pointer border ${
                                      unplaced
                                        ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-500'
                                        : 'bg-white hover:bg-slate-100 text-[#172554] border-[#CBD5E1]'
                                    }`}
                                  >
                                    {unplaced ? 'Assign school' : 'Change'}
                                  </button>
                                )}
                                <button
                                  onClick={() => openDetails(item)}
                                  className="p-1 hover:bg-slate-100 text-slate-500 rounded cursor-pointer"
                                  title="View Details"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="p-4 bg-white rounded-[6px] border border-[#E2E8F0] flex items-center justify-between">
              <button
                onClick={() => goToStep(3)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-[#172554] flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to AI Matching</span>
              </button>

              <button
                onClick={() => goToStep(5)}
                className="px-6 py-2.5 bg-[#2563EB] hover:bg-blue-700 text-white rounded-[6px] text-xs font-bold shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
              >
                <span>Continue to Approval</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* STEP 5 — APPROVE PLACEMENTS */}
        {/* ========================================================= */}
        {currentStep === 5 && (
          <div className="bg-white rounded-[8px] border border-[#E2E8F0] p-6 sm:p-10 shadow-xs space-y-6 animate-fadeIn">
            <div>
              <span className="text-[11px] font-mono font-bold text-[#2563EB] uppercase tracking-wider">
                STEP 5 OF 6
              </span>
              <h2 className="text-2xl font-extrabold text-[#172554] tracking-tight mt-1">
                Approve Placements
              </h2>
              <p className="text-xs sm:text-sm text-[#64748B] mt-1 leading-relaxed">
                Approving signs off every remaining draft and officer change that still passes the server’s capacity and eligibility checks. Only approved placements are exported.
              </p>
            </div>

            {/* Final Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
              <div className="p-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-[6px]">
                <div className="text-[10px] text-slate-500 font-semibold uppercase">Total Students</div>
                <div className="text-2xl font-black text-[#172554] mt-1">{totalStudentsCount}</div>
              </div>
              <div className="p-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-[6px]">
                <div className="text-[10px] text-slate-500 font-semibold uppercase">Already approved</div>
                <div className="text-2xl font-black text-[#2563EB] mt-1">{approvedStudentsCount}</div>
              </div>
              <div className="p-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-[6px]">
                <div className="text-[10px] text-slate-500 font-semibold uppercase">Manually Changed</div>
                <div className="text-2xl font-black text-purple-700 mt-1">{overrideStudentsCount}</div>
              </div>
              <div className="p-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-[6px]">
                <div className="text-[10px] text-slate-500 font-semibold uppercase">Needs Review</div>
                <div className="text-2xl font-black text-amber-600 mt-1">{unmatchedStudentsCount}</div>
              </div>
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-[6px]">
                <div className="text-[10px] text-emerald-800 font-semibold uppercase">To approve now</div>
                <div className="text-2xl font-black text-emerald-700 mt-1">{readyForApprovalCount}</div>
              </div>
            </div>

            {/* Warning if unassigned exceptions exist */}
            {unmatchedStudentsCount > 0 && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-[6px] text-xs text-amber-900 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>⚠ {unmatchedStudentsCount} students are not placed.</span>
                </div>
                <p className="text-[11px] text-amber-700 pl-5 leading-relaxed">
                  They stay in the exception queue with their reason and a suggested next step (see the Reason column, or download the
                  exceptions list from Review &amp; Export). Approving now does not change them.
                </p>
              </div>
            )}

            {/* Administrator Declaration Checkbox */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-[6px]">
              <label className="flex items-start gap-3 cursor-pointer text-xs text-[#172554]">
                <input
                  type="checkbox"
                  checked={finalApprovalAgreement}
                  onChange={e => setFinalApprovalAgreement(e.target.checked)}
                  className="rounded border-slate-300 text-[#2563EB] focus:ring-0 mt-0.5 cursor-pointer"
                />
                <div>
                  <span className="font-bold">Administrator Declaration:</span>
                  <p className="text-slate-600 text-[11px] mt-0.5 leading-relaxed">
                    I confirm that I have reviewed the proposed placements, their reasons and any officer changes. I understand this demo uses synthetic data and a demo placement policy.
                  </p>
                </div>
              </label>
            </div>

            {/* Actions */}
            <div className="pt-4 border-t border-[#E2E8F0] flex items-center justify-between">
              <button
                onClick={() => goToStep(4)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-[#172554] flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Review</span>
              </button>

              <button
                disabled={!finalApprovalAgreement || !canReview || readyForApprovalCount === 0}
                onClick={() => setApproveConfirmModalOpen(true)}
                className="px-6 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-[6px] text-xs font-bold shadow-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CheckSquare className="w-4 h-4" />
                <span>Approve Final Placements</span>
              </button>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* STEP 6 — COMPLETE (FINAL RESULTS) */}
        {/* ========================================================= */}
        {currentStep === 6 && (
          <div className="bg-white rounded-[8px] border border-[#E2E8F0] p-6 sm:p-10 shadow-xs space-y-6 animate-fadeIn">
            {/* Success Banner */}
            <div className="p-6 rounded-[8px] bg-emerald-50 border border-emerald-200 text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-[#0F9D8A] flex items-center justify-center mx-auto shadow-xs">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h2 className="text-2xl font-extrabold text-[#172554]">
                ✓ Placement Completed
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 max-w-lg mx-auto">
                The reviewed placements are approved and recorded in the audit log. Only approved rows appear in the export, each with its reason.
              </p>
            </div>

            {/* Final Statistics */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
              <div className="p-3 bg-[#F8FAFC] rounded border border-[#E2E8F0]">
                <div className="text-[10px] text-slate-500 font-semibold uppercase">Approved</div>
                <div className="text-xl font-black text-emerald-700 mt-1">{approvedStudentsCount}</div>
              </div>
              <div className="p-3 bg-[#F8FAFC] rounded border border-[#E2E8F0]">
                <div className="text-[10px] text-slate-500 font-semibold uppercase">1st Preference</div>
                <div className="text-xl font-black text-[#2563EB] mt-1">{pref1Count}</div>
              </div>
              <div className="p-3 bg-[#F8FAFC] rounded border border-[#E2E8F0]">
                <div className="text-[10px] text-slate-500 font-semibold uppercase">2nd Preference</div>
                <div className="text-xl font-black text-[#172554] mt-1">{pref2Count}</div>
              </div>
              <div className="p-3 bg-[#F8FAFC] rounded border border-[#E2E8F0]">
                <div className="text-[10px] text-slate-500 font-semibold uppercase">3rd choice / AI</div>
                <div className="text-xl font-black text-slate-700 mt-1">{prefOtherCount}</div>
              </div>
              <div className="p-3 bg-[#F8FAFC] rounded border border-[#E2E8F0]">
                <div className="text-[10px] text-slate-500 font-semibold uppercase">Officer changes</div>
                <div className="text-xl font-black text-purple-700 mt-1">{overrideStudentsCount}</div>
              </div>
              <div className="p-3 bg-[#F8FAFC] rounded border border-[#E2E8F0]">
                <div className="text-[10px] text-slate-500 font-semibold uppercase">Unmatched / Review</div>
                <div className="text-xl font-black text-amber-600 mt-1">{unmatchedStudentsCount}</div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-4 border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3">
              <button
                onClick={() => goToStep(4)}
                className="px-4 py-2 bg-[#EFF6FF] hover:bg-blue-100 text-[#1D4ED8] rounded-[6px] text-xs font-semibold cursor-pointer"
              >
                View Placements Table
              </button>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleExportCSV}
                  className="px-4 py-2 bg-[#2563EB] hover:bg-blue-700 text-white rounded-[6px] text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Approved placements (CSV)</span>
                </button>

                <button
                  onClick={handleExportExceptions}
                  className="px-4 py-2 bg-[#EFF6FF] hover:bg-blue-100 text-[#1D4ED8] border border-[#DBEAFE] rounded-[6px] text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Not placed + suggested actions (CSV)</span>
                </button>

                <button
                  onClick={handleExportPDF}
                  className="px-4 py-2 bg-white hover:bg-slate-50 text-[#172554] border border-[#CBD5E1] rounded-[6px] text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-rose-600" />
                  <span>Print Report</span>
                </button>

                {onReturnDashboard && (
                  <button
                    onClick={onReturnDashboard}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-[#172554] cursor-pointer"
                  >
                    Return to Dashboard
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ========================================================= */}
      {/* 6. STUDENT DETAILS SLIDE-OVER MODAL (Step 4 & 6) */}
      {/* ========================================================= */}
      {detailStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/40 backdrop-blur-xs">
          <div className="w-full max-w-xl h-full bg-white shadow-2xl flex flex-col overflow-y-auto animate-slideInRight">
            <div className="p-6 bg-[#2563EB] text-white flex items-center justify-between shadow-xs">
              <div>
                <div className="text-xs text-blue-200 font-semibold">Student Placement Dossier</div>
                <h3 className="text-lg font-bold">{detailStudent.student.display_name}</h3>
                <div className="text-xs text-blue-100 font-mono mt-0.5">{detailStudent.student.student_id} • {detailStudent.student.province}</div>
              </div>
              <button
                onClick={() => setDetailStudent(null)}
                className="p-1.5 rounded-full hover:bg-white/10 text-slate-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 flex-1 text-xs">
              {/* Student Information & Academic Results */}
              <div className="p-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-[6px] space-y-2">
                <div className="font-bold text-[#172554] uppercase tracking-wider text-[11px]">
                  Academic Results
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                  <div>
                    <div className="text-slate-400 text-[10px]">Aggregate</div>
                    <div className="text-base font-black text-[#172554]">{detailStudent.student.overall_score}%</div>
                  </div>
                  <div>
                    <div className="text-slate-400 text-[10px]">Math</div>
                    <div className="text-sm font-bold text-[#172554]">{detailStudent.student.math_score}%</div>
                  </div>
                  <div>
                    <div className="text-slate-400 text-[10px]">Science</div>
                    <div className="text-sm font-bold text-[#172554]">{detailStudent.student.science_score}%</div>
                  </div>
                  <div>
                    <div className="text-slate-400 text-[10px]">Language</div>
                    <div className="text-sm font-bold text-[#172554]">{detailStudent.student.language_score}%</div>
                  </div>
                </div>
              </div>

              {/* School Preferences */}
              <div className="space-y-2">
                <div className="font-bold text-[#172554] uppercase tracking-wider text-[11px]">
                  School Preferences
                </div>
                <div className="space-y-1.5">
                  {(detailData?.choices || detailStudent.choices || []).length > 0 ? (
                    (detailData?.choices || detailStudent.choices).map((c: any) => (
                      <div
                        key={c.rank}
                        className={`p-2.5 rounded-[4px] border flex items-center justify-between ${
                          detailStudent.proposal.offer_id === c.offer_id
                            ? 'bg-blue-50 border-[#2563EB]'
                            : 'bg-white border-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-slate-100 text-[#172554] flex items-center justify-center font-bold text-[10px]">
                            {c.rank}
                          </span>
                          <span className="font-bold text-[#172554]">{c.school_name}</span>
                        </div>
                        {detailStudent.proposal.offer_id === c.offer_id && (
                          <span className="text-[10px] font-bold text-[#2563EB] bg-blue-100 px-2 py-0.5 rounded">
                            Assigned
                          </span>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-slate-400">No ranked choices recorded.</div>
                  )}
                </div>
              </div>

              {/* Placement decision and its reason (from the server's recorded decision facts) */}
              <div className={`p-4 rounded-[6px] space-y-3 border ${isUnplaced(detailStudent) ? 'bg-amber-50/60 border-amber-200' : 'bg-blue-50/50 border-blue-200'}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="font-bold text-[#172554] uppercase tracking-wider text-[11px]">Proposed placement</div>
                  <span
                    className={`font-mono font-bold text-[11px] px-2 py-0.5 rounded ${
                      isUnplaced(detailStudent)
                        ? 'bg-amber-100 text-amber-800'
                        : detailStudent.proposal.is_fallback
                        ? 'bg-teal-50 text-[#0F9D8A] border border-teal-200'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {isUnplaced(detailStudent) ? 'Not placed' : basisLabel(detailStudent.proposal)}
                  </span>
                </div>
                <div className="text-sm font-bold text-[#172554] flex items-center gap-1.5">
                  <Building className="w-4 h-4 text-[#2563EB]" />
                  <span>{!isUnplaced(detailStudent) && detailStudent.offer ? detailStudent.offer.school_name : 'No school yet'}</span>
                </div>

                <div className="p-3 bg-white rounded border border-slate-200 text-[#172554] leading-relaxed">
                  <div className="font-bold text-[11px] uppercase text-[#2563EB] mb-1">Reason</div>
                  {detailStudent.proposal.reason_text || '—'}
                  {detailStudent.proposal.suggested_action && (
                    <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-amber-900">
                      <strong>Suggested next step:</strong> {detailStudent.proposal.suggested_action}
                    </div>
                  )}
                </div>

                {detailStudent.proposal.is_fallback && detailStudent.proposal.fit_score != null && (
                  <div className="text-[11px] text-slate-600">
                    AI compatibility score {detailStudent.proposal.fit_score.toFixed(1)}/100. This is a ranking score, not an admission
                    probability.
                  </div>
                )}

                <div className="space-y-1 pt-2 border-t border-blue-200 text-[11px] text-[#172554]">
                  <div className="font-bold uppercase text-[#2563EB]">Step-by-step decision</div>
                  {!detailData ? (
                    <div className="text-slate-400">Loading…</div>
                  ) : (
                    <ol className="list-decimal pl-4 space-y-1">
                      {(detailData.explanation || []).map((line: string, i: number) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ol>
                  )}
                </div>
              </div>

              {isUnplaced(detailStudent) && (
                <div className="p-4 bg-amber-50/60 border border-amber-200 rounded-[6px] space-y-2">
                  <div className="font-bold text-[#172554] uppercase tracking-wider text-[11px]">
                    Suggested: assign a school that still has free seats
                  </div>
                  <p className="text-[11px] text-amber-900">
                    Not limited to the student’s choices. Best AI fit first. Schools outside the choices or below the entry
                    requirements are allowed as a recorded exception with a reason.
                  </p>
                  {detailOpenOffers === null ? (
                    <div className="text-slate-400">Loading…</div>
                  ) : detailOpenOffers.length === 0 ? (
                    <div className="text-slate-600">Every school is full. Add seats (Schools → Edit Quota) to place this student.</div>
                  ) : (
                    <div className="space-y-1.5">
                      {detailOpenOffers.slice(0, 5).map((o, i) => (
                        <div key={o.offer_id} className="p-2.5 bg-white border border-[#E2E8F0] rounded-[6px] flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-bold text-[#172554] truncate">
                              {i === 0 && <span className="text-[10px] font-bold text-[#0F9D8A] mr-1">{o.shortfall > 0 ? "CLOSEST TO REQUIREMENTS" : "BEST FIT"}</span>}
                              {o.school_name}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {o.province} · {o.seats_available} seat(s) free · cutoff {o.min_overall}
                              {o.fit_score != null ? ` · AI ${Math.round(o.fit_score)}/100` : ''}
                            </div>
                            <ExceptionBadges option={o} />
                          </div>
                          {canReview && (
                            <button
                              onClick={() => handleOpenAssign(detailStudent, o.offer_id)}
                              className="px-2 py-1 text-[11px] bg-amber-500 hover:bg-amber-600 text-white rounded font-semibold cursor-pointer shrink-0"
                            >
                              Assign
                            </button>
                          )}
                        </div>
                      ))}
                      {detailOpenOffers.length > 5 && (
                        <button
                          onClick={() => handleOpenAssign(detailStudent)}
                          className="text-[11px] font-semibold text-[#2563EB] hover:underline cursor-pointer"
                        >
                          See all {detailOpenOffers.length} schools with free seats →
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Feasible alternatives, scored by the model */}
              <div className="space-y-2">
                <div className="font-bold text-[#172554] uppercase tracking-wider text-[11px]">
                  Other schools this student could take now
                </div>
                {detailAlternatives === null ? (
                  <div className="text-slate-400">Loading…</div>
                ) : detailAlternatives.filter(a => a.has_capacity && a.offer.offer_id !== detailStudent.proposal.offer_id).length === 0 ? (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded text-slate-500">
                    None. No other school the student is allowed and eligible for has a free seat
                    {detailStudent.student.allow_fallback ? '' : ' (the student did not allow unlisted schools)'}.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {detailAlternatives
                      .filter(a => a.has_capacity && a.offer.offer_id !== detailStudent.proposal.offer_id)
                      .slice(0, 5)
                      .map(alt => (
                        <div key={alt.offer.offer_id} className="p-3 bg-white border border-[#E2E8F0] rounded-[6px] flex items-center justify-between gap-2">
                          <div>
                            <div className="font-bold text-[#172554]">{alt.offer.school_name}</div>
                            <div className="text-[11px] text-slate-500">{alt.eligibility_reason}</div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono text-xs font-bold text-[#0F9D8A]">
                              {alt.has_score ? `${alt.fit_score.toFixed(0)}/100` : alt.listed_rank ? `choice ${alt.listed_rank}` : ''}
                            </span>
                            {canReview && detailStudent.proposal.status !== 'APPROVED' && (
                              <button
                                onClick={() => handleOpenManualOverride(detailStudent, alt.offer.offer_id)}
                                className="px-2 py-1 text-[11px] bg-[#EFF6FF] hover:bg-blue-100 text-[#1D4ED8] rounded font-semibold cursor-pointer"
                              >
                                Select
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="p-4 bg-slate-50 border-t border-[#E2E8F0] flex items-center justify-between">
              <button
                onClick={() => setDetailStudent(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-[#172554] cursor-pointer"
              >
                Close
              </button>
              <div className="flex items-center gap-2">
                {canReview && detailStudent.proposal.status !== 'APPROVED' && (
                  <button
                    onClick={() => (isUnplaced(detailStudent) ? handleOpenAssign(detailStudent) : handleOpenManualOverride(detailStudent))}
                    className="px-3.5 py-2 bg-white hover:bg-slate-100 text-[#172554] border border-[#CBD5E1] rounded-[6px] text-xs font-semibold cursor-pointer"
                  >
                    {isUnplaced(detailStudent) ? 'Assign School' : 'Change School'}
                  </button>
                )}
                {canReview && !isUnplaced(detailStudent) && detailStudent.proposal.status !== 'APPROVED' && (
                  <button
                    onClick={() => handleApproveProposal(detailStudent.student.student_id)}
                    className="px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-[6px] text-xs font-bold cursor-pointer"
                  >
                    ✓ Approve Match
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MANUAL OVERRIDE MODAL */}
      {/* ========================================================= */}
      {manualOverrideModalOpen && manualTargetStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-[8px] max-w-xl w-full border border-[#CBD5E1] shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <div>
                <span className="text-[10px] font-mono uppercase text-purple-700 font-bold">Officer change (needs approval afterwards)</span>
                <h3 className="text-base font-bold text-[#172554]">Change School for {manualTargetStudent.student.display_name}</h3>
              </div>
              <button onClick={() => setManualOverrideModalOpen(false)} className="p-1 hover:bg-slate-100 rounded text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            {manualError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded text-xs">
                {manualError}
              </div>
            )}

            <div className="space-y-2 text-xs">
              <label className="font-bold text-[#172554]">Select a school (only schools this student is eligible and allowed for, with free seats)</label>
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {manualOptions === null ? (
                  <div className="p-3 text-slate-400">Loading feasible schools…</div>
                ) : manualOptions.length === 0 ? (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded text-slate-600">
                    No feasible school: every school this student qualifies for and is allowed to take is full
                    {manualTargetStudent.student.allow_fallback ? '' : ', and the student did not allow unlisted schools'}.
                  </div>
                ) : (
                  manualOptions.map(opt => (
                    <div
                      key={opt.offer.offer_id}
                      onClick={() => setManualSelectedOfferId(opt.offer.offer_id)}
                      className={`p-2.5 rounded border cursor-pointer flex items-center justify-between gap-2 ${
                        manualSelectedOfferId === opt.offer.offer_id ? 'bg-blue-50 border-[#2563EB]' : 'bg-[#F8FAFC] border-slate-200'
                      }`}
                    >
                      <div>
                        <div className="font-bold text-[#172554]">{opt.offer.school_name}</div>
                        <div className="text-[10px] text-slate-500">
                          {opt.eligibility_reason} · cutoff {opt.offer.min_overall}
                          {opt.has_score ? ` · AI score ${opt.fit_score.toFixed(0)}/100` : ''}
                        </div>
                      </div>
                      <input
                        type="radio"
                        checked={manualSelectedOfferId === opt.offer.offer_id}
                        onChange={() => setManualSelectedOfferId(opt.offer.offer_id)}
                        className="text-[#2563EB]"
                      />
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-1.5 text-xs">
              <label className="font-bold text-[#172554]">Reason for the change (required, recorded in the audit log)</label>
              <select
                value={manualReason}
                onChange={e => setManualReason(e.target.value)}
                className="w-full p-2 bg-[#F8FAFC] border border-[#CBD5E1] rounded text-xs font-medium"
              >
                <option value="Family request after consultation">Family request after consultation</option>
                <option value="Distance / transport hardship">Distance / transport hardship</option>
                <option value="Medical or accessibility need">Medical or accessibility need</option>
                <option value="Sibling at the same school">Sibling at the same school</option>
                <option value="Officer review of an unplaced student">Officer review of an unplaced student</option>
              </select>
              <input
                type="text"
                value={manualReasonNote}
                onChange={e => setManualReasonNote(e.target.value)}
                placeholder="Optional details (e.g. who requested it)"
                className="w-full p-2 bg-white border border-[#CBD5E1] rounded text-xs"
              />
            </div>

            <div className="pt-3 border-t border-[#E2E8F0] flex items-center justify-end gap-2 text-xs">
              <button
                onClick={() => setManualOverrideModalOpen(false)}
                className="px-4 py-2 font-semibold text-slate-600 hover:text-[#172554] cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmManualOverride}
                disabled={manualLoading || !manualSelectedOfferId}
                className="px-5 py-2 bg-[#2563EB] hover:bg-blue-700 text-white rounded font-bold transition-colors cursor-pointer disabled:opacity-50"
              >
                {manualLoading ? 'Checking on the server…' : 'Confirm Change'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* ASSIGN SCHOOL MODAL: unplaced student -> any school with free seats */}
      {/* ========================================================= */}
      {assignTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-[8px] max-w-2xl w-full border border-[#CBD5E1] shadow-2xl p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-[#E2E8F0] pb-3 gap-3">
              <div>
                <span className="text-[10px] font-mono uppercase text-amber-700 font-bold">Officer assignment (needs approval afterwards)</span>
                <h3 className="text-base font-bold text-[#172554]">Assign a school to {assignTarget.student.display_name}</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Overall {assignTarget.student.overall_score} · {assignTarget.student.province} ·{' '}
                  {assignTarget.student.allow_fallback ? 'accepts alternative schools' : 'only listed specific schools'}
                </p>
              </div>
              <button onClick={() => setAssignTarget(null)} className="p-1 hover:bg-slate-100 rounded text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            {assignTarget.proposal.reason_text && (
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded text-[11px] text-slate-700">
                <strong>Why not placed:</strong> {assignTarget.proposal.reason_text}
              </div>
            )}

            {assignError && <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded text-xs">{assignError}</div>}

            <div className="space-y-2 text-xs">
              <label className="font-bold text-[#172554]">
                Schools that still have free seats ({assignOptions?.length ?? '…'}), best option first
              </label>
              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {assignOptions === null ? (
                  <div className="p-3 text-slate-400">Loading schools with free seats…</div>
                ) : assignOptions.length === 0 ? (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded text-slate-600">
                    Every school is full. Add seats first (Schools → Edit Quota), then assign.
                  </div>
                ) : (
                  assignOptions.map((o, i) => (
                    <div
                      key={o.offer_id}
                      onClick={() => {
                        setAssignSelected(o.offer_id);
                        setAssignConfirmBelow(false);
                      }}
                      className={`p-2.5 rounded border cursor-pointer flex items-center justify-between gap-2 ${
                        assignSelected === o.offer_id ? 'bg-blue-50 border-[#2563EB]' : 'bg-[#F8FAFC] border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-[#172554]">
                          {i === 0 && <span className="text-[10px] font-bold text-[#0F9D8A] mr-1">{o.shortfall > 0 ? "CLOSEST TO REQUIREMENTS" : "RECOMMENDED"}</span>}
                          {o.school_name}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {o.province} · {o.seats_available} seat(s) free · entry cutoff {o.min_overall}
                          {o.fit_score != null ? ` · AI fit ${Math.round(o.fit_score)}/100` : ''}
                        </div>
                        <ExceptionBadges option={o} />
                      </div>
                      <input type="radio" readOnly checked={assignSelected === o.offer_id} className="text-[#2563EB] shrink-0" />
                    </div>
                  ))
                )}
              </div>
            </div>

            {(() => {
              const sel = assignOptions?.find(o => o.offer_id === assignSelected);
              if (!sel || !sel.exceptions_needed.includes('BELOW_ENTRY_REQUIREMENTS')) return null;
              return (
                <label className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded text-xs text-rose-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={assignConfirmBelow}
                    onChange={e => setAssignConfirmBelow(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    I confirm an <strong>eligibility exception</strong>: the student is below this school’s entry requirements. It
                    will be recorded with my name and reason in the audit log and the export.
                  </span>
                </label>
              );
            })()}

            <div className="space-y-1.5 text-xs">
              <label className="font-bold text-[#172554]">Reason (required, recorded in the audit log)</label>
              <select
                value={assignReason}
                onChange={e => setAssignReason(e.target.value)}
                className="w-full p-2 bg-[#F8FAFC] border border-[#CBD5E1] rounded text-xs font-medium"
              >
                <option value="Officer placement of an unplaced student">Officer placement of an unplaced student</option>
                <option value="Family agreed to this school">Family agreed to this school</option>
                <option value="Nearest school with free seats">Nearest school with free seats</option>
                <option value="Appeal accepted by the school">Appeal accepted by the school</option>
                <option value="Medical or accessibility need">Medical or accessibility need</option>
              </select>
              <input
                type="text"
                value={assignNote}
                onChange={e => setAssignNote(e.target.value)}
                placeholder="Optional details (e.g. who agreed, reference number)"
                className="w-full p-2 bg-white border border-[#CBD5E1] rounded text-xs"
              />
            </div>

            <div className="pt-3 border-t border-[#E2E8F0] flex items-center justify-end gap-2 text-xs">
              <button onClick={() => setAssignTarget(null)} className="px-4 py-2 font-semibold text-slate-600 hover:text-[#172554] cursor-pointer">
                Cancel
              </button>
              <button
                onClick={handleConfirmAssign}
                disabled={
                  assignLoading ||
                  !assignSelected ||
                  (!!assignOptions?.find(o => o.offer_id === assignSelected)?.exceptions_needed.includes('BELOW_ENTRY_REQUIREMENTS') &&
                    !assignConfirmBelow)
                }
                className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded font-bold transition-colors cursor-pointer disabled:opacity-50"
              >
                {assignLoading ? 'Checking on the server…' : 'Assign School'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 8. FINAL APPROVAL CONFIRMATION MODAL (Step 5) */}
      {/* ========================================================= */}
      {approveConfirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-[8px] max-w-md w-full border border-[#CBD5E1] shadow-2xl p-6 space-y-4">
            <div className="w-10 h-10 rounded-full bg-emerald-100 text-[#0F9D8A] flex items-center justify-center">
              <CheckSquare className="w-5 h-5" />
            </div>

            <div>
              <h3 className="text-base font-bold text-[#172554]">
                Approve Final Placements?
              </h3>
              <p className="text-xs text-[#64748B] mt-1 leading-relaxed">
                The server re-checks every placement before approving it. Students who are not placed stay in the exception queue.
              </p>
            </div>

            <div className="p-3 bg-[#F8FAFC] border border-slate-200 rounded text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Placements to approve now:</span>
                <span className="font-bold font-mono text-[#172554]">{readyForApprovalCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Already approved:</span>
                <span className="font-bold font-mono text-emerald-700">{approvedStudentsCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Officer changes included:</span>
                <span className="font-bold font-mono text-purple-700">{overrideStudentsCount}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 text-xs">
              <button
                onClick={() => setApproveConfirmModalOpen(false)}
                className="px-4 py-2 font-semibold text-slate-600 hover:text-[#172554] cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleFinalizeAllPlacements}
                disabled={finalizingLoading}
                className="px-5 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded font-bold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {finalizingLoading ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>Confirm & Finalize</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
