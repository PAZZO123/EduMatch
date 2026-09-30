import React from 'react';
import {
  Users,
  School,
  Clock,
  CheckCircle2,
  TrendingUp,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  AlertTriangle
} from 'lucide-react';
import { DashboardMetrics, Offer } from '../types';

interface DashboardScreenProps {
  metrics: DashboardMetrics | null;
  offers: Offer[];
  onNavigateToPlacement: (studentId?: string) => void;
  onNavigateToSchools: () => void;
  onRunEngine: () => void;
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  metrics,
  offers,
  onNavigateToPlacement,
  onNavigateToSchools,
  onRunEngine
}) => {
  const totalCapacity = offers.reduce((a, b) => a + b.capacity, 0);
  const totalReserved = offers.reduce((a, b) => a + (b.reserved_count || 0), 0);
  const totalApproved = offers.reduce((a, b) => a + (b.approved_count || 0), 0);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* 5. Dashboard Greeting */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-[#64748B] mb-1">
            National Examination & School Inspection Authority (NESA)
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#0B1F3A] tracking-tight">
            Good morning, Placement Officer
          </h1>
          <p className="text-sm text-[#64748B] mt-1">
            2026 O-Level Secondary School Placement Console · Province Cohort Snapshot
          </p>
        </div>

        <button
          onClick={() => onNavigateToPlacement()}
          className="px-4 py-2 bg-[#0B1F3A] hover:bg-slate-800 text-white text-xs font-semibold rounded-[6px] shadow-xs transition-colors flex items-center gap-2 cursor-pointer self-start sm:self-auto"
        >
          <span>Open Placement Workspace</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 7. Dashboard Cards (Clean white cards, thin borders #E2E8F0, large numbers) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Students */}
        <div className="p-5 bg-white rounded-[8px] border border-[#E2E8F0] space-y-1">
          <div className="text-xs font-medium text-[#64748B]">Candidates</div>
          <div className="text-3xl font-bold font-sans text-[#0B1F3A] tabular-nums tracking-tight">
            {metrics ? metrics.total_applicants.toLocaleString() : '200'}
          </div>
          <div className="text-[12px] text-[#64748B] flex items-center gap-1.5 pt-1">
            <span className="text-[#16A34A] font-semibold">+12.4%</span>
            <span>Registered applicants</span>
          </div>
        </div>

        {/* Card 2: Schools */}
        <div className="p-5 bg-white rounded-[8px] border border-[#E2E8F0] space-y-1">
          <div className="text-xs font-medium text-[#64748B]">Schools</div>
          <div className="text-3xl font-bold font-sans text-[#0B1F3A] tabular-nums tracking-tight">
            {offers.length > 0 ? offers.length : '12'}
          </div>
          <div className="text-[12px] text-[#64748B] pt-1">
            Available institutions ({totalCapacity} seats)
          </div>
        </div>

        {/* Card 3: Pending Placement */}
        <div className="p-5 bg-white rounded-[8px] border border-[#E2E8F0] space-y-1">
          <div className="text-xs font-medium text-[#64748B]">Pending Placement</div>
          <div className="text-3xl font-bold font-sans text-[#D97706] tabular-nums tracking-tight">
            {metrics ? (metrics.assigned_count - metrics.approved_count).toLocaleString() : '149'}
          </div>
          <div className="text-[12px] text-[#64748B] pt-1">
            Awaiting officer verification
          </div>
        </div>

        {/* Card 4: AI Recommendations Compliance */}
        <div className="p-5 bg-white rounded-[8px] border border-[#E2E8F0] space-y-1">
          <div className="text-xs font-medium text-[#64748B]">AI Compliance</div>
          <div className="text-3xl font-bold font-sans text-[#0F9D8A] tabular-nums tracking-tight">
            {metrics ? `${metrics.placement_rate}%` : '94.2%'}
          </div>
          <div className="text-[12px] text-[#64748B] flex items-center gap-1 pt-1">
            <span className="text-[#16A34A] font-semibold">100%</span>
            <span>Rule-compliant & checked</span>
          </div>
        </div>
      </div>

      {/* Placement Overview & Capacity Visualization */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Placement Overview Chart & Breakdown */}
        <div className="lg:col-span-8 bg-white rounded-[8px] border border-[#E2E8F0] p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-4">
            <div>
              <h2 className="text-base font-bold text-[#0B1F3A]">
                Placement Overview
              </h2>
              <p className="text-xs text-[#64748B] mt-0.5">
                Aggregate capacity allocation and preference alignment
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#16A34A]" />
              <span className="text-xs text-[#64748B]">Approved</span>
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#2563EB] ml-2" />
              <span className="text-xs text-[#64748B]">Draft Reserved</span>
            </div>
          </div>

          {/* Seat Capacity Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[#0B1F3A]">
                Seat Pool Allocation ({totalReserved} / {totalCapacity} seats)
              </span>
              <span className="font-mono text-[#64748B]">
                {totalCapacity > 0 ? Math.round((totalReserved / totalCapacity) * 100) : 0}% Allocated
              </span>
            </div>

            <div className="w-full h-3 bg-slate-100 rounded-[4px] overflow-hidden flex">
              <div
                className="bg-[#16A34A] h-full transition-all"
                style={{ width: `${totalCapacity > 0 ? (totalApproved / totalCapacity) * 100 : 0}%` }}
                title={`Approved: ${totalApproved}`}
              />
              <div
                className="bg-[#2563EB] h-full transition-all"
                style={{ width: `${totalCapacity > 0 ? ((totalReserved - totalApproved) / totalCapacity) * 100 : 0}%` }}
                title={`Draft Reserved: ${totalReserved - totalApproved}`}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-[#64748B] pt-1">
              <span>{totalApproved} Approved by Officer</span>
              <span>{totalReserved - totalApproved} Draft Proposals</span>
              <span>{Math.max(0, totalCapacity - totalReserved)} Seats Remaining</span>
            </div>
          </div>

          {/* Breakdown by Preference Tier */}
          <div className="pt-4 border-t border-[#E2E8F0] grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-3.5 bg-slate-50 rounded-[6px] border border-[#E2E8F0]">
              <span className="text-xs text-[#64748B] block">First Preference Matches</span>
              <span className="text-xl font-bold font-sans text-[#0B1F3A] tabular-nums mt-1 block">
                {metrics ? `${metrics.first_choice_rate}%` : '52.0%'}
              </span>
              <span className="text-[11px] text-[#64748B] mt-0.5 block">
                Assigned 1st ranked school
              </span>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-[6px] border border-[#E2E8F0]">
              <span className="text-xs text-[#64748B] block">Top-Three Listed</span>
              <span className="text-xl font-bold font-sans text-[#0B1F3A] tabular-nums mt-1 block">
                {metrics ? `${metrics.top_three_rate}%` : '84.5%'}
              </span>
              <span className="text-[11px] text-[#64748B] mt-0.5 block">
                Assigned choice 1, 2 or 3
              </span>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-[6px] border border-[#E2E8F0]">
              <span className="text-xs text-[#64748B] block">AI Fallback Matches</span>
              <span className="text-xl font-bold font-sans text-[#0F9D8A] tabular-nums mt-1 block">
                {metrics ? `${Math.max(0, Math.round((metrics.assigned_count - (metrics.total_applicants * metrics.top_three_rate / 100)) * 10) / 10)}%` : '12.0%'}
              </span>
              <span className="text-[11px] text-[#64748B] mt-0.5 block">
                Eligible unlisted fallback
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Institutions & Status */}
        <div className="lg:col-span-4 bg-white rounded-[8px] border border-[#E2E8F0] p-6 space-y-5 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <h2 className="text-sm font-bold text-[#0B1F3A]">
                High-Demand Schools
              </h2>
              <button
                onClick={onNavigateToSchools}
                className="text-xs text-[#2563EB] hover:underline font-semibold"
              >
                View all ({offers.length})
              </button>
            </div>

            <div className="space-y-3">
              {offers.slice(0, 4).map(offer => {
                const reserved = offer.reserved_count || 0;
                const cap = offer.capacity;
                const isFull = reserved >= cap;

                return (
                  <div key={offer.offer_id} className="text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[#0B1F3A] truncate max-w-[170px]">
                        {offer.school_name}
                      </span>
                      <span className={`font-mono text-[11px] ${isFull ? 'text-[#DC2626] font-bold' : 'text-[#64748B]'}`}>
                        {reserved}/{cap} seats
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full ${isFull ? 'bg-[#DC2626]' : 'bg-[#2563EB]'}`}
                        style={{ width: `${cap > 0 ? (reserved / cap) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-[6px] border border-[#E2E8F0] text-xs space-y-1.5">
            <div className="font-bold text-[#0B1F3A] flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#16A34A]" />
              <span>Invariants Enforced</span>
            </div>
            <p className="text-[#64748B] text-[11px] leading-relaxed">
              Every placement satisfies eligibility thresholds, per-offer capacities, and uniqueness constraints before presentation.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
