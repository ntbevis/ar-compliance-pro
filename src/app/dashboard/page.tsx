'use client';

import { useFacility } from 'src/context/FacilityContext';
import { useEffect, useState } from 'react';
import {
  getAllFacilitiesOverview,
  getAuditLogs,
  getCurrentUserRole,
  getFacilityComplianceData,
  updateEnrollment,
  addFacility,
  archiveFacility,
} from 'src/app/actions/compliance';
import type { FacilityType, FacilityScopeToggles } from '@/lib/types';
import { FACILITY_TOGGLE_LABELS, TOGGLES_BY_FACILITY_TYPE } from '@/lib/types';
import ComplianceDashboardClient from 'src/components/ComplianceDashboardClient';
import PersonnelVaultView from 'src/components/PersonnelVaultView';
import DocumentCenterView from 'src/components/DocumentCenterView';
import OperationalBlueprintsView from 'src/components/OperationalBlueprintsView';
import FacilitySettingsView from 'src/components/FacilitySettingsView';
import type { IdentifiedGap } from '@/lib/types';
import { generateAuditReport } from '@/lib/pdf-generator';

interface FacilitySummary {
  id: string;
  name: string;
  facility_type: string;
  capacity: number | null;
  active_enrollment: number | null;
  enrollment_updated_at: string | null;
  facilityReadinessScore: number;
  personnelReadinessScore: number;
  totalPersonnel: number;
  gapsCount: number;
  active_staff_count?: number;
  capacity_utilization?: number;
  gross_ratio?: string;
}

interface ComplianceData {
  facilityReadinessScore: number;
  personnelReadinessScore: number;
  gaps: IdentifiedGap[];
  totalPersonnel: number;
  capacity: number | null;
  activeEnrollment: number | null;
  enrollmentUpdatedAt: string | null;
}

interface AuditLogRow {
  id: string;
  created_at: string;
  facility_name: string;
  user_name: string;
  user_role: string;
  action_type: string;
  metadata: Record<string, unknown> | null;
}

function DialSummary({ label, score }: { label: string; score: number }) {
  const tone =
    score >= 80
      ? 'border-emerald-500 text-emerald-600 bg-emerald-50'
      : score >= 50
      ? 'border-amber-500 text-amber-600 bg-amber-50'
      : 'border-rose-500 text-rose-600 bg-rose-50';
  return (
    <div className="flex flex-col items-center">
      <div className={`w-20 h-20 rounded-full border-4 flex items-center justify-center text-lg font-black ${tone}`}>
        {score}%
      </div>
      <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mt-2 text-center">{label}</p>
    </div>
  );
}

