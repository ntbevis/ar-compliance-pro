'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getFacilityRequirements } from '@/app/actions/onboarding';
import { saveOnboardingData } from '@/app/actions/onboarding-save';

interface FacilityQueueItem {
  id: string;
  name: string;
  type: 'childcare' | 'nursing_home';
  licenseNumber: string;
  subClassification: string;
  capacity: number;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  
  // --- FORM STATES ---
  const [orgName, setOrgName] = useState('');
  const [facilities, setFacilities] = useState<FacilityQueueItem[]>([]);
  const [requirementsSummary, setRequirementsSummary] = useState<any[]>([]);

  // --- DYNAMIC LOCATION FORM ENTRY BUFFER ---
  const [facName, setFacName] = useState('');
  const [facType, setFacType] = useState<'childcare' | 'nursing_home' | null>(null);
  const [facLicense, setFacLicense] = useState('');
  const [facSubClass, setFacSubClass] = useState('');
  const [facCapacity, setFacCapacity] = useState<number | ''>('');

  // --- OFFICIAL STATE REGULATORY ENUMS (4-TIER SYSTEM) ---
  const CHILDCARE_CLASSIFICATIONS = [
    'Licensed Child Care Center (CCC)',
    'Licensed Family Child Care Home (FCCH)'
  ];

  const HEALTHCARE_CLASSIFICATIONS = [
    'Skilled Nursing Facility (SNF)',
    'Assisted Living Facility (Tier I/II)'
  ];

  const handleSectorSelect = (type: 'childcare' | 'nursing_home') => {
    setFacType(type);
    // Automatically set the first item in the upcoming classification dropdown as default
    setFacSubClass(type === 'childcare' ? CHILDCARE_CLASSIFICATIONS[0] : HEALTHCARE_CLASSIFICATIONS[0]);
  };

  const addFacilityToQueue = () => {
    if (!facName || !facType || !facLicense || !facSubClass || !facCapacity) return;

    const newLocation: FacilityQueueItem = {
      id: crypto.randomUUID(),
      name: facName,
      type: facType,
      licenseNumber: facLicense.trim().toUpperCase(),
      subClassification: facSubClass,
      capacity: Number(facCapacity)
    };

    setFacilities([...facilities, newLocation]);
    
    // Reset inputs cleanly for next record location entry
    setFacName('');
    setFacType(null);
    setFacLicense('');
    setFacSubClass('');
    setFacCapacity('');
  };

  const removeFacility = (id: string) => {
    setFacilities(facilities.filter(f => f.id !== id));
  };

  const handleReviewStep = async () => {
    setLoading(true);
    const uniqueTypes = Array.from(new Set(facilities.map(f => f.type)));
    
    let allReqs: any[] = [];
    for (const type of uniqueTypes) {
      const reqs = await getFacilityRequirements(type);
      allReqs = [...allReqs, ...reqs];
    }
    
    const seen = new Set();
    const filteredReqs = allReqs.filter(el => {
      const duplicate = seen.has(el.requirement_name);
      seen.add(el.requirement_name);
      return !duplicate;
    });

    setRequirementsSummary(filteredReqs);
    setLoading(false);
    setStep(3);
  };

