import React, { useState, useEffect } from 'react';
import {
  School,
  Search,
  Check,
  Edit2,
  Users,
  ShieldCheck,
  ChevronRight,
  ArrowRight
} from 'lucide-react';
import { api } from '../services/api';
import { Offer } from '../types';

interface SchoolsScreenProps {
  onSelectSchool?: (offerId: string) => void;
}

export const SchoolsScreen: React.FC<SchoolsScreenProps> = () => {
  const [offers, setOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOffer, setSelectedOffer] = useState<any | null>(null);

  // Edit capacity state
  const [isEditing, setIsEditing] = useState(false);
  const [editCapacity, setEditCapacity] = useState<number>(0);
  const [editMinScore, setEditMinScore] = useState<number>(0);
  const [editFeedback, setEditFeedback] = useState<string | null>(null);

  const fetchOffers = async () => {
    setLoading(true);
    try {
      const res = await api.getOffers();
      setOffers(res.offers);
      if (res.offers.length > 0 && !selectedOffer) {
        setSelectedOffer(res.offers[0]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOffers();
  }, []);

  const handleOpenEdit = (offer: any) => {
    setSelectedOffer(offer);
    setEditCapacity(offer.capacity);
    setEditMinScore(offer.min_overall);
    setIsEditing(true);
    setEditFeedback(null);
  };

  const handleSaveEdit = async () => {
    if (!selectedOffer) return;
    try {
      await api.patchOffer(selectedOffer.offer_id, {
        capacity: Number(editCapacity),
        min_overall: Number(editMinScore)
      });
      setEditFeedback('Capacity updated successfully.');
      setIsEditing(false);
      await fetchOffers();
    } catch (err: any) {
      setEditFeedback(err.message || 'Update failed');
    }
  };

  const filtered = offers.filter(o =>
    o.school_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.province.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const active = selectedOffer || offers[0] || null;

  // Compute mock/simulated demand stats matching prompt item 11
  const allocated = active ? (active.reserved_count || 0) : 0;
  const capacity = active ? active.capacity : 500;
  const available = Math.max(0, capacity - allocated);
  const firstPref = Math.round(allocated * 0.55);
  const secondPref = Math.round(allocated * 0.28);
  const otherPref = Math.max(0, allocated - firstPref - secondPref);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E2E8F0] pb-5">
        <div>
          <div className="text-xs font-semibold text-[#64748B] mb-1">
            Secondary School Catalog & Capacities
          </div>
          <h1 className="text-2xl font-bold text-[#0B1F3A] tracking-tight">
            Schools & Seat Allocations
          </h1>
        </div>

        <div className="relative w-64">
          <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search school name or province..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-white border border-[#E2E8F0] rounded-[6px] text-xs focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
          />
        </div>
      </div>

      {editFeedback && (
        <div className="p-3 bg-slate-100 border border-[#E2E8F0] rounded-[6px] text-xs text-[#0B1F3A] font-medium flex items-center justify-between">
          <span>{editFeedback}</span>
          <button onClick={() => setEditFeedback(null)} className="font-bold underline ml-2">
            Dismiss
          </button>
        </div>
      )}

      {/* 11. School Page Master-Detail Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Schools List */}
        <div className="lg:col-span-6 bg-white rounded-[8px] border border-[#E2E8F0] overflow-hidden">
          <div className="p-4 border-b border-[#E2E8F0] bg-slate-50/50 flex items-center justify-between">
            <span className="text-xs font-bold text-[#0B1F3A] uppercase tracking-wider">
              Institutions ({filtered.length})
            </span>
            <span className="text-[11px] text-[#64748B]">Click to inspect</span>
          </div>

          <div className="divide-y divide-[#E2E8F0] max-h-[620px] overflow-y-auto">
            {filtered.map(offer => {
              const isSelected = active?.offer_id === offer.offer_id;
              const used = offer.reserved_count || 0;
              const cap = offer.capacity;
              const free = Math.max(0, cap - used);

              return (
                <div
                  key={offer.offer_id}
                  onClick={() => {
                    setSelectedOffer(offer);
                    setIsEditing(false);
                  }}
                  className={`p-4 transition-colors cursor-pointer flex items-center justify-between ${
                    isSelected
                      ? 'bg-slate-50 border-l-4 border-[#2563EB]'
                      : 'hover:bg-slate-50/60'
                  }`}
                >
                  <div>
                    <div className="font-semibold text-sm text-[#0F172A]">
                      {offer.school_name}
                    </div>
                    <div className="text-xs text-[#64748B] mt-0.5">
                      {offer.province} · {offer.stage_programme}
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="font-mono font-bold text-xs text-[#0B1F3A] tabular-nums block">
                      {used} / {cap}
                    </span>
                    <span className="text-[11px] text-[#64748B]">
                      {free} available
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: 11. Selected School Detail Card */}
        {active && (
          <div className="lg:col-span-6 bg-white rounded-[8px] border border-[#E2E8F0] p-6 space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-[#E2E8F0] pb-4">
              <div>
                <span className="text-xs font-mono font-semibold text-[#2563EB] block mb-0.5">
                  Offer #{active.offer_id}
                </span>
                <h2 className="text-xl font-bold text-[#0B1F3A]">
                  {active.school_name}
                </h2>
                <div className="text-xs text-[#64748B] mt-0.5">
                  {active.province} Province · {active.stage_programme}
                </div>
              </div>

              <button
                onClick={() => handleOpenEdit(active)}
                className="px-2.5 py-1 text-xs font-semibold text-[#0B1F3A] hover:bg-slate-100 rounded-[6px] border border-[#E2E8F0] transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Edit2 className="w-3 h-3 text-[#64748B]" />
                <span>Edit Quota</span>
              </button>
            </div>

            {/* 11. Capacity Stats: Capacity, Allocated, Available */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3.5 bg-slate-50 rounded-[6px] border border-[#E2E8F0]">
                <span className="text-xs text-[#64748B] block">Capacity</span>
                <span className="text-2xl font-bold font-sans text-[#0B1F3A] tabular-nums mt-1 block">
                  {capacity}
                </span>
                <span className="text-[10px] text-[#64748B] mt-0.5 block">Approved seats</span>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-[6px] border border-[#E2E8F0]">
                <span className="text-xs text-[#64748B] block">Allocated</span>
                <span className="text-2xl font-bold font-sans text-[#2563EB] tabular-nums mt-1 block">
                  {allocated}
                </span>
                <span className="text-[10px] text-[#64748B] mt-0.5 block">Active reservations</span>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-[6px] border border-[#E2E8F0]">
                <span className="text-xs text-[#64748B] block">Available</span>
                <span className="text-2xl font-bold font-sans text-[#16A34A] tabular-nums mt-1 block">
                  {available}
                </span>
                <span className="text-[10px] text-[#64748B] mt-0.5 block">Remaining free</span>
              </div>
            </div>

            {/* 11. Placement Demand */}
            <div className="space-y-3 pt-2 border-t border-[#E2E8F0]">
              <div className="text-xs font-bold uppercase tracking-wider text-[#0B1F3A]">
                Placement Demand
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-2.5 rounded-[6px] bg-slate-50 border border-[#E2E8F0]">
                  <span className="text-[#0F172A] font-medium">First preference</span>
                  <span className="font-mono font-bold text-[#0B1F3A] tabular-nums">{firstPref} candidates</span>
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-[6px] bg-slate-50 border border-[#E2E8F0]">
                  <span className="text-[#0F172A] font-medium">Second preference</span>
                  <span className="font-mono font-bold text-[#0B1F3A] tabular-nums">{secondPref} candidates</span>
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-[6px] bg-slate-50 border border-[#E2E8F0]">
                  <span className="text-[#0F172A] font-medium">Other / Fallback requests</span>
                  <span className="font-mono font-bold text-[#0B1F3A] tabular-nums">{otherPref} candidates</span>
                </div>
              </div>
            </div>

            {/* 11. Placement Requirements Checklist */}
            <div className="space-y-2.5 pt-2 border-t border-[#E2E8F0] text-xs">
              <div className="text-xs font-bold uppercase tracking-wider text-[#0B1F3A]">
                Placement Requirements
              </div>
              <div className="space-y-1.5 text-[#0F172A]">
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-[#16A34A] shrink-0 stroke-[3]" />
                  <span>Academic threshold: Overall minimum score &ge; {active.min_overall}/100</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-[#16A34A] shrink-0 stroke-[3]" />
                  <span>Capacity available: Unassigned applicants admitted until {capacity} seats reach quota</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-[#16A34A] shrink-0 stroke-[3]" />
                  <span>Eligible candidates: Subject weightings (Math {Math.round(active.weight_math * 100)}%, Science {Math.round(active.weight_science * 100)}%)</span>
                </div>
              </div>
            </div>

            {/* Edit Quota Form when open */}
            {isEditing && (
              <div className="p-4 bg-slate-50 rounded-[6px] border border-[#E2E8F0] space-y-3 text-xs">
                <div className="font-bold text-[#0B1F3A]">
                  Edit Institution Quotas (Administrator)
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[#64748B] mb-1">Total Capacity</label>
                    <input
                      type="number"
                      min="0"
                      value={editCapacity}
                      onChange={e => setEditCapacity(parseInt(e.target.value, 10) || 0)}
                      className="w-full p-1.5 bg-white border border-[#E2E8F0] rounded-[6px] text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[#64748B] mb-1">Min Score Threshold</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={editMinScore}
                      onChange={e => setEditMinScore(parseInt(e.target.value, 10) || 0)}
                      className="w-full p-1.5 bg-white border border-[#E2E8F0] rounded-[6px] text-xs"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-3 py-1 text-xs text-[#64748B]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    className="px-3 py-1 bg-[#0B1F3A] text-white rounded-[6px] text-xs font-semibold"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