export default function DashboardPage() {
  const { selectedFacilityId, setSelectedFacilityId, currentView, setCurrentView } = useFacility();
  const [userRole, setUserRole] = useState<string | null>(null);

  const [facilitiesData, setFacilitiesData] = useState<FacilitySummary[]>([]);
  const [compliance, setCompliance] = useState<ComplianceData | null>(null);
  const [enrollmentInput, setEnrollmentInput] = useState<string>('');
  const [updatingEnrollment, setUpdatingEnrollment] = useState<boolean>(false);

  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const [generatingReport, setGeneratingReport] = useState<boolean>(false);

  // Facility management state
  const [showAddFacilityModal, setShowAddFacilityModal] = useState<boolean>(false);
  const [addingFacility, setAddingFacility] = useState<boolean>(false);
  const [archivingFacilityId, setArchivingFacilityId] = useState<string | null>(null);
  const [facilityToArchive, setFacilityToArchive] = useState<{id: string; name: string} | null>(null);
  const [newFacilityForm, setNewFacilityForm] = useState<{
    name: string;
    facility_type: FacilityType;
    license_number: string;
    capacity: string;
    toggles: Partial<FacilityScopeToggles>;
  }>({
    name: '',
    facility_type: 'childcare_center',
    license_number: '',
    capacity: '',
    toggles: {},
  });

  // Load user role once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await getCurrentUserRole();
      if (!cancelled && r.success) setUserRole(r.role ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load data appropriate to the selected facility / view
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        if (currentView === 'audit_logs') {
          const logs = await getAuditLogs(
            selectedFacilityId !== 'all' ? selectedFacilityId : undefined
          );
          if (!cancelled) setAuditLogs(logs as AuditLogRow[]);
          return;
        }

        if (selectedFacilityId === 'all' || !selectedFacilityId) {
          const facilities = (await getAllFacilitiesOverview()) as FacilitySummary[];
          if (!cancelled) setFacilitiesData(facilities);
          // Directors auto-redirect into their first facility
          if (userRole === 'director' && facilities.length > 0) {
            setSelectedFacilityId(facilities[0].id);
          }
          return;
        }

        const data = (await getFacilityComplianceData(selectedFacilityId)) as ComplianceData;
        if (!cancelled) {
          setCompliance(data);
          if (data.activeEnrollment !== null && data.activeEnrollment !== undefined) {
            setEnrollmentInput(String(data.activeEnrollment));
          } else {
            setEnrollmentInput('');
          }
        }
      } catch (err) {
        console.error('Dashboard load error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedFacilityId, currentView, userRole, setSelectedFacilityId]);

  const handleUpdateEnrollment = async () => {
    if (!selectedFacilityId || selectedFacilityId === 'all') return;
    const enrollment = parseInt(enrollmentInput, 10);
    if (Number.isNaN(enrollment) || enrollment < 0) {
      alert('Please enter a valid enrollment number.');
      return;
    }
    setUpdatingEnrollment(true);
    try {
      const result = await updateEnrollment(selectedFacilityId, enrollment);
      if (result.success) {
        const refreshed = (await getFacilityComplianceData(selectedFacilityId)) as ComplianceData;
        setCompliance(refreshed);
      } else {
        alert(`❌ ${result.error}`);
      }
    } finally {
      setUpdatingEnrollment(false);
    }
  };

  const handleAddFacility = async (e: React.FormEvent) => {
    e.preventDefault();
    const capacity = parseInt(newFacilityForm.capacity, 10);
    if (Number.isNaN(capacity) || capacity < 0) {
      alert('Please enter a valid capacity number.');
      return;
    }
    setAddingFacility(true);
    try {
      const result = await addFacility({
        name: newFacilityForm.name,
        facility_type: newFacilityForm.facility_type,
        license_number: newFacilityForm.license_number,
        capacity,
        toggles: newFacilityForm.toggles,
      });
      if (result.success) {
        setShowAddFacilityModal(false);
        setNewFacilityForm({
          name: '',
          facility_type: 'childcare_center',
          license_number: '',
          capacity: '',
          toggles: {},
        });
        const facilities = (await getAllFacilitiesOverview()) as FacilitySummary[];
        setFacilitiesData(facilities);
      } else {
        alert(`❌ ${result.error}`);
      }
    } finally {
      setAddingFacility(false);
    }
  };

  const handleArchiveFacility = async () => {
    if (!facilityToArchive) return;
    
    setArchivingFacilityId(facilityToArchive.id);
    try {
      const result = await archiveFacility(facilityToArchive.id);
      if (result.success) {
        const facilities = (await getAllFacilitiesOverview()) as FacilitySummary[];
        setFacilitiesData(facilities);
      } else {
        alert(`❌ ${result.error}`);
      }
    } finally {
      setArchivingFacilityId(null);
      setFacilityToArchive(null);
    }
  };

  if (loading) {
    return (
      <div className="p-12 min-h-screen bg-slate-50 flex items-center justify-center animate-pulse">
        <p className="text-blue-500 font-black tracking-[0.3em] uppercase text-xs">
          Synchronizing compliance engine…
        </p>
      </div>
    );
  }

  // ---- AUDIT LOGS VIEW (available from any selection) ----
  if (currentView === 'audit_logs') {
    return (
      <div className="p-8 md:p-12 min-h-screen bg-slate-50 animate-in fade-in duration-700">
        <header className="mb-6">
          <p className="text-blue-500 font-black text-xs uppercase tracking-widest mb-2">
            DHS Regulatory Engine
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 mb-2">
            Audit Trail &amp; Compliance Logs
          </h1>
          <p className="text-slate-600 text-sm">
            Immutable log of every compliance action across the organization.
          </p>
        </header>

        <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm max-w-6xl mx-auto text-slate-800">
          {auditLogs.length === 0 ? (
            <div className="border border-dashed border-slate-200 rounded-xl p-12 text-center italic text-slate-400 text-xs bg-slate-50">
              No audit logs found for the selected scope.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-left py-3 px-4 font-semibold text-slate-700">Timestamp</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-700">Facility</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-700">Action</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-700">User</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-700">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 text-xs text-slate-600 font-mono whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-800">{log.facility_name}</td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                          {log.action_type.replace(/_/g, ' ').toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-col gap-1">
                          <span className="font-medium text-slate-800">{log.user_name}</span>
                          <span className="text-xs text-slate-500 uppercase">{log.user_role}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 max-w-md font-mono">
                        {JSON.stringify(log.metadata ?? {})}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---- MASTER FLEET OVERVIEW (no facility selected) ----
  if (selectedFacilityId === 'all' || !selectedFacilityId) {
    const canManageFacilities = userRole === 'owner' || userRole === 'admin';

    return (
      <div className="p-8 md:p-12 min-h-screen bg-slate-50 animate-in fade-in duration-700">
        <header className="mb-8">
          <p className="text-blue-500 font-black text-xs uppercase tracking-widest mb-2">
            DHS Regulatory Engine
          </p>
          <div className="flex items-start justify-between mb-2">
            <h1 className="text-5xl font-bold tracking-tight text-slate-900">
              Executive Fleet Overview
            </h1>
            {canManageFacilities && (
              <button
                onClick={() => setShowAddFacilityModal(true)}
                className="flex items-center gap-2 px-5 py-3 rounded-lg text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 shadow-sm transition-all"
              >
                ➕ Add New Facility
              </button>
            )}
          </div>
          <p className="text-slate-600 text-lg">
            Twin-score compliance monitoring across all facilities.
          </p>
        </header>

        {/* Archive Facility Confirmation Modal */}
        {facilityToArchive && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
              <div className="bg-gradient-to-r from-rose-600 to-rose-700 px-6 py-4 rounded-t-xl">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  ⚠️ Confirm Archive Action
                </h2>
              </div>
              <div className="p-6">
                <p className="text-slate-800 mb-2 font-semibold">
                  Are you sure you want to archive <span className="text-rose-700">{facilityToArchive.name}</span>?
                </p>
                <p className="text-sm text-slate-600 mb-4">
                  This will hide it from your active dashboard. Its audit logs will be preserved.
                </p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setFacilityToArchive(null)}
                    disabled={archivingFacilityId !== null}
                    className="flex-1 px-4 py-2.5 bg-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleArchiveFacility}
                    disabled={archivingFacilityId !== null}
                    className="flex-1 px-4 py-2.5 bg-rose-600 text-white rounded-lg font-medium hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {archivingFacilityId !== null ? 'Archiving…' : 'Yes, Archive Facility'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Add Facility Modal */}
        {showAddFacilityModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-gradient-to-r from-slate-800 to-slate-700 px-6 py-4 flex items-center justify-between">
                <h2 className="text-xl font-bold text-white">Add New Facility</h2>
                <button
                  onClick={() => setShowAddFacilityModal(false)}
                  className="text-white/80 hover:text-white text-2xl leading-none"
                >
                  ×
                </button>
              </div>
              <form onSubmit={handleAddFacility} className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Facility Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={newFacilityForm.name}
                      onChange={(e) => setNewFacilityForm({ ...newFacilityForm, name: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 bg-white placeholder:text-slate-400"
                      placeholder="e.g., Sunshine Learning Center"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Facility Type <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={newFacilityForm.facility_type}
                      onChange={(e) =>
                        setNewFacilityForm({
                          ...newFacilityForm,
                          facility_type: e.target.value as FacilityType,
                          toggles: {},
                        })
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 bg-white"
                      required
                    >
                      <option value="childcare_center" className="text-slate-900 bg-white">Childcare Center</option>
                      <option value="nursing_home" className="text-slate-900 bg-white">Nursing Home</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      License Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={newFacilityForm.license_number}
                      onChange={(e) =>
                        setNewFacilityForm({ ...newFacilityForm, license_number: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 bg-white placeholder:text-slate-400"
                      placeholder="e.g., AR-12345"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Licensed Capacity <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={newFacilityForm.capacity}
                      onChange={(e) => setNewFacilityForm({ ...newFacilityForm, capacity: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 bg-white placeholder:text-slate-400"
                      placeholder="e.g., 50"
                      required
                    />
                  </div>
                </div>

                {/* Dynamic Toggles */}
                <div>
                  <h3 className="text-sm font-bold text-slate-800 mb-3">Facility Scope Toggles</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {TOGGLES_BY_FACILITY_TYPE[newFacilityForm.facility_type].map((toggleKey) => (
                      <label
                        key={toggleKey}
                        className="flex items-center gap-2 p-3 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(newFacilityForm.toggles[toggleKey])}
                          onChange={(e) =>
                            setNewFacilityForm({
                              ...newFacilityForm,
                              toggles: { ...newFacilityForm.toggles, [toggleKey]: e.target.checked },
                            })
                          }
                          className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="text-sm text-slate-700">{FACILITY_TOGGLE_LABELS[toggleKey]}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-4 border-t border-slate-200">
                  <button
                    type="submit"
                    disabled={addingFacility}
                    className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
                  >
                    {addingFacility ? 'Creating…' : 'Create Facility'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddFacilityModal(false)}
                    disabled={addingFacility}
                    className="px-6 py-2.5 bg-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-300 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Fleet Analytics Section */}
        {facilitiesData.length > 0 && (() => {
          const avgFacility = Math.round(
            facilitiesData.reduce((s, f) => s + f.facilityReadinessScore, 0) / facilitiesData.length
          );
          const avgPersonnel = Math.round(
            facilitiesData.reduce((s, f) => s + f.personnelReadinessScore, 0) / facilitiesData.length
          );
          const lowestFacility = facilitiesData.reduce((worst, f) =>
            (f.facilityReadinessScore + f.personnelReadinessScore) <
            (worst.facilityReadinessScore + worst.personnelReadinessScore)
              ? f
              : worst
          );
          const lowestCombined = Math.round(
            (lowestFacility.facilityReadinessScore + lowestFacility.personnelReadinessScore) / 2
          );
          const dialTone = (score: number) =>
            score >= 80
              ? { border: 'border-emerald-500', text: 'text-emerald-600', bg: 'bg-emerald-50' }
              : score >= 50
              ? { border: 'border-amber-500', text: 'text-amber-600', bg: 'bg-amber-50' }
              : { border: 'border-rose-500', text: 'text-rose-600', bg: 'bg-rose-50' };

          return (
            <div className="mb-10 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-slate-900 to-slate-700 px-8 py-5">
                <p className="text-blue-300 text-xs font-bold uppercase tracking-widest mb-1">
                  Fleet Analytics
                </p>
                <h2 className="text-2xl font-bold text-white">
                  Organization-Wide Compliance Overview
                </h2>
                <p className="text-slate-400 text-sm mt-1">
                  Averages across {facilitiesData.length} active{' '}
                  {facilitiesData.length === 1 ? 'facility' : 'facilities'}
                </p>
              </div>

              <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Facility Score Dial */}
                <div className="flex flex-col items-center text-center">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">
                    🏢 Avg. Facility Score
                  </p>
                  <div
                    className={`w-28 h-28 rounded-full border-8 flex items-center justify-center text-2xl font-black ${dialTone(avgFacility).border} ${dialTone(avgFacility).text} ${dialTone(avgFacility).bg}`}
                  >
                    {avgFacility}%
                  </div>
                  <div className="mt-4 w-full bg-slate-100 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${avgFacility >= 80 ? 'bg-emerald-500' : avgFacility >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
                      style={{ width: `${avgFacility}%` }}
                    />
                  </div>
                </div>

                {/* Personnel Score Dial */}
                <div className="flex flex-col items-center text-center">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">
                    👥 Avg. Personnel Score
                  </p>
                  <div
                    className={`w-28 h-28 rounded-full border-8 flex items-center justify-center text-2xl font-black ${dialTone(avgPersonnel).border} ${dialTone(avgPersonnel).text} ${dialTone(avgPersonnel).bg}`}
                  >
                    {avgPersonnel}%
                  </div>
                  <div className="mt-4 w-full bg-slate-100 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${avgPersonnel >= 80 ? 'bg-emerald-500' : avgPersonnel >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
                      style={{ width: `${avgPersonnel}%` }}
                    />
                  </div>
                </div>

                {/* Needs Attention Alert */}
                <div className="flex flex-col justify-center">
                  {lowestCombined < 80 ? (
                    <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-5">
                      <p className="text-xs font-bold uppercase tracking-wider text-amber-700 mb-2">
                        ⚠️ Needs Attention
                      </p>
                      <p className="font-bold text-slate-800 text-base mb-1">
                        {lowestFacility.name}
                      </p>
                      <p className="text-xs text-slate-600 mb-3">
                        Combined score: <span className="font-bold text-amber-700">{lowestCombined}%</span> — the lowest in your fleet.
                      </p>
                      <button
                        onClick={() => {
                          setSelectedFacilityId(lowestFacility.id);
                          setCurrentView('overview');
                        }}
                        className="w-full text-xs font-bold px-3 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
                      >
                        View {lowestFacility.name} →
                      </button>
                    </div>
                  ) : (
                    <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-5 text-center">
                      <p className="text-3xl mb-2">✅</p>
                      <p className="font-bold text-emerald-800 text-sm">All Facilities Healthy</p>
                      <p className="text-xs text-emerald-700 mt-1">
                        Every facility is above 80% compliance.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Fleet Operations */}
              {(() => {
                const totalStaff = facilitiesData.reduce((s, f) => s + f.totalPersonnel, 0);
                const totalEnrollment = facilitiesData.reduce(
                  (s, f) => s + (f.active_enrollment ?? 0),
                  0
                );
                const orgRatio =
                  totalStaff > 0
                    ? `1 : ${(totalEnrollment / totalStaff).toFixed(1)}`
                    : 'N/A';
                const facilitiesWithUtil = facilitiesData.filter(
                  (f) => f.capacity_utilization != null
                );
                const avgUtil =
                  facilitiesWithUtil.length > 0
                    ? Math.round(
                        facilitiesWithUtil.reduce(
                          (s, f) => s + (f.capacity_utilization ?? 0),
                          0
                        ) / facilitiesWithUtil.length
                      )
                    : null;

                return (
                  <div className="border-t border-slate-200 px-8 py-6">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">
                      Fleet Operations
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-slate-50 rounded-xl p-4 text-center">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                          Total Active Staff
                        </p>
                        <p className="text-3xl font-black text-slate-800">{totalStaff}</p>
                        <p className="text-[10px] text-slate-400 mt-1">Across all facilities</p>
                      </div>
                      <div className="bg-slate-50 rounded-xl p-4 text-center">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                          Org-Wide Gross Ratio
                        </p>
                        <p className="text-3xl font-black text-slate-800">{orgRatio}</p>
                        <p className="text-[10px] text-slate-400 mt-1">Enrolled per staff member</p>
                      </div>
                      <div className="bg-slate-50 rounded-xl p-4 text-center">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                          Avg. Capacity Utilization
                        </p>
                        {avgUtil != null ? (
                          <>
                            <p
                              className={`text-3xl font-black ${
                                avgUtil > 95 ? 'text-amber-600' : 'text-slate-800'
                              }`}
                            >
                              {avgUtil}%
                            </p>
                            {avgUtil > 95 && (
                              <p className="text-[10px] text-amber-500 mt-1">
                                ⚠️ Near full capacity
                              </p>
                            )}
                          </>
                        ) : (
                          <p className="text-xl font-black text-slate-400 mt-2">N/A</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        })()}

        {facilitiesData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="p-8 border border-dashed border-slate-300 rounded-2xl bg-white max-w-md shadow-sm text-center">
              <p className="text-slate-500 italic">
                No facilities found. Complete onboarding to begin monitoring compliance.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {facilitiesData.map((facility) => (
              <div
                key={facility.id}
                className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden"
              >
                <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-6 py-4">
                  <h3 className="text-white font-bold text-lg mb-1">{facility.name}</h3>
                  <span className="text-xs bg-white/20 text-white px-2 py-0.5 rounded-full font-medium">
                    {facility.facility_type === 'childcare_center' ? 'Childcare Center' : 'Nursing Home'}
                  </span>
                </div>

                <div className="p-6 grid grid-cols-2 gap-4 border-b border-slate-100">
                  <DialSummary label="🏢 Facility" score={facility.facilityReadinessScore} />
                  <DialSummary label="👥 Personnel" score={facility.personnelReadinessScore} />
                </div>

                <div className="p-6 space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Capacity</span>
                    <span className="text-slate-900 font-bold">{facility.capacity ?? 'N/A'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Active Enrollment</span>
                    <span className="text-slate-900 font-bold">
                      {facility.active_enrollment ?? 'Not Set'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Active Staff</span>
                    <span className="text-slate-900 font-bold">{facility.totalPersonnel}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Open Gaps</span>
                    <span
                      className={`font-bold ${
                        facility.gapsCount === 0
                          ? 'text-emerald-600'
                          : facility.gapsCount <= 3
                          ? 'text-amber-600'
                          : 'text-rose-600'
                      }`}
                    >
                      {facility.gapsCount}
                    </span>
                  </div>

                  {(facility.capacity_utilization != null || facility.gross_ratio) && (
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                      {facility.capacity_utilization != null && (
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${
                            facility.capacity_utilization > 95
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          📊 {facility.capacity_utilization}% Utilization
                          {facility.capacity_utilization > 95 && ' ⚠️'}
                        </span>
                      )}
                      {facility.gross_ratio && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
                          👥 {facility.gross_ratio}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="px-6 pb-6 space-y-2">
                  <button
                    onClick={() => {
                      setSelectedFacilityId(facility.id);
                      setCurrentView('overview');
                    }}
                    className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-medium py-2.5 px-4 rounded-lg transition-colors text-sm"
                  >
                    View Facility Details →
                  </button>
                  {canManageFacilities && (
                    <button
                      onClick={() => setFacilityToArchive({ id: facility.id, name: facility.name })}
                      disabled={archivingFacilityId === facility.id}
                      className="w-full bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-700 font-medium py-2.5 px-4 rounded-lg transition-colors text-sm border border-slate-200 hover:border-rose-300 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {archivingFacilityId === facility.id ? 'Archiving…' : '📦 Archive Facility'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ---- SINGLE FACILITY VIEWS ----
  if (!compliance) {
    return (
      <div className="p-12 min-h-screen bg-slate-50 text-slate-500 italic flex items-center justify-center">
        ⚠️ Failed to load compliance data for this facility.
      </div>
    );
  }

  return (
    <div className="p-8 md:p-12 min-h-screen bg-slate-50 animate-in fade-in duration-700 space-y-8">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-blue-500 font-black text-xs uppercase tracking-widest mb-2">
            DHS Regulatory Engine
          </p>
          <h1 className="text-5xl font-bold tracking-tight text-slate-900">
            {currentView === 'overview' && 'Executive Overview'}
            {currentView === 'personnel' && 'Personnel Vault'}
            {currentView === 'documents' && 'Document Center'}
            {currentView === 'blueprints' && 'Operational Blueprints'}
            {currentView === 'settings' && 'Facility Settings'}
          </h1>
        </div>

        <button
          onClick={async () => {
            if (!selectedFacilityId || selectedFacilityId === 'all') return;
            setGeneratingReport(true);
            try {
              await generateAuditReport(selectedFacilityId);
            } catch (err) {
              console.error('PDF generation failed:', err);
              alert('❌ Failed to generate audit report. Please try again.');
            } finally {
              setGeneratingReport(false);
            }
          }}
          disabled={generatingReport}
          className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm border-2 transition-all shrink-0 ${
            generatingReport
              ? 'border-slate-300 bg-slate-100 text-slate-400 cursor-not-allowed'
              : 'border-indigo-300 bg-white text-indigo-700 hover:bg-indigo-50 hover:border-indigo-400 shadow-sm'
          }`}
        >
          {generatingReport ? (
            <>
              <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              Generating PDF…
            </>
          ) : (
            <>
              📄 Generate Audit Report
            </>
          )}
        </button>
      </header>

      {currentView === 'overview' && (
        <>
          {/* Enrollment widget */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm max-w-6xl mx-auto">
            <label htmlFor="enrollment-input" className="block text-sm font-bold text-slate-800 mb-2">
              Baseline Active Enrollment
            </label>
            <p className="text-xs text-slate-500 mb-3">
              Set your baseline enrolled headcount. The system uses this to calculate required minimum
              staff and inform the personnel score.
            </p>
            <div className="flex items-center gap-3">
              <input
                id="enrollment-input"
                type="number"
                min="0"
                max={compliance.capacity ?? undefined}
                value={enrollmentInput}
                onChange={(e) => setEnrollmentInput(e.target.value)}
                placeholder="e.g. 45"
                className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-32"
                disabled={updatingEnrollment}
              />
              <button
                onClick={handleUpdateEnrollment}
                disabled={updatingEnrollment || !enrollmentInput}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  updatingEnrollment || !enrollmentInput
                    ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {updatingEnrollment ? 'Updating…' : 'Update'}
              </button>
              <p className="text-[10px] text-slate-400 font-mono">
                Capacity: {compliance.capacity ?? 'N/A'}
                {compliance.enrollmentUpdatedAt &&
                  ` • Updated ${new Date(compliance.enrollmentUpdatedAt).toLocaleDateString()}`}
              </p>
            </div>

            {/* Operational Metric Badges */}
            {(() => {
              const capUtil =
                compliance.capacity != null &&
                compliance.capacity > 0 &&
                compliance.activeEnrollment != null
                  ? Math.round(
                      (compliance.activeEnrollment / compliance.capacity) * 100
                    )
                  : null;
              const ratio =
                compliance.activeEnrollment != null && compliance.totalPersonnel > 0
                  ? `1 : ${(compliance.activeEnrollment / compliance.totalPersonnel).toFixed(1)}`
                  : null;

              if (capUtil == null && ratio == null) return null;

              return (
                <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-slate-100">
                  {capUtil != null && (
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${
                        capUtil > 95 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      📊 Utilization: {capUtil}%{capUtil > 95 ? ' ⚠️' : ''}
                    </span>
                  )}
                  {ratio && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
                      👥 Gross Ratio: {ratio}
                    </span>
                  )}
                </div>
              );
            })()}
          </div>

          <ComplianceDashboardClient
            key={selectedFacilityId}
            facilityId={selectedFacilityId}
            facilityReadinessScore={compliance.facilityReadinessScore}
            personnelReadinessScore={compliance.personnelReadinessScore}
            gaps={compliance.gaps}
          />
        </>
      )}

      {currentView === 'personnel' && <PersonnelVaultView facilityId={selectedFacilityId} />}
      {currentView === 'documents' && <DocumentCenterView facilityId={selectedFacilityId} />}
      {currentView === 'blueprints' && <OperationalBlueprintsView facilityId={selectedFacilityId} />}
      {currentView === 'settings' && <FacilitySettingsView facilityId={selectedFacilityId} />}
    </div>
  );
}
