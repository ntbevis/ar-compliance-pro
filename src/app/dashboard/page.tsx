'use client';

import Link from 'next/link';
import { useFacility } from 'src/context/FacilityContext';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
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
import TeamSettingsView from 'src/components/TeamSettingsView';
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
  const { selectedFacilityId, setSelectedFacilityId, currentView, setCurrentView, refreshFacilities } = useFacility();
  const [userRole, setUserRole] = useState<string | null>(null);

  const [facilitiesData, setFacilitiesData] = useState<FacilitySummary[]>([]);
  const [compliance, setCompliance] = useState<ComplianceData | null>(null);
  const [enrollmentInput, setEnrollmentInput] = useState<string>('');
  const [updatingEnrollment, setUpdatingEnrollment] = useState<boolean>(false);

  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [auditPage, setAuditPage] = useState<number>(1);
  const AUDIT_PAGE_SIZE = 50;
  const [loading, setLoading] = useState<boolean>(true);

  const [generatingReport, setGeneratingReport] = useState<boolean>(false);

  // Facility management state
  const [showAddFacilityModal, setShowAddFacilityModal] = useState<boolean>(false);
  const [addingFacility, setAddingFacility] = useState<boolean>(false);
  const [archivingFacilityId, setArchivingFacilityId] = useState<string | null>(null);
  const [facilityToArchive, setFacilityToArchive] = useState<{id: string; name: string} | null>(null);
  const [newFacilityForm, setNewFacilityForm] = useState<{
    name: string;
    facility_type: FacilityType | null;
    license_number: string;
    capacity: string;
    toggles: Partial<FacilityScopeToggles>;
  }>({
    name: '',
    facility_type: null,
    license_number: '',
    capacity: '',
    toggles: {},
  });
  const [facilityFormErrors, setFacilityFormErrors] = useState<Record<string, string>>({});

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
          if (!cancelled) {
            setAuditLogs(logs as AuditLogRow[]);
            setAuditPage(1);
          }
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
      toast.error('Please enter a valid enrollment number.');
      return;
    }
    setUpdatingEnrollment(true);
    try {
      const result = await updateEnrollment(selectedFacilityId, enrollment);
      if (result.success) {
        const refreshed = (await getFacilityComplianceData(selectedFacilityId)) as ComplianceData;
        setCompliance(refreshed);
        toast.success('Enrollment updated.');
      } else {
        toast.error(result.error ?? 'Failed to update enrollment.');
      }
    } finally {
      setUpdatingEnrollment(false);
    }
  };

  const handleAddFacility = async (e: React.FormEvent) => {
    e.preventDefault();

    // Client-side validation — all fields required for accurate compliance calculation
    const errors: Record<string, string> = {};
    if (!newFacilityForm.name.trim()) errors.name = 'Facility name is required.';
    if (!newFacilityForm.facility_type) errors.facility_type = 'You must select a regulatory domain.';
    if (!newFacilityForm.license_number.trim()) errors.license_number = 'License / Provider ID is required.';
    const capacity = parseInt(newFacilityForm.capacity, 10);
    if (!newFacilityForm.capacity || Number.isNaN(capacity) || capacity < 1) {
      errors.capacity = 'A valid licensed capacity (≥ 1) is required.';
    }
    if (Object.keys(errors).length > 0) {
      setFacilityFormErrors(errors);
      return;
    }
    setFacilityFormErrors({});
    setAddingFacility(true);
    try {
      const result = await addFacility({
        name: newFacilityForm.name.trim(),
        facility_type: newFacilityForm.facility_type!,
        license_number: newFacilityForm.license_number.trim().toUpperCase(),
        capacity,
        toggles: newFacilityForm.toggles,
      });
      if (result.success) {
        setShowAddFacilityModal(false);
        setNewFacilityForm({
          name: '',
          facility_type: null,
          license_number: '',
          capacity: '',
          toggles: {},
        });
        setFacilityFormErrors({});
        // Refresh both the sidebar dropdown and the fleet cards
        await refreshFacilities();
        const facilities = (await getAllFacilitiesOverview()) as FacilitySummary[];
        setFacilitiesData(facilities);
        toast.success('Facility added successfully.');
      } else {
        toast.error(result.error ?? 'Failed to add facility.');
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
        await refreshFacilities();
        const facilities = (await getAllFacilitiesOverview()) as FacilitySummary[];
        setFacilitiesData(facilities);
        toast.success('Facility archived.');
      } else {
        toast.error(result.error ?? 'Failed to archive facility.');
      }
    } finally {
      setArchivingFacilityId(null);
      setFacilityToArchive(null);
    }
  };

  if (loading) {
    return (
      <div className="p-8 md:p-12 min-h-screen bg-slate-50 flex items-center justify-center animate-pulse">
        <p className="text-blue-500 font-black tracking-[0.3em] uppercase text-xs">
          Synchronizing compliance engine…
        </p>
      </div>
    );
  }

  // ---- AUDIT LOGS VIEW (available from any selection) ----
  if (currentView === 'audit_logs') {
    return (
      <div className="p-4 md:p-8 lg:p-12 min-h-screen bg-slate-50 animate-in fade-in duration-700">
        <header className="mb-6 flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-blue-500 font-black text-xs uppercase tracking-widest mb-2">
              Regulatory Compliance Engine
            </p>
            <h1 className="text-2xl md:text-4xl font-bold tracking-tight text-slate-900 mb-2">
              Audit Trail &amp; Compliance Logs
            </h1>
            <p className="text-slate-600 text-sm">
              Immutable log of every compliance action across the organization.
            </p>
          </div>

          {selectedFacilityId && selectedFacilityId !== 'all' && (
            <button
              onClick={async () => {
                setGeneratingReport(true);
                try {
                  await generateAuditReport(selectedFacilityId);
                } catch (err) {
                  console.error('PDF generation failed:', err);
                  toast.error('Failed to generate audit report. Please try again.');
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
                <>📄 Generate Audit Report</>
              )}
            </button>
          )}
        </header>

        <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm max-w-6xl mx-auto text-slate-800">
          {auditLogs.length === 0 ? (
            <div className="border border-dashed border-slate-200 rounded-xl p-12 text-center italic text-slate-400 text-xs bg-slate-50">
              No audit logs found for the selected scope.
            </div>
          ) : (() => {
            const totalPages = Math.ceil(auditLogs.length / AUDIT_PAGE_SIZE);
            const paginated = auditLogs.slice((auditPage - 1) * AUDIT_PAGE_SIZE, auditPage * AUDIT_PAGE_SIZE);
            return (
              <>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs text-slate-500">
                    Showing <span className="font-bold text-slate-700">{(auditPage - 1) * AUDIT_PAGE_SIZE + 1}–{Math.min(auditPage * AUDIT_PAGE_SIZE, auditLogs.length)}</span> of <span className="font-bold text-slate-700">{auditLogs.length}</span> entries
                  </p>
                  {totalPages > 1 && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                        disabled={auditPage === 1}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        ← Prev
                      </button>
                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter((p) => p === 1 || p === totalPages || Math.abs(p - auditPage) <= 1)
                        .reduce<(number | 'ellipsis')[]>((acc, p, idx, arr) => {
                          if (idx > 0 && (arr[idx - 1] as number) < p - 1) acc.push('ellipsis');
                          acc.push(p);
                          return acc;
                        }, [])
                        .map((item, i) =>
                          item === 'ellipsis' ? (
                            <span key={`e-${i}`} className="text-xs text-slate-400 px-1">…</span>
                          ) : (
                            <button
                              key={item}
                              onClick={() => setAuditPage(item as number)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                auditPage === item
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }`}
                            >
                              {item}
                            </button>
                          )
                        )}
                      <button
                        onClick={() => setAuditPage((p) => Math.min(totalPages, p + 1))}
                        disabled={auditPage === totalPages}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        Next →
                      </button>
                    </div>
                  )}
                </div>

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
                      {paginated.map((log) => (
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
              </>
            );
          })()}
        </div>
      </div>
    );
  }

  // ---- TEAM SETTINGS (org-level, master view) ----
  if ((selectedFacilityId === 'all' || !selectedFacilityId) && currentView === 'settings') {
    return (
      <div className="p-4 md:p-8 lg:p-12 min-h-screen bg-slate-50 animate-in fade-in duration-700 space-y-8">
        <header className="mb-2">
          <p className="text-blue-500 font-black text-xs uppercase tracking-widest mb-2">
            Regulatory Compliance Engine
          </p>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-slate-900">
            Team Settings
          </h1>
        </header>
        <TeamSettingsView />
      </div>
    );
  }

  // ---- MASTER FLEET OVERVIEW (no facility selected) ----
  if (selectedFacilityId === 'all' || !selectedFacilityId) {
    const canManageFacilities = userRole === 'owner' || userRole === 'admin';

    return (
      <div className="p-4 md:p-8 lg:p-12 min-h-screen bg-slate-50 animate-in fade-in duration-700">
        <header className="mb-8">
          <p className="text-blue-500 font-black text-xs uppercase tracking-widest mb-2">
            Regulatory Compliance Engine
          </p>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-2">
            <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-slate-900">
              Executive Fleet Overview
            </h1>
            {canManageFacilities && (
              <button
                onClick={() => setShowAddFacilityModal(true)}
                className="flex items-center gap-2 px-5 py-3 rounded-lg text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 shadow-sm transition-all shrink-0 min-h-[44px]"
              >
                ➕ Add New Facility
              </button>
            )}
          </div>
          <p className="text-slate-600 text-base md:text-lg">
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
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto">
              <div className="sticky top-0 bg-gradient-to-r from-slate-800 to-slate-700 px-6 py-4 flex items-center justify-between rounded-t-2xl">
                <div>
                  <h2 className="text-xl font-bold text-white">Add New Facility</h2>
                  <p className="text-slate-400 text-xs mt-0.5">All fields are required for accurate compliance calculations.</p>
                </div>
                <button
                  onClick={() => { setShowAddFacilityModal(false); setFacilityFormErrors({}); }}
                  className="text-white/70 hover:text-white text-2xl leading-none"
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleAddFacility} noValidate className="p-6 space-y-6">
                {/* ── Step 1: Regulatory Domain (required — drives the entire rule set) ── */}
                <div>
                  <label className="block text-xs font-black text-slate-600 uppercase tracking-wider mb-2">
                    Regulatory Domain <span className="text-red-500">*</span>
                  </label>
                  <p className="text-xs text-slate-500 mb-3">
                    This determines which Arkansas regulatory rule set applies. Select carefully — it cannot be changed after creation.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {([
                      { value: 'childcare_center' as FacilityType, label: 'Childcare Center', sub: 'DCCECE Framework', emoji: '🧸' },
                      { value: 'nursing_home' as FacilityType, label: 'Nursing Home', sub: 'OLTC Framework', emoji: '🏥' },
                    ] as const).map(({ value, label, sub, emoji }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => {
                          setNewFacilityForm({ ...newFacilityForm, facility_type: value, toggles: {} });
                          setFacilityFormErrors((prev) => ({ ...prev, facility_type: '' }));
                        }}
                        className={`flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all ${
                          newFacilityForm.facility_type === value
                            ? 'border-blue-500 bg-blue-50 shadow-sm'
                            : 'border-slate-200 bg-white hover:border-slate-400'
                        }`}
                      >
                        <span className="text-2xl">{emoji}</span>
                        <div>
                          <p className={`font-bold text-sm ${newFacilityForm.facility_type === value ? 'text-blue-700' : 'text-slate-800'}`}>
                            {label}
                          </p>
                          <p className="text-[10px] text-slate-400 font-mono uppercase tracking-wide">{sub}</p>
                        </div>
                        {newFacilityForm.facility_type === value && (
                          <span className="ml-auto text-blue-500 text-lg">✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                  {facilityFormErrors.facility_type && (
                    <p className="text-xs text-red-600 mt-2 font-medium">⚠ {facilityFormErrors.facility_type}</p>
                  )}
                </div>

                {/* ── Step 2: Core Identifiers ── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-black text-slate-600 uppercase tracking-wider mb-1.5">
                      Facility Operating Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={newFacilityForm.name}
                      onChange={(e) => {
                        setNewFacilityForm({ ...newFacilityForm, name: e.target.value });
                        if (facilityFormErrors.name) setFacilityFormErrors((p) => ({ ...p, name: '' }));
                      }}
                      className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 bg-white placeholder:text-slate-400 ${
                        facilityFormErrors.name ? 'border-red-400 bg-red-50' : 'border-slate-300'
                      }`}
                      placeholder="e.g., Little Rock Early Learning Center"
                    />
                    {facilityFormErrors.name && (
                      <p className="text-xs text-red-600 mt-1 font-medium">⚠ {facilityFormErrors.name}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-black text-slate-600 uppercase tracking-wider mb-1.5">
                      License / Provider ID <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={newFacilityForm.license_number}
                      onChange={(e) => {
                        setNewFacilityForm({ ...newFacilityForm, license_number: e.target.value });
                        if (facilityFormErrors.license_number) setFacilityFormErrors((p) => ({ ...p, license_number: '' }));
                      }}
                      className={`w-full px-3 py-2.5 border rounded-lg text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 bg-white placeholder:text-slate-400 ${
                        facilityFormErrors.license_number ? 'border-red-400 bg-red-50' : 'border-slate-300'
                      }`}
                      placeholder="e.g., FAC-44109-AR"
                    />
                    {facilityFormErrors.license_number && (
                      <p className="text-xs text-red-600 mt-1 font-medium">⚠ {facilityFormErrors.license_number}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-black text-slate-600 uppercase tracking-wider mb-1.5">
                      {newFacilityForm.facility_type === 'nursing_home' ? 'Licensed Bed Capacity' : 'Max Licensed Capacity'}{' '}
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={newFacilityForm.capacity}
                      onChange={(e) => {
                        setNewFacilityForm({ ...newFacilityForm, capacity: e.target.value });
                        if (facilityFormErrors.capacity) setFacilityFormErrors((p) => ({ ...p, capacity: '' }));
                      }}
                      className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 bg-white placeholder:text-slate-400 ${
                        facilityFormErrors.capacity ? 'border-red-400 bg-red-50' : 'border-slate-300'
                      }`}
                      placeholder={newFacilityForm.facility_type === 'nursing_home' ? 'e.g., 120' : 'e.g., 75'}
                    />
                    {facilityFormErrors.capacity && (
                      <p className="text-xs text-red-600 mt-1 font-medium">⚠ {facilityFormErrors.capacity}</p>
                    )}
                  </div>
                </div>

                {/* ── Step 3: Scope Flags (optional but refine compliance rules) ── */}
                {newFacilityForm.facility_type && (
                  <div className="animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <label className="block text-xs font-black text-slate-600 uppercase tracking-wider mb-1.5">
                      Scope Flags
                      <span className="ml-2 text-[10px] font-normal text-slate-400 normal-case tracking-normal">
                        Optional — activates additional rule sets for this facility
                      </span>
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {TOGGLES_BY_FACILITY_TYPE[newFacilityForm.facility_type].map((toggleKey) => (
                        <label
                          key={toggleKey}
                          className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-all text-sm ${
                            newFacilityForm.toggles[toggleKey]
                              ? 'bg-blue-50 border-blue-400 text-slate-900'
                              : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                          }`}
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
                            className="accent-blue-500 w-4 h-4 shrink-0"
                          />
                          <span className="font-medium">{FACILITY_TOGGLE_LABELS[toggleKey]}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3 pt-4 border-t border-slate-200">
                  <button
                    type="submit"
                    disabled={addingFacility}
                    className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed shadow-sm transition-all"
                  >
                    {addingFacility ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Creating…
                      </span>
                    ) : (
                      'Create Facility'
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowAddFacilityModal(false); setFacilityFormErrors({}); }}
                    disabled={addingFacility}
                    className="px-6 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-200 disabled:cursor-not-allowed transition-all"
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
              <Link href="/onboarding" className="mt-4 inline-block bg-blue-600 text-white font-bold px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors">Complete Facility Onboarding →</Link>
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
      <div className="p-8 min-h-screen bg-slate-50 text-slate-500 italic flex items-center justify-center">
        ⚠️ Failed to load compliance data for this facility.
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 lg:p-12 min-h-screen bg-slate-50 animate-in fade-in duration-700 space-y-8">
      <header className="mb-2">
        <p className="text-blue-500 font-black text-xs uppercase tracking-widest mb-2">
          Regulatory Compliance Engine
        </p>
        <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-slate-900">
          {currentView === 'overview' && 'Executive Overview'}
          {currentView === 'personnel' && 'Personnel Vault'}
          {currentView === 'documents' && 'Document Center'}
          {currentView === 'blueprints' && 'Operational Blueprints'}
          {currentView === 'settings' && 'Facility Settings'}
        </h1>
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
            <div className="flex flex-wrap items-center gap-3">
              <input
                id="enrollment-input"
                type="number"
                min="0"
                max={compliance.capacity ?? undefined}
                value={enrollmentInput}
                onChange={(e) => setEnrollmentInput(e.target.value)}
                placeholder="e.g. 45"
                className="px-4 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-32 min-h-[44px]"
                disabled={updatingEnrollment}
              />
              <button
                onClick={handleUpdateEnrollment}
                disabled={updatingEnrollment || !enrollmentInput}
                className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all min-h-[44px] ${
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
