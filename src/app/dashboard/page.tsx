'use client';

import { useFacility } from 'src/context/FacilityContext';
import { useEffect, useState } from 'react';
import {
  getAllFacilitiesOverview,
  getAuditLogs,
  getCurrentUserRole,
  getFacilityComplianceData,
  updateEnrollment,
} from 'src/app/actions/compliance';
import ComplianceDashboardClient from 'src/components/ComplianceDashboardClient';
import PersonnelVaultView from 'src/components/PersonnelVaultView';
import DocumentCenterView from 'src/components/DocumentCenterView';
import OperationalBlueprintsView from 'src/components/OperationalBlueprintsView';
import FacilitySettingsView from 'src/components/FacilitySettingsView';
import type { IdentifiedGap } from '@/lib/types';

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
    return (
      <div className="p-8 md:p-12 min-h-screen bg-slate-50 animate-in fade-in duration-700">
        <header className="mb-8">
          <p className="text-blue-500 font-black text-xs uppercase tracking-widest mb-2">
            DHS Regulatory Engine
          </p>
          <h1 className="text-5xl font-bold tracking-tight text-slate-900 mb-2">
            Executive Fleet Overview
          </h1>
          <p className="text-slate-600 text-lg">
            Twin-score compliance monitoring across all facilities.
          </p>
        </header>

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
                </div>

                <div className="px-6 pb-6">
                  <button
                    onClick={() => {
                      setSelectedFacilityId(facility.id);
                      setCurrentView('overview');
                    }}
                    className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-medium py-2.5 px-4 rounded-lg transition-colors text-sm"
                  >
                    View Facility Details →
                  </button>
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
      <header>
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