  const handleFinalize = async () => {
    setLoading(true);
    const cleanFacilities = facilities.map(({ name, type, licenseNumber, subClassification, capacity }) => ({
      name, type, licenseNumber, subClassification, capacity
    }));
    
    const result = await saveOnboardingData(orgName, cleanFacilities);
    
    if (result.success) {
      router.push(`/dashboard?orgId=${result.orgId}`);
    } else {
      alert(result.error || "Onboarding pipeline exception.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white p-8 md:p-24 selection:bg-blue-500">
      <div className="max-w-2xl mx-auto">
        
        {/* Step Progress Tracker */}
        <div className="flex gap-2 mb-16">
          {[1, 2, 3].map((i) => (
            <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-700 ${step >= i ? 'bg-blue-600' : 'bg-gray-800'}`} />
          ))}
        </div>

        {/* STEP 1: CORPORATE ENTITY NAME */}
        {step === 1 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            <h1 className="text-5xl font-bold mb-6 tracking-tight">Your Company.</h1>
            <p className="text-gray-400 mb-10 text-xl leading-relaxed">Establish your corporate management hub to coordinate Arkansas properties from a unified command center.</p>
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
              className="mt-10 w-full md:w-auto bg-white text-black font-bold py-4 px-12 rounded-2xl hover:bg-blue-600 hover:text-white transition-all disabled:opacity-30"
            >
              Continue
            </button>
          </div>
        )}

        {/* STEP 2: METRIC-LOCKED MULTI-FACILITY COMPOSITION */}
        {step === 2 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-700">
            <h1 className="text-5xl font-bold mb-2 tracking-tight">Add Locations.</h1>
            <p className="text-gray-400 mb-8 text-base">Bind each operations center to strict state licensing classifications and occupant capacities to calibrate the regulatory logic matrix.</p>
            
            <div className="bg-gray-900/40 border border-gray-800 p-6 rounded-3xl mb-8 backdrop-blur-sm space-y-4">
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Facility Operating Name</label>
                <input 
                  type="text"
                  placeholder="e.g. Little Rock Early Learning Center"
                  className="w-full bg-black border border-gray-800 p-4 rounded-xl text-md focus:border-blue-500 outline-none transition-all text-white"
                  value={facName}
                  onChange={(e) => setFacName(e.target.value)}
                />
              </div>

              {/* Sector Selector Cards */}
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Regulatory Authority Domain</label>
                <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={() => handleSectorSelect('childcare')}
                    className={`flex items-center gap-3 p-4 border rounded-xl transition-all ${
                      facType === 'childcare' ? 'bg-blue-600/10 border-blue-500 text-white' : 'bg-black border-gray-800 text-gray-400 hover:border-gray-700'
                    }`}
                  >
                    <span className="text-xl">🧸</span>
                    <div className="text-left"><p className="font-bold text-xs uppercase tracking-wide">Childcare</p><p className="text-[10px] opacity-60">DCCECE Framework</p></div>
                  </button>
                  <button 
                    onClick={() => handleSectorSelect('nursing_home')}
                    className={`flex items-center gap-3 p-4 border rounded-xl transition-all ${
                      facType === 'nursing_home' ? 'bg-blue-600/10 border-blue-500 text-white' : 'bg-black border-gray-800 text-gray-400 hover:border-gray-700'
                    }`}
                  >
                    <span className="text-xl">🏥</span>
                    <div className="text-left"><p className="font-bold text-xs uppercase tracking-wide">Healthcare</p><p className="text-[10px] opacity-60">OLTC Framework</p></div>
                  </button>
                </div>
              </div>

              {/* Conditional Locked Form Fields */}
              {facType && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Official License / Provider ID</label>
                    <input 
                      type="text"
                      placeholder="e.g. FAC-44109-AR"
                      className="w-full bg-black border border-gray-800 p-3.5 rounded-xl text-sm uppercase focus:border-blue-500 outline-none text-white"
                      value={facLicense}
                      onChange={(e) => setFacLicense(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Maximum Occupant Capacity</label>
                    <input 
                      type="number"
                      min="1"
                      placeholder={facType === 'childcare' ? "Max Children" : "Max Beds"}
                      className="w-full bg-black border border-gray-800 p-3.5 rounded-xl text-sm focus:border-blue-500 outline-none text-white"
                      value={facCapacity}
                      onChange={(e) => setFacCapacity(e.target.value === '' ? '' : Number(e.target.value))}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">State Licensing Sub-Classification</label>
                    <select
                      className="w-full bg-black border border-gray-800 p-3.5 rounded-xl text-sm focus:border-blue-500 outline-none text-white"
                      value={facSubClass}
                      onChange={(e) => setFacSubClass(e.target.value)}
                    >
                      {(facType === 'childcare' ? CHILDCARE_CLASSIFICATIONS : HEALTHCARE_CLASSIFICATIONS).map((cls) => (
                        <option key={cls} value={cls} className="text-slate-900 bg-white">{cls}</option>
                      ))}
                    </select>
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

            {/* QUEUED LOCATIONS PREVIEW */}
            {facilities.length > 0 && (
              <div className="space-y-3 mb-10">
                <p className="text-xs font-black text-gray-500 uppercase tracking-[0.2em] mb-2 px-1">Registered Infrastructure Queue ({facilities.length})</p>
                {facilities.map((f) => (
                  <div key={f.id} className="flex justify-between items-center p-4 bg-gray-900/60 border border-gray-800 rounded-xl animate-in fade-in">
                    <div>
                      <p className="font-bold text-md text-white">{f.name}</p>
                      <p className="text-xs text-gray-500 font-mono mt-0.5">
                        {f.subClassification} • ID: {f.licenseNumber} • Cap: {f.capacity}
                      </p>
                    </div>
                    <button onClick={() => removeFacility(f.id)} className="text-gray-600 hover:text-red-500 transition-colors p-2 text-sm">✕</button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-4">
              <button onClick={() => setStep(1)} className="p-5 text-gray-500 font-bold text-sm">Back</button>
              <button 
                onClick={handleReviewStep}
                disabled={facilities.length === 0}
                className="flex-1 bg-white text-black font-bold py-4 rounded-2xl hover:bg-blue-600 hover:text-white transition-all disabled:opacity-20 text-md"
              >
                Review {facilities.length} Locations
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: REGULATORY SCOPE CHECKLIST */}
        {step === 3 && (
          <div className="animate-in fade-in zoom-in-95 duration-700">
            <h1 className="text-5xl font-bold mb-4 tracking-tight">Audit Checklist.</h1>
            <p className="text-gray-400 mb-10 text-lg leading-relaxed">
              We've cross-referenced Arkansas rulesets and structured your compliance pipeline criteria.
            </p>

            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar divide-y divide-gray-900">
              {requirementsSummary.map((req) => (
                <div key={req.id} className="pt-4 first:pt-0 flex justify-between items-center group">
                  <div>
                    <h3 className="font-bold text-base text-gray-200">{req.requirement_name}</h3>
                    <div className="flex gap-4 mt-1.5">
                      <span className={`text-[9px] font-black uppercase tracking-[0.15em] px-2 py-0.5 rounded ${req.severity === 'critical' ? 'bg-red-500/10 text-red-500' : 'bg-blue-500/10 text-blue-500'}`}>
                        {req.severity}
                      </span>
                      <span className="text-[9px] text-gray-600 uppercase font-black tracking-[0.15em] py-0.5">
                         System Key: {req.required_document_type}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button 
              onClick={handleFinalize}
              className="mt-12 w-full bg-blue-600 text-white font-bold py-5 rounded-2xl hover:bg-blue-500 shadow-2xl shadow-blue-900/20 transition-all active:scale-[0.98] text-md"
            >
              Finalize Infrastructure & Start Active Audits
            </button>
            <button onClick={() => setStep(2)} className="mt-4 w-full text-gray-500 font-bold py-2 text-sm">Add More Facilities</button>
          </div>
        )}

        {/* IMMERSIVE SYNCING BANNER */}
        {loading && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center z-50">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-6"></div>
            <div className="text-blue-500 font-black tracking-[0.25em] uppercase text-[11px] animate-pulse text-center leading-loose">
              Mapping Arkansas Code Frameworks <br/> & Instantiating Corporate Hub...
            </div>
          </div>
        )}

      </div>
    </div>
  );
}