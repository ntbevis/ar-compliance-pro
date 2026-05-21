'use client';

import { useEffect, useState } from 'react';
import { getFacilitySettings, updateFacilitySettings } from 'src/app/actions/compliance';
import {
  FACILITY_TOGGLE_LABELS,
  TOGGLES_BY_FACILITY_TYPE,
  type FacilityScopeToggles,
  type FacilityToggleKey,
  type FacilityType,
} from '@/lib/types';

interface Props {
  facilityId: string;
}

interface FacilityRow extends FacilityScopeToggles {
  id: string;
  name: string;
  facility_type: FacilityType;
}

export default function FacilitySettingsView({ facilityId }: Props) {
  const [facility, setFacility] = useState<FacilityRow | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [toggles, setToggles] = useState<FacilityScopeToggles | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const result = await getFacilitySettings(facilityId);
        if (result.success && result.facility) {
          const fac = result.facility as unknown as FacilityRow;
          setFacility(fac);
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
            private_water: fac.private_water,
            memory_care: fac.memory_care,
          });
        } else {
          setFacility(null);
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

  const handleSave = async () => {
    if (!toggles) return;
    setSaving(true);
    try {
      const result = await updateFacilitySettings(facilityId, toggles);
      if (result.success) {
        alert('✅ Settings saved. Compliance scope will refresh on the next dashboard load.');
      } else {
        alert(`❌ Save failed: ${result.error}`);
      }
    } finally {
      setSaving(false);
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
    <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm max-w-3xl mx-auto text-slate-800 space-y-6">
      <header>
        <h2 className="text-2xl font-bold">⚙️ Facility Settings</h2>
        <p className="text-sm text-slate-600 mt-1">
          Scope flags for <span className="font-semibold">{facility.name}</span>. Toggling a flag
          activates the regulatory rules tagged to it.
        </p>
        <p className="text-xs text-slate-400 mt-1 font-mono">
          {facility.facility_type === 'childcare_center' ? 'Childcare Center' : 'Nursing Home'}
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

      <div className="pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className={`px-6 py-2.5 rounded-lg font-bold text-sm transition-all ${
            saving
              ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
          }`}
        >
          {saving ? 'Saving…' : 'Save Scope Flags'}
        </button>
      </div>
    </div>
  );
}
