'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  getOrgDirectors,
  inviteFacilityDirector,
  toggleUserStatus,
} from 'src/app/actions/compliance';
import { useFacility } from 'src/context/FacilityContext';

interface DirectorProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  account_status: string | null;
  org_id: string | null;
}

export default function TeamSettingsView() {
  const { facilityList } = useFacility();

  const [directors, setDirectors] = useState<DirectorProfile[]>([]);
  const [loadingDirectors, setLoadingDirectors] = useState(true);

  // Invite form state
  const [inviteFullName, setInviteFullName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteFacilityIds, setInviteFacilityIds] = useState<string[]>([]);
  const [inviting, setInviting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Per-row deactivation loading
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const loadDirectors = async () => {
    setLoadingDirectors(true);
    try {
      const data = await getOrgDirectors();
      setDirectors(data);
    } catch (err) {
      console.error('Failed to load directors:', err);
      toast.error('Failed to load team members.');
    } finally {
      setLoadingDirectors(false);
    }
  };

  useEffect(() => {
    // Mount-time data fetch (external system); loadDirectors owns its own state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDirectors();
  }, []);

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!inviteFullName.trim()) errors.fullName = 'Full name is required.';
    if (!inviteEmail.trim()) {
      errors.email = 'Email address is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail.trim())) {
      errors.email = 'Please enter a valid email address.';
    }
    if (inviteFacilityIds.length === 0) errors.facility = 'Please assign at least one facility.';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setInviting(true);
    try {
      const result = await inviteFacilityDirector(
        inviteEmail.trim(),
        inviteFullName.trim(),
        inviteFacilityIds
      );
      if (result.success) {
        toast.success(`Invitation sent to ${inviteEmail.trim()}. They will receive a setup email shortly.`);
        setInviteFullName('');
        setInviteEmail('');
        setInviteFacilityIds([]);
        setFormErrors({});
        await loadDirectors();
      } else {
        toast.error(result.error ?? 'Failed to send invitation.');
      }
    } finally {
      setInviting(false);
    }
  };

  const handleToggleStatus = async (director: DirectorProfile) => {
    const isActive = director.account_status === 'active';
    const newStatus: 'active' | 'deactivated' = isActive ? 'deactivated' : 'active';
    setTogglingId(director.id);
    try {
      const result = await toggleUserStatus(director.id, newStatus);
      if (result.success) {
        toast.success(result.message ?? `Account ${newStatus}.`);
        setDirectors((prev) =>
          prev.map((d) =>
            d.id === director.id ? { ...d, account_status: newStatus } : d
          )
        );
      } else {
        toast.error(result.error ?? 'Failed to update account status.');
      }
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* ── Invite New Director ─────────────────────────────────────────── */}
      <section className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden shadow-lg">
        <div className="bg-gradient-to-r from-indigo-900 to-slate-800 px-5 py-4 md:px-8 md:py-5 border-b border-slate-700">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            👥 Invite New Director
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Send a secure setup invitation to a new Facility Director. They will receive an email to
            configure their password and access their assigned facility.
          </p>
        </div>

        <form onSubmit={handleInvite} noValidate className="p-5 md:p-8 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Full Name */}
            <div>
              <label className="block text-xs font-black text-slate-400 uppercase tracking-wider mb-1.5">
                Full Name <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={inviteFullName}
                onChange={(e) => {
                  setInviteFullName(e.target.value);
                  if (formErrors.fullName) setFormErrors((p) => ({ ...p, fullName: '' }));
                }}
                placeholder="e.g. Jane Doe"
                className={`w-full bg-slate-900 border rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors ${
                  formErrors.fullName ? 'border-rose-500' : 'border-slate-700'
                }`}
              />
              {formErrors.fullName && (
                <p className="text-xs text-rose-400 mt-1 font-medium">⚠ {formErrors.fullName}</p>
              )}
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-black text-slate-400 uppercase tracking-wider mb-1.5">
                Email Address <span className="text-rose-400">*</span>
              </label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => {
                  setInviteEmail(e.target.value);
                  if (formErrors.email) setFormErrors((p) => ({ ...p, email: '' }));
                }}
                placeholder="director@facility.org"
                className={`w-full bg-slate-900 border rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors ${
                  formErrors.email ? 'border-rose-500' : 'border-slate-700'
                }`}
              />
              {formErrors.email && (
                <p className="text-xs text-rose-400 mt-1 font-medium">⚠ {formErrors.email}</p>
              )}
            </div>

            {/* Facility Assignment */}
            <div className="md:col-span-2">
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-black text-slate-400 uppercase tracking-wider">
                  Assign to Facilities <span className="text-rose-400">*</span>
                </label>
                {facilityList.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      const allIds = facilityList.map((f) => f.id);
                      const allSelected = allIds.every((id) => inviteFacilityIds.includes(id));
                      setInviteFacilityIds(allSelected ? [] : allIds);
                      if (formErrors.facility) setFormErrors((p) => ({ ...p, facility: '' }));
                    }}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold transition-colors"
                  >
                    {facilityList.every((f) => inviteFacilityIds.includes(f.id))
                      ? 'Deselect All'
                      : 'Select All'}
                  </button>
                )}
              </div>
              <div
                className={`bg-slate-900 border rounded-xl divide-y divide-slate-800 overflow-hidden ${
                  formErrors.facility ? 'border-rose-500' : 'border-slate-700'
                }`}
              >
                {facilityList.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-slate-500 italic">No facilities found.</p>
                ) : (
                  facilityList.map((f) => {
                    const checked = inviteFacilityIds.includes(f.id);
                    return (
                      <label
                        key={f.id}
                        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-800/60 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setInviteFacilityIds((prev) =>
                              checked ? prev.filter((id) => id !== f.id) : [...prev, f.id]
                            );
                            if (formErrors.facility) setFormErrors((p) => ({ ...p, facility: '' }));
                          }}
                          className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-slate-900 accent-indigo-500"
                        />
                        <span className="text-sm text-white">{f.name}</span>
                      </label>
                    );
                  })
                )}
              </div>
              {formErrors.facility && (
                <p className="text-xs text-rose-400 mt-1 font-medium">⚠ {formErrors.facility}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={inviting}
              className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm min-h-[44px] ${
                inviting
                  ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white'
              }`}
            >
              {inviting ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                  Sending Invitation…
                </span>
              ) : (
                '✉️ Send Invitation'
              )}
            </button>
            <p className="text-xs text-slate-500">
              The director will receive a secure link to set their password.
            </p>
          </div>
        </form>
      </section>

      {/* ── Active Team Management ──────────────────────────────────────── */}
      <section className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden shadow-lg">
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-5 py-4 md:px-8 md:py-5 border-b border-slate-700">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            🗂️ Active Team Management
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            All Facility Directors registered under your organization.
          </p>
        </div>

        <div className="p-6">
          {loadingDirectors ? (
            <div className="py-12 text-center">
              <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-slate-500 text-sm italic">Loading team members…</p>
            </div>
          ) : directors.length === 0 ? (
            <div className="border border-dashed border-slate-700 rounded-xl p-12 text-center">
              <p className="text-slate-500 italic text-sm">
                No directors found. Invite your first Facility Director above.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-700">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-900 border-b border-slate-700">
                    <th className="text-left py-3 px-5 text-xs font-black uppercase tracking-wider text-slate-400">
                      Name
                    </th>
                    <th className="text-left py-3 px-5 text-xs font-black uppercase tracking-wider text-slate-400">
                      Email
                    </th>
                    <th className="text-left py-3 px-5 text-xs font-black uppercase tracking-wider text-slate-400">
                      Status
                    </th>
                    <th className="py-3 px-5 text-xs font-black uppercase tracking-wider text-slate-400 text-right">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/60">
                  {directors.map((director) => {
                    const isActive = director.account_status === 'active';
                    const isToggling = togglingId === director.id;
                    return (
                      <tr key={director.id} className="hover:bg-slate-700/30 transition-colors">
                        <td className="py-4 px-5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                              {director.full_name?.[0]?.toUpperCase() ?? '?'}
                            </div>
                            <span className="font-semibold text-white">
                              {director.full_name ?? '—'}
                            </span>
                          </div>
                        </td>
                        <td className="py-4 px-5 text-slate-400 font-mono text-xs">
                          {director.email ?? '—'}
                        </td>
                        <td className="py-4 px-5">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                              isActive
                                ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-700/50'
                                : 'bg-slate-700 text-slate-400 border border-slate-600'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                isActive ? 'bg-emerald-400' : 'bg-slate-500'
                              }`}
                            />
                            {isActive ? 'Active' : 'Deactivated'}
                          </span>
                        </td>
                        <td className="py-4 px-5 text-right">
                          <button
                            onClick={() => handleToggleStatus(director)}
                            disabled={isToggling}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                              isToggling
                                ? 'opacity-50 cursor-not-allowed bg-slate-700 text-slate-500 border-slate-600'
                                : isActive
                                ? 'bg-rose-900/30 text-rose-400 border-rose-700/50 hover:bg-rose-900/60 hover:border-rose-600'
                                : 'bg-emerald-900/30 text-emerald-400 border-emerald-700/50 hover:bg-emerald-900/60 hover:border-emerald-600'
                            }`}
                          >
                            {isToggling ? (
                              <span className="flex items-center gap-1.5">
                                <span className="w-3 h-3 border border-slate-400 border-t-transparent rounded-full animate-spin" />
                                Updating…
                              </span>
                            ) : isActive ? (
                              'Deactivate'
                            ) : (
                              'Reactivate'
                            )}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
