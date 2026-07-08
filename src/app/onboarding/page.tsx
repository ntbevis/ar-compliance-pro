'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  getFacilityRequirements,
  getOnboardingRoleOptions,
  getPersonalRequirementsPreview,
} from '@/app/actions/onboarding';
import {
  saveOnboardingData,
  isOnboardingComplete,
  type FacilityPayload,
  type SelfCompliancePayload,
} from '@/app/actions/onboarding-save';
import {
  FACILITY_TOGGLE_LABELS,
  TOGGLES_BY_FACILITY_TYPE,
  LICENSE_TYPES_BY_FACILITY_TYPE,
  LICENSE_TYPE_LABELS,
  LICENSE_TYPE_DESCRIPTIONS,
  type FacilityScopeToggles,
  type FacilityToggleKey,
  type FacilityType,
  type LicenseType,
} from '@/lib/types';

interface FacilityQueueItem {
  id: string;
  name: string;
  type: FacilityType;
  licenseType: LicenseType;
  licenseNumber: string;
  capacity: number;
  toggles: FacilityScopeToggles;
}

const EMPTY_TOGGLES: FacilityScopeToggles = {
  infant_toddler: false,
  transportation: false,
  food_service: false,
  water_activities: false,
  pets: false,
  special_needs: false,
  sick_care: false,
  school_age: false,
  night_care: false,
  clinical: false,
  private_water: false,
  memory_care: false,
  rehabilitation: false,
};

interface RequirementPreview {
  id: string;
  requirement_name: string;
  required_document_type: string;
  severity: 'critical' | 'standard';
  frequency: string;
  score_category: 'facility' | 'personnel' | null;
}

interface PersonalRequirementPreview {
  id: string;
  requirement_name: string;
  required_document_type: string;
  severity: 'critical' | 'standard';
  frequency: string;
  facility_type: FacilityType;
}

