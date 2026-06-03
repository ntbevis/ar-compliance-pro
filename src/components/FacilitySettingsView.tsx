'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  getFacilitySettings,
  updateFacilitySettings,
  updateFacilityProfile,
  getMySelfRoles,
  updateMySelfRoles,
} from 'src/app/actions/compliance';
import {
  FACILITY_TOGGLE_LABELS,
  TOGGLES_BY_FACILITY_TYPE,
  LICENSE_TYPE_LABELS,
  REGULATORY_BODY_BY_LICENSE_TYPE,
  REGULATORY_BODY_LABELS,
  type FacilityScopeToggles,
  type FacilityToggleKey,
  type FacilityType,
  type LicenseType,
} from '@/lib/types';

interface Props {
  facilityId: string;
}

interface FacilityRow extends FacilityScopeToggles {
  id: string;
  name: string;
  facility_type: FacilityType;
  license_type?: LicenseType | null;
  license_number?: string;
  capacity?: number;
}

export default function FacilitySettingsView({ facilityId }: Props) {
  const [facility, setFacility] = useState<FacilityRow | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [savingToggles, setSavingToggles] = useState<boolean>(false);
  const [savingProfile, setSavingProfile] = useState<boolean>(false);
  const [toggles, setToggles] = useState<FacilityScopeToggles | null>(null);

  // Editable profile fields
  const [editName, setEditName] = useState('');
  const [editLicense, setEditLicense] = useState('');
  const [editCapacity, setEditCapacity] = useState<number | ''>('');

  // Self-compliance (the current user's own regulatory titles at this facility)
  const [myRoles, setMyRoles] = useState<string[]>([]);
  const [availableRoles, setAvailableRoles] = useState<string[]>([]);
  const [savingRoles, setSavingRoles] = useState<boolean>(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const result = await getFacilitySettings(facilityId);
        if (result.success && result.facility) {
          const fac = result.facility as unknown as FacilityRow;
          setFacility(fac);
          setEditName(fac.name ?? '');
          setEditLicense((fac as unknown as Record<string, string>).license_number ?? '');
          setEditCapacity((fac as unknown as Record<string, number>).capacity ?? '');
          setToggles({
            infant_toddler: fac.infant_toddler,
            transportation: fac.transportation,
            food_service: fac.food_service,
            water_activities: fac.water_activities,
            pets: fac.pets,
            special_needs: fac.special_needs,
            sick_care: fac.sick_care,
            school_age: fac.school_age,
            night_care: fac.night_care,
            clinical: fac.clinical,
            private_water: fac.private_water,
            memory_care: fac.memory_care,
            rehabilitation: fac.rehabilitation,
          });
        } else {
          setFacility(null);
        }

        const roleResult = await getMySelfRoles(facilityId);
        if (roleResult.success) {
          setMyRoles(roleResult.currentRoles);
          setAvailableRoles(roleResult.availableRoles);
        }
      } catch (err) {
        console.error('Failed to load facility settings:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [facilityId]);

  const onToggle = (key: FacilityToggleKey) => {
    setToggles((prev) => (prev ? { ...prev, [key]: !prev[key] } : prev));
  };

  const toggleMyRole = (roleName: string) => {
    setMyRoles((prev) =>
      prev.includes(roleName) ? prev.filter((r) => r !== roleName) : [...prev, roleName]
    );
  };

  const handleSaveRoles = async () => {
    setSavingRoles(true);
    try {
      const result = await updateMySelfRoles(facilityId, myRoles);
      if (result.success) {
        toast.success('Your titles were saved. Personal requirements refresh on next dashboard load.');
      } else {
        toast.error(result.error ?? 'Failed to save your titles.');
      }
    } finally {
      setSavingRoles(false);
    }
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const result = await updateFacilityProfile(facilityId, {
        name: editName,
        license_number: editLicense,
        capacity: editCapacity === '' ? undefined : Number(editCapacity),
      });
      if (result.success) {
        toast.success('Facility profile updated.');
        setFacility((prev) => prev
          ? { ...prev, name: editName }
          : prev
        );
      } else {
        toast.error(result.error ?? 'Failed to save profile.');
      }
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveToggles = async () => {
    if (!toggles) return;
    setSavingToggles(true);
    try {
      const result = await updateFacilitySettings(facilityId, toggles);
      if (result.success) {
        toast.success('Scope flags saved. Compliance scope will refresh on the next dashboard load.');
      } else {
        toast.error(result.error ?? 'Failed to save scope flags.');
      }
    } finally {
      setSavingToggles(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm max-w-3xl mx-auto text-slate-800">
        <p className="text-slate-500 italic">Loading facility profile…</p>
      </div>
    );
  }

  if (!facility || !toggles) {
    return (
      <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm max-w-3xl mx-auto text-slate-800">
        <p className="text-rose-600 italic">Failed to load facility settings.</p>
      </div>
    );
  }

  const visibleToggles = TOGGLES_BY_FACILITY_TYPE[facility.facility_type] ?? [];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* ── Core Profile ─────────────────────────────────────────────────── */}
      <section className="bg-white p-5 md:p-8 rounded-xl border border-slate-200 shadow-sm text-slate-800 space-y-5">
        <header>
          <h2 className="text-xl font-bold">🏢 Facility Profile</h2>
          <p className="text-sm text-slate-500 mt-1">
            Update the core details for this facility. Changes are audit-logged.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              Facility Name
            </label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
              placeholder="e.g. Little Rock Early Learning Center"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              License / Provider ID
            </label>
            <input
              type="text"
              value={editLicense}
              onChange={(e) => setEditLicense(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm font-mono uppercase focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
              placeholder="e.g. FAC-44109-AR"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              {facility.facility_type === 'childcare_center' ? 'Max Children' : 'Max Beds'}
            </label>
            <input
              type="number"
              min="1"
              value={editCapacity}
              onChange={(e) => setEditCapacity(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
              placeholder="e.g. 75"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
            License Type
          </label>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-sm font-semibold text-slate-700">
              {facility.license_type ? LICENSE_TYPE_LABELS[facility.license_type] : '—'}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-slate-400">
              Set at creation
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <span className="text-xs font-mono text-slate-400">
            {facility.license_type
              ? REGULATORY_BODY_LABELS[REGULATORY_BODY_BY_LICENSE_TYPE[facility.license_type]]
              : facility.facility_type === 'childcare_center'
                ? 'ADE Office of Early Childhood'
                : 'DHS Office of Long Term Care'}
          </span>
          <button
            onClick={handleSaveProfile}
            disabled={savingProfile}
            className={`px-5 py-2.5 rounded-lg font-bold text-sm transition-all min-h-[44px] ${
              savingProfile
                ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
            }`}
          >
            {savingProfile ? 'Saving…' : 'Save Profile'}
          </button>
        </div>
      </section>

      {/* ── Scope Flags ──────────────────────────────────────────────────── */}
      <section className="bg-white p-5 md:p-8 rounded-xl border border-slate-200 shadow-sm text-slate-800 space-y-5">
        <header>
          <h2 className="text-xl font-bold">⚙️ Compliance Scope Flags</h2>
          <p className="text-sm text-slate-500 mt-1">
            Toggle a flag to activate the regulatory rules tagged to it. Applies on next dashboard load.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {visibleToggles.map((key) => (
            <label
              key={key}
              className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                toggles[key]
                  ? 'bg-blue-50 border-blue-400 text-slate-900'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              <input
                type="checkbox"
                checked={toggles[key]}
                onChange={() => onToggle(key)}
                className="accent-blue-500 w-4 h-4"
              />
              <span className="font-medium text-sm">{FACILITY_TOGGLE_LABELS[key]}</span>
            </label>
          ))}
        </div>

        <div className="pt-1">
          <button
            onClick={handleSaveToggles}
            disabled={savingToggles}
            className={`px-6 py-2.5 rounded-lg font-bold text-sm transition-all ${
              savingToggles
                ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
            }`}
          >
            {savingToggles ? 'Saving…' : 'Save Scope Flags'}
          </button>
        </div>
      </section>

      {/* ── My Titles (self-compliance) ──────────────────────────────────── */}
      <section className="bg-white p-5 md:p-8 rounded-xl border border-slate-200 shadow-sm text-slate-800 space-y-5">
        <header>
          <h2 className="text-xl font-bold">🧑‍⚕️ My Titles at This Facility</h2>
          <p className="text-sm text-slate-500 mt-1">
            Select every position you personally hold here. We track the compliance documents
            <span className="font-semibold text-slate-700"> you </span> must maintain for each, and they
            appear under your name in the Personnel Vault for uploads.
          </p>
        </header>

        {availableRoles.length === 0 ? (
          <p className="text-sm text-slate-500 italic">
            No regulatory titles are defined for this facility&apos;s license type.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {availableRoles.map((roleName) => (
              <label
                key={roleName}
                className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                  myRoles.includes(roleName)
                    ? 'bg-blue-50 border-blue-400 text-slate-900'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={myRoles.includes(roleName)}
                  onChange={() => toggleMyRole(roleName)}
                  className="accent-blue-500 w-4 h-4"
                />
                <span className="font-medium text-sm">{roleName}</span>
              </label>
            ))}
          </div>
        )}

        {availableRoles.length > 0 && (
          <div className="pt-1">
            <button
              onClick={handleSaveRoles}
              disabled={savingRoles}
              className={`px-6 py-2.5 rounded-lg font-bold text-sm transition-all ${
                savingRoles
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
              }`}
            >
              {savingRoles ? 'Saving…' : 'Save My Titles'}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
