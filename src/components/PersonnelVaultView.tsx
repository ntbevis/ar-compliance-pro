'use client';

import { useEffect, useState } from 'react';
import {
  addPersonnel,
  getAvailableRoles,
  getPersonnelData,
  getRequirementsForRole,
  getSeparatedPersonnelData,
  markEmployeeSeparated,
} from 'src/app/actions/compliance';

interface Props {
  facilityId: string;
}

interface PersonnelRecord {
  id: string;
  name: string;
  role: string;
  clearance_status: string;
  hire_date: string;
  status?: string;
  separation_date?: string | null;
}

interface RoleRequirement {
  id: string;
  name: string;
  typeKey: string;
  severity: string;
  frequency: string;
}

interface NewPersonnelForm {
  name: string;
  role: string;
  hire_date: string;
  attestation_frequency: 'annual' | 'biannual' | 'quarterly' | 'monthly';
}

const EMPTY_FORM: NewPersonnelForm = {
  name: '',
  role: '',
  hire_date: new Date().toISOString().split('T')[0],
  attestation_frequency: 'annual',
};

export default function PersonnelVaultView({ facilityId }: Props) {
  const [active, setActive] = useState<PersonnelRecord[]>([]);
  const [separated, setSeparated] = useState<PersonnelRecord[]>([]);
  const [showArchive, setShowArchive] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [form, setForm] = useState<NewPersonnelForm>(EMPTY_FORM);
  const [availableRoles, setAvailableRoles] = useState<string[]>([]);
  const [loadingRoles, setLoadingRoles] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [separatingId, setSeparatingId] = useState<string | null>(null);
  const [requirementsByPerson, setRequirementsByPerson] = useState<
    Record<string, RoleRequirement[]>
  >({});
  const [expandedPersonId, setExpandedPersonId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [activeData, separatedData] = await Promise.all([
          getPersonnelData(facilityId),
          getSeparatedPersonnelData(facilityId),
        ]);
        setActive(activeData);
        setSeparated(separatedData);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [facilityId]);

  useEffect(() => {
    async function loadRoles() {
      if (!showAddForm) return;
      setLoadingRoles(true);
      try {
        const result = await getAvailableRoles(facilityId);
        if (result.success) setAvailableRoles(result.roles);
        else setAvailableRoles([]);
      } finally {
        setLoadingRoles(false);
      }
    }
    loadRoles();
  }, [showAddForm, facilityId]);

  const toggleExpanded = async (person: PersonnelRecord) => {
    if (expandedPersonId === person.id) {
      setExpandedPersonId(null);
      return;
    }
    setExpandedPersonId(person.id);
    if (!requirementsByPerson[person.id]) {
      const result = await getRequirementsForRole(facilityId, person.role);
      if (result.success) {
        setRequirementsByPerson((prev) => ({ ...prev, [person.id]: result.requirements }));
      }
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.role) return;
    setSubmitting(true);
    try {
      const result = await addPersonnel(facilityId, form);
      if (result.success) {
        setForm(EMPTY_FORM);
        setShowAddForm(false);
        const refreshed = await getPersonnelData(facilityId);
        setActive(refreshed);
      } else {
        alert(`❌ ${result.error}`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSeparate = async (person: PersonnelRecord) => {
    if (!confirm(`Mark ${person.name} as separated?`)) return;
    setSeparatingId(person.id);
    try {
      const result = await markEmployeeSeparated(person.id);
      if (result.success) {
        setActive((prev) => prev.filter((p) => p.id !== person.id));
        const sep = await getSeparatedPersonnelData(facilityId);
        setSeparated(sep);
      } else {
        alert(`❌ ${result.error}`);
      }
    } finally {
      setSeparatingId(null);
    }
  };

  const roster = showArchive ? separated : active;

  return (
    <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm max-w-6xl mx-auto text-slate-800">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold mb-2">
            {showArchive ? 'Archived Employee Roster' : 'Active Personnel Vault'}
          </h2>
          <p className="text-xs text-slate-500">
            Click a row to view the personnel-category requirements that apply to that role.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!showArchive && (
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700"
            >
              ➕ Add Employee
            </button>
          )}
          <button
            onClick={() => setShowArchive(!showArchive)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          >
            📦 {showArchive ? 'Show Active Roster' : 'Show Archived Roster'}
            {showArchive && separated.length > 0 && (
              <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full text-xs font-bold">
                {separated.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {showAddForm && !showArchive && (
        <div className="mb-6 p-6 bg-blue-50 border border-blue-200 rounded-xl">
          <h3 className="text-md font-bold text-slate-800 mb-4">Add New Employee</h3>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="John Doe"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Role <span className="text-red-500">*</span>
                </label>
                {loadingRoles ? (
                  <div className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-400">
                    Loading roles…
                  </div>
                ) : availableRoles.length === 0 ? (
                  <div className="w-full px-3 py-2 border border-amber-300 rounded-lg bg-amber-50 text-amber-700 text-sm">
                    ⚠️ No roles match this facility&apos;s current scope flags.
                  </div>
                ) : (
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">Select a role…</option>
                    {availableRoles.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Hire Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={form.hire_date}
                  onChange={(e) => setForm({ ...form, hire_date: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Attestation Frequency <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.attestation_frequency}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      attestation_frequency: e.target.value as NewPersonnelForm['attestation_frequency'],
                    })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="biannual">Biannual</option>
                  <option value="annual">Annual</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={submitting || availableRoles.length === 0}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-slate-300"
              >
                {submitting ? 'Adding…' : 'Add Employee'}
              </button>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-6 py-2 bg-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-300"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <p className="text-slate-500 italic">Loading roster…</p>
      ) : roster.length === 0 ? (
        <div className="border border-dashed border-slate-200 rounded-xl p-12 text-center italic text-slate-400 text-xs bg-slate-50">
          {showArchive ? 'No archived personnel.' : 'No active personnel. Add employees to begin tracking compliance.'}
        </div>
      ) : (
        <div className="space-y-3">
          {roster.map((person) => {
            const isExpanded = expandedPersonId === person.id;
            const requirements = requirementsByPerson[person.id] ?? [];
            return (
              <div
                key={person.id}
                className={`border rounded-xl overflow-hidden transition-shadow ${
                  isExpanded ? 'shadow-md border-blue-300' : 'border-slate-200'
                }`}
              >
                <button
                  onClick={() => toggleExpanded(person)}
                  className="w-full flex items-center justify-between gap-4 p-4 text-left hover:bg-slate-50"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 text-white font-bold flex items-center justify-center">
                      {person.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800">{person.name}</p>
                      <p className="text-xs text-slate-500">{person.role}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        person.clearance_status === 'approved' || person.clearance_status === 'cleared'
                          ? 'bg-emerald-100 text-emerald-800'
                          : person.clearance_status === 'pending'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {person.clearance_status}
                    </span>
                    <span className="text-xs text-slate-400">
                      Hired {new Date(person.hire_date).toLocaleDateString()}
                    </span>
                    {!showArchive && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSeparate(person);
                        }}
                        disabled={separatingId === person.id}
                        className="text-xs font-medium px-3 py-1.5 rounded-md bg-slate-100 text-slate-700 hover:bg-rose-100 hover:text-rose-700 border border-slate-200"
                      >
                        {separatingId === person.id ? 'Processing…' : '📦 Archive'}
                      </button>
                    )}
                    <span className="text-slate-400 text-lg" aria-hidden>
                      {isExpanded ? '▾' : '▸'}
                    </span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-slate-200 bg-slate-50 p-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-3">
                      Required for this role
                    </h4>
                    {requirements.length === 0 ? (
                      <p className="text-xs italic text-slate-400">
                        No specific personnel-category requirements found for this role at this facility.
                      </p>
                    ) : (
                      <ul className="divide-y divide-slate-200 bg-white rounded-lg border border-slate-200">
                        {requirements.map((req) => (
                          <li key={req.id} className="px-4 py-3 flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-slate-800">{req.name}</p>
                              <p className="text-[11px] text-slate-400 font-mono">{req.typeKey}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                  req.severity === 'critical'
                                    ? 'bg-rose-100 text-rose-700'
                                    : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {req.severity.toUpperCase()}
                              </span>
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                                {req.frequency.toUpperCase()}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