const SECTOR_META: Record<FacilityType, { icon: string; label: string; authority: string }> = {
  childcare_center: { icon: '🧸', label: 'Childcare', authority: 'ADE Office of Early Childhood' },
  nursing_home: { icon: '🏥', label: 'Long-Term Care', authority: 'DHS Office of Long Term Care' },
};

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [loading, setLoading] = useState(false);

  // Completion guard: if this org already has facilities, redirect straight to dashboard
  useEffect(() => {
    isOnboardingComplete().then((done) => {
      if (done) router.replace('/dashboard');
    }).catch(() => { /* stay on page if check fails */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- FORM STATES ---
  const [orgName, setOrgName] = useState('');
  const [facilities, setFacilities] = useState<FacilityQueueItem[]>([]);
  const [requirementsSummary, setRequirementsSummary] = useState<RequirementPreview[]>([]);
  const [personalSummary, setPersonalSummary] = useState<PersonalRequirementPreview[]>([]);

  // --- DYNAMIC FORM ENTRY BUFFER ---
  const [facName, setFacName] = useState('');
  const [facType, setFacType] = useState<FacilityType | null>(null);
  const [facLicenseType, setFacLicenseType] = useState<LicenseType | null>(null);
  const [facLicense, setFacLicense] = useState('');
  const [facCapacity, setFacCapacity] = useState<number | ''>('');
  const [facToggles, setFacToggles] = useState<FacilityScopeToggles>({ ...EMPTY_TOGGLES });

  // --- SELF-COMPLIANCE (the user's own titles) ---
  const [rolesByFacilityType, setRolesByFacilityType] = useState<Record<string, string[]>>({});
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [selfFacilityId, setSelfFacilityId] = useState<string | null>(null);

  const handleSectorSelect = (type: FacilityType) => {
    setFacType(type);
    setFacLicenseType(null);
    setFacToggles({ ...EMPTY_TOGGLES });
  };

  const toggleScopeFlag = (key: FacilityToggleKey) => {
    setFacToggles((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const addFacilityToQueue = () => {
    if (!facName || !facType || !facLicenseType || !facLicense || facCapacity === '' || facCapacity <= 0) return;

    const newLocation: FacilityQueueItem = {
      id: crypto.randomUUID(),
      name: facName,
      type: facType,
      licenseType: facLicenseType,
      licenseNumber: facLicense.trim().toUpperCase(),
      capacity: Number(facCapacity),
      toggles: { ...facToggles },
    };
    setFacilities((prev) => [...prev, newLocation]);

    // Reset entry buffer
    setFacName('');
    setFacType(null);
    setFacLicenseType(null);
    setFacLicense('');
    setFacCapacity('');
    setFacToggles({ ...EMPTY_TOGGLES });
  };

  const removeFacility = (id: string) => {
    setFacilities((prev) => prev.filter((f) => f.id !== id));
  };

  /**
   * Distinct sector + license combinations currently queued, each carrying the
   * union of active scope toggles across facilities that share the combination.
   * Threading toggles through lets the preview apply the exact same gate the
   * dashboard uses (sector + license + sub_classification).
   */
  const selectionsForQuery = () => {
    const byKey = new Map<
      string,
      { facilityType: FacilityType; licenseType: LicenseType; toggles: Set<string> }
    >();
    for (const f of facilities) {
      const key = `${f.type}:${f.licenseType}`;
      const entry =
        byKey.get(key) ?? { facilityType: f.type, licenseType: f.licenseType, toggles: new Set<string>() };
      for (const k of Object.keys(f.toggles) as FacilityToggleKey[]) {
        if (f.toggles[k]) entry.toggles.add(k);
      }
      byKey.set(key, entry);
    }
    return Array.from(byKey.values()).map((e) => ({
      facilityType: e.facilityType,
      licenseType: e.licenseType,
      toggles: Array.from(e.toggles),
    }));
  };

  // Step 2 → 3: load the regulatory titles the user can claim for themselves.
  const handleGoToTitles = async () => {
    setLoading(true);
    try {
      // Default the "where do you work" selector to the first facility.
      if (!selfFacilityId && facilities.length > 0) setSelfFacilityId(facilities[0].id);
      const res = await getOnboardingRoleOptions(selectionsForQuery());
      setRolesByFacilityType(res.success ? res.rolesByFacilityType : {});
    } catch (err) {
      console.error('Failed to load role options:', err);
      setRolesByFacilityType({});
    } finally {
      setLoading(false);
      setStep(3);
    }
  };

  const toggleRole = (roleName: string) => {
    setSelectedRoles((prev) =>
      prev.includes(roleName) ? prev.filter((r) => r !== roleName) : [...prev, roleName]
    );
  };

  // Step 3 → 4: compute the facility + personal requirement preview.
  const handleReviewStep = async () => {
    setLoading(true);
    try {
      const selections = selectionsForQuery();
      const allReqs: RequirementPreview[] = [];
      for (const sel of selections) {
        const reqs = (await getFacilityRequirements(
          sel.facilityType,
          sel.licenseType,
          sel.toggles
        )) as RequirementPreview[];
        allReqs.push(...reqs);
      }
      const seen = new Set<string>();
      const dedup = allReqs.filter((r) => {
        if (seen.has(r.requirement_name)) return false;
        seen.add(r.requirement_name);
        return true;
      });
      setRequirementsSummary(dedup);

      if (selectedRoles.length > 0) {
        const personal = await getPersonalRequirementsPreview(selectedRoles, selections);
        const seenP = new Set<string>();
        setPersonalSummary(
          personal.filter((r) => {
            if (seenP.has(r.requirement_name)) return false;
            seenP.add(r.requirement_name);
            return true;
          })
        );
      } else {
        setPersonalSummary([]);
      }
      setStep(4);
    } catch (err) {
      console.error('Failed to load preview requirements:', err);
      setRequirementsSummary([]);
      setPersonalSummary([]);
      setStep(4);
    } finally {
      setLoading(false);
    }
  };

  const handleFinalize = async () => {
    setLoading(true);
    const payload: FacilityPayload[] = facilities.map((f) => ({
      queueId: f.id,
      name: f.name,
      type: f.type,
      licenseType: f.licenseType,
      licenseNumber: f.licenseNumber,
      capacity: f.capacity,
      toggles: f.toggles,
    }));

    const selfCompliance: SelfCompliancePayload | undefined =
      selectedRoles.length > 0
        ? { roleNames: selectedRoles, facilityRef: selfFacilityId ?? (facilities[0]?.id ?? null) }
        : undefined;

    const result = await saveOnboardingData(orgName, payload, selfCompliance);
    if (result.success) {
      router.push('/dashboard');
    } else {
      toast.error(result.error || 'Onboarding failed. Please try again.');
      setLoading(false);
    }
  };

  const visibleToggles = facType ? TOGGLES_BY_FACILITY_TYPE[facType] : [];
  const availableLicenseTypes = facType ? LICENSE_TYPES_BY_FACILITY_TYPE[facType] : [];

  // Titles available across every sector the user is onboarding.
  const titleSections = Object.entries(rolesByFacilityType).filter(([, roles]) => roles.length > 0);

  return (
    <div className="min-h-screen bg-black text-white p-6 md:p-12 lg:p-24 selection:bg-blue-500">
      <div className="max-w-2xl mx-auto">
        {/* Step Progress Tracker */}
        <div className="flex gap-2 mb-16">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-all duration-700 ${step >= i ? 'bg-blue-600' : 'bg-gray-800'}`}
            />
          ))}
        </div>

        {/* STEP 1 */}
        {step === 1 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            <h1 className="text-3xl md:text-5xl font-bold mb-6 tracking-tight">Your Company.</h1>
            <p className="text-gray-400 mb-10 text-lg md:text-xl leading-relaxed">
              Establish your corporate management hub to coordinate your properties from a unified command center.
            </p>
            <input
              type="text"
              placeholder="e.g. Mid-South Care Management Group"
              className="w-full bg-gray-900/50 border border-gray-800 p-5 rounded-2xl text-xl focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none transition-all placeholder:text-gray-600 text-white"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && orgName && setStep(2)}
            />
            <button
              onClick={() => setStep(2)}
              disabled={!orgName}
              className="mt-10 w-full sm:w-auto bg-white text-black font-bold py-4 px-12 rounded-2xl hover:bg-blue-600 hover:text-white transition-all disabled:opacity-30 min-h-[56px]"
            >
              Continue
            </button>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-700">
            <h1 className="text-3xl md:text-5xl font-bold mb-2 tracking-tight">Add Locations.</h1>
            <p className="text-gray-400 mb-8 text-base">
              Bind each operations center to its exact license type and pick the scope flags that
              apply. The dashboard will then load the precise rule set you need.
            </p>

            <div className="bg-gray-900/40 border border-gray-800 p-6 rounded-3xl mb-8 backdrop-blur-sm space-y-4">
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">
                  Facility Operating Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Little Rock Early Learning Center"
                  className="w-full bg-black border border-gray-800 p-4 rounded-xl text-md focus:border-blue-500 outline-none transition-all text-white"
                  value={facName}
                  onChange={(e) => setFacName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">
                  Regulatory Authority Domain
                </label>
                <div className="grid grid-cols-2 gap-4">
                  {(Object.keys(SECTOR_META) as FacilityType[]).map((sector) => (
                    <button
                      key={sector}
                      onClick={() => handleSectorSelect(sector)}
                      className={`flex items-center gap-3 p-4 border rounded-xl transition-all ${
                        facType === sector
                          ? 'bg-blue-600/10 border-blue-500 text-white'
                          : 'bg-black border-gray-800 text-gray-400 hover:border-gray-700'
                      }`}
                    >
                      <span className="text-xl" aria-hidden>{SECTOR_META[sector].icon}</span>
                      <div className="text-left">
                        <p className="font-bold text-xs uppercase tracking-wide">{SECTOR_META[sector].label}</p>
                        <p className="text-[10px] opacity-60">{SECTOR_META[sector].authority}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {facType && (
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">
                    Exact License Type
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {availableLicenseTypes.map((lt) => (
                      <button
                        key={lt}
                        onClick={() => setFacLicenseType(lt)}
                        className={`text-left p-3 border rounded-xl transition-all ${
                          facLicenseType === lt
                            ? 'bg-blue-600/10 border-blue-500 text-white'
                            : 'bg-black border-gray-800 text-gray-400 hover:border-gray-700'
                        }`}
                      >
                        <p className="font-bold text-xs">{LICENSE_TYPE_LABELS[lt]}</p>
                        <p className="text-[10px] opacity-60 mt-0.5">{LICENSE_TYPE_DESCRIPTIONS[lt]}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {facType && facLicenseType && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">
                      Official License / Provider ID
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. FAC-44109-AR"
                      className="w-full bg-black border border-gray-800 p-3.5 rounded-xl text-sm uppercase focus:border-blue-500 outline-none text-white"
                      value={facLicense}
                      onChange={(e) => setFacLicense(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">
                      Maximum Occupant Capacity
                    </label>
                    <input
                      type="number"
                      min="1"
                      placeholder={facType === 'childcare_center' ? 'Max Children' : 'Max Beds'}
                      className="w-full bg-black border border-gray-800 p-3.5 rounded-xl text-sm focus:border-blue-500 outline-none text-white"
                      value={facCapacity}
                      onChange={(e) => setFacCapacity(e.target.value === '' ? '' : Number(e.target.value))}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">
                      Scope Flags (toggle anything that applies to this facility)
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {visibleToggles.map((key) => (
                        <label
                          key={key}
                          className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer text-xs transition-all ${
                            facToggles[key]
                              ? 'bg-blue-600/10 border-blue-500 text-white'
                              : 'bg-black border-gray-800 text-gray-400 hover:border-gray-700'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={facToggles[key]}
                            onChange={() => toggleScopeFlag(key)}
                            className="accent-blue-500"
                          />
                          <span className="font-medium">{FACILITY_TOGGLE_LABELS[key]}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={addFacilityToQueue}
                    disabled={!facName || !facLicense || facCapacity === '' || facCapacity <= 0}
                    className="md:col-span-2 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl text-xs uppercase tracking-widest mt-2 disabled:opacity-30 transition-all"
                  >
                    Commit Location to Onboarding Group
                  </button>
                </div>
              )}
            </div>

            {facilities.length > 0 && (
              <div className="space-y-3 mb-10">
                <p className="text-xs font-black text-gray-500 uppercase tracking-[0.2em] mb-2 px-1">
                  Registered Infrastructure Queue ({facilities.length})
                </p>
                {facilities.map((f) => {
                  const activeFlags = (Object.keys(f.toggles) as FacilityToggleKey[])
                    .filter((k) => f.toggles[k])
                    .map((k) => FACILITY_TOGGLE_LABELS[k]);
                  return (
                    <div
                      key={f.id}
                      className="flex justify-between items-start p-4 bg-gray-900/60 border border-gray-800 rounded-xl animate-in fade-in"
                    >
                      <div>
                        <p className="font-bold text-md text-white">{f.name}</p>
                        <p className="text-xs text-blue-400 mt-0.5">{LICENSE_TYPE_LABELS[f.licenseType]}</p>
                        <p className="text-xs text-gray-500 font-mono mt-0.5">
                          ID: {f.licenseNumber} • Cap: {f.capacity}
                        </p>
                        {activeFlags.length > 0 && (
                          <p className="text-[10px] text-blue-400 mt-1.5">
                            {activeFlags.join(' • ')}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => removeFacility(f.id)}
                        className="text-gray-600 hover:text-red-500 transition-colors p-2 text-sm"
                        aria-label="Remove facility"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex gap-4">
              <button onClick={() => setStep(1)} className="p-5 text-gray-500 font-bold text-sm">
                Back
              </button>
              <button
                onClick={handleGoToTitles}
                disabled={facilities.length === 0}
                className="flex-1 bg-white text-black font-bold py-4 rounded-2xl hover:bg-blue-600 hover:text-white transition-all disabled:opacity-20 text-md"
              >
                Continue to Your Titles
              </button>
            </div>
          </div>
        )}

        {/* STEP 3 — Your Titles (self-compliance) */}
        {step === 3 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-700">
            <h1 className="text-3xl md:text-5xl font-bold mb-2 tracking-tight">Your Titles.</h1>
            <p className="text-gray-400 mb-8 text-base leading-relaxed">
              Many operators wear more than one hat. Select every position <span className="text-white font-semibold">you personally hold</span>
              {' '}— we&apos;ll track the compliance documents <span className="text-white font-semibold">you</span> are required to upload for each.
            </p>

            {facilities.length > 1 && (
              <div className="mb-6">
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">
                  Which location do you work at?
                </label>
                <select
                  value={selfFacilityId ?? ''}
                  onChange={(e) => setSelfFacilityId(e.target.value)}
                  className="w-full bg-black border border-gray-800 p-3.5 rounded-xl text-sm focus:border-blue-500 outline-none text-white"
                >
                  {facilities.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} — {LICENSE_TYPE_LABELS[f.licenseType]}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {titleSections.length === 0 ? (
              <p className="text-gray-500 italic text-sm mb-8">
                No regulatory titles are defined for the selected license types. You can skip this step.
              </p>
            ) : (
              <div className="space-y-6 mb-8 max-h-[420px] overflow-y-auto pr-2 custom-scrollbar">
                {titleSections.map(([ft, roles]) => (
                  <div key={ft}>
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-2">
                      {SECTOR_META[ft as FacilityType]?.label ?? ft} Titles
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {roles.map((roleName) => (
                        <label
                          key={roleName}
                          className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer text-xs transition-all ${
                            selectedRoles.includes(roleName)
                              ? 'bg-blue-600/10 border-blue-500 text-white'
                              : 'bg-black border-gray-800 text-gray-400 hover:border-gray-700'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedRoles.includes(roleName)}
                            onChange={() => toggleRole(roleName)}
                            className="accent-blue-500"
                          />
                          <span className="font-medium">{roleName}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-4">
              <button onClick={() => setStep(2)} className="p-5 text-gray-500 font-bold text-sm">
                Back
              </button>
              <button
                onClick={handleReviewStep}
                className="flex-1 bg-white text-black font-bold py-4 rounded-2xl hover:bg-blue-600 hover:text-white transition-all text-md"
              >
                {selectedRoles.length > 0
                  ? `Review (${selectedRoles.length} title${selectedRoles.length > 1 ? 's' : ''})`
                  : 'Skip & Review'}
              </button>
            </div>
          </div>
        )}

        {/* STEP 4 — Audit preview */}
        {step === 4 && (
          <div className="animate-in fade-in zoom-in-95 duration-700">
            <h1 className="text-3xl md:text-5xl font-bold mb-4 tracking-tight">Audit Checklist.</h1>
            <p className="text-gray-400 mb-10 text-base md:text-lg leading-relaxed">
              We&apos;ve cross-referenced applicable rulesets and structured your compliance pipeline.
            </p>

            {personalSummary.length > 0 && (
              <div className="mb-8">
                <p className="text-[11px] font-black text-blue-400 uppercase tracking-[0.2em] mb-3">
                  Your Personal Requirements ({personalSummary.length})
                </p>
                <div className="space-y-3 max-h-[220px] overflow-y-auto pr-2 custom-scrollbar divide-y divide-gray-900">
                  {personalSummary.map((req) => (
                    <div key={req.id} className="pt-3 first:pt-0 flex justify-between items-center">
                      <h3 className="font-bold text-sm text-gray-200">{req.requirement_name}</h3>
                      <span
                        className={`text-[9px] font-black uppercase tracking-[0.15em] px-2 py-0.5 rounded ${
                          req.severity === 'critical' ? 'bg-red-500/10 text-red-500' : 'bg-blue-500/10 text-blue-500'
                        }`}
                      >
                        {req.severity}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-[11px] font-black text-gray-500 uppercase tracking-[0.2em] mb-3">
              Facility Requirements ({requirementsSummary.length})
            </p>
            <div className="space-y-4 max-h-[360px] overflow-y-auto pr-2 custom-scrollbar divide-y divide-gray-900">
              {requirementsSummary.length === 0 ? (
                <p className="text-gray-500 italic text-sm">No requirements found for the selected facility types.</p>
              ) : (
                requirementsSummary.map((req) => (
                  <div key={req.id} className="pt-4 first:pt-0 flex justify-between items-center group">
                    <div>
                      <h3 className="font-bold text-base text-gray-200">{req.requirement_name}</h3>
                      <div className="flex gap-4 mt-1.5">
                        <span
                          className={`text-[9px] font-black uppercase tracking-[0.15em] px-2 py-0.5 rounded ${
                            req.severity === 'critical' ? 'bg-red-500/10 text-red-500' : 'bg-blue-500/10 text-blue-500'
                          }`}
                        >
                          {req.severity}
                        </span>
                        <span className="text-[9px] text-gray-600 uppercase font-black tracking-[0.15em] py-0.5">
                          {req.score_category ?? 'informational'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <button
              onClick={handleFinalize}
              className="mt-12 w-full bg-blue-600 text-white font-bold py-5 rounded-2xl hover:bg-blue-500 shadow-2xl shadow-blue-900/20 transition-all active:scale-[0.98] text-md"
            >
              Finalize Infrastructure & Start Active Audits
            </button>
            <button
              onClick={() => setStep(2)}
              className="mt-4 w-full text-gray-500 font-bold py-2 text-sm"
            >
              Add More Facilities
            </button>
          </div>
        )}

        {loading && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center z-50">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-6"></div>
            <div className="text-blue-500 font-black tracking-[0.25em] uppercase text-[11px] animate-pulse text-center leading-loose">
              Mapping Regulatory Frameworks <br /> & Instantiating Corporate Hub...
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
