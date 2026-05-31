'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { getPendingRequests, approveRegistrationRequest, denyRegistrationRequest } from '@/app/actions/admin';

interface RegistrationRequest {
  id: string;
  business_name: string;
  first_name: string | null;
  last_name: string | null;
  contact_name: string | null;
  email: string;
  phone: string;
  number_of_locations: number | null;
  status: string;
  submitted_at: string;
}

export default function AdminRequestsPage() {
  const router = useRouter();
  const [requests, setRequests] = useState<RegistrationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const result = await getPendingRequests();
      if (!result.success) {
        // Authorization failure — the layout already guards this, but defend in depth
        if (result.error?.includes('Forbidden') || result.error?.includes('Admin access required')) {
          router.replace('/');
          return;
        }
        toast.error(result.error || 'Failed to load requests');
      } else {
        setRequests(result.requests as RegistrationRequest[]);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Mount-time data fetch (external system); loadRequests owns its own state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApprove = async (requestId: string, businessName: string) => {
    if (!confirm(`Approve ${businessName} and send invitation email?`)) return;

    setProcessingId(requestId);
    try {
      const result = await approveRegistrationRequest(requestId);
      if (result.success) {
        toast.success(result.message || 'Request approved — invitation sent.');
        setRequests(prev => prev.filter(req => req.id !== requestId));
      } else {
        toast.error(result.error || 'Failed to approve request');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeny = async (requestId: string, businessName: string) => {
    if (!confirm(`Deny the request from ${businessName}? This cannot be undone.`)) return;

    setProcessingId(requestId);
    try {
      const result = await denyRegistrationRequest(requestId);
      if (result.success) {
        toast.success(result.message || 'Request denied.');
        setRequests(prev => prev.filter(req => req.id !== requestId));
      } else {
        toast.error(result.error || 'Failed to deny request');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setProcessingId(null);
    }
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-6 md:p-12">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-blue-600/20 rounded-xl flex items-center justify-center border border-blue-500/30">
              <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl md:text-4xl font-black tracking-tight">Inbound Lead Control Center</h1>
              <p className="text-slate-400 text-sm mt-1">Platform Access Request Management</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-6">
            <button
              onClick={loadRequests}
              disabled={loading}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 min-h-[44px]"
            >
              {loading ? 'Refreshing...' : '🔄 Refresh'}
            </button>
            <div className="text-sm text-slate-400">
              <span className="font-bold text-blue-400">{requests.length}</span> pending request{requests.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        {/* Loading State */}
        {loading && requests.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-slate-400 text-sm font-medium">Loading pending requests...</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && requests.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-slate-800 rounded-2xl">
            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-slate-300 mb-2">No Pending Requests</h3>
            <p className="text-slate-500 text-sm">All registration requests have been processed.</p>
          </div>
        )}

        {/* Requests Grid */}
        {!loading && requests.length > 0 && (
          <div className="grid gap-6">
            {requests.map((request) => (
              <div
                key={request.id}
                className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 hover:border-slate-700 transition-all backdrop-blur-sm"
              >
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                  {/* Request Details */}
                  <div className="flex-1 space-y-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-xl font-bold text-white mb-1">{request.business_name}</h3>
                        <span className="text-slate-400 text-sm">
                          Submitted {formatDate(request.submitted_at)}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Owner Name</p>
                        <p className="text-white font-medium">
                          {request.first_name && request.last_name
                            ? `${request.first_name} ${request.last_name}`
                            : (request.contact_name ?? '—')}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Email Address</p>
                        <p className="text-white font-medium">{request.email}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Phone Number</p>
                        <p className="text-white font-medium">{request.phone}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">No. of Locations</p>
                        <p className="text-white font-medium">
                          {request.number_of_locations ?? '—'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="lg:pl-6 lg:border-l lg:border-slate-800 flex flex-row lg:flex-col gap-3 shrink-0">
                    <button
                      onClick={() => handleApprove(request.id, request.business_name)}
                      disabled={processingId === request.id}
                      className={`flex-1 lg:flex-none px-6 py-3.5 rounded-xl font-bold text-sm uppercase tracking-wider transition-all ${
                        processingId === request.id
                          ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                          : 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white shadow-lg shadow-blue-900/30'
                      }`}
                    >
                      {processingId === request.id ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Processing...
                        </span>
                      ) : (
                        <span className="flex items-center justify-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Approve & Invite
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => handleDeny(request.id, request.business_name)}
                      disabled={processingId === request.id}
                      className="flex-1 lg:flex-none px-6 py-3.5 rounded-xl font-bold text-sm uppercase tracking-wider transition-all bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 border border-rose-600/30 hover:border-rose-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="flex items-center justify-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Deny
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
