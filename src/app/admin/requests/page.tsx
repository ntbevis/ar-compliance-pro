'use client';

import { useEffect, useState } from 'react';
import { getPendingRequests, approveRegistrationRequest } from '@/app/actions/admin';
import { notFound } from 'next/navigation';

interface RegistrationRequest {
  id: string;
  business_name: string;
  contact_name: string;
  email: string;
  phone: string;
  facility_type: 'childcare' | 'nursing_home';
  sub_classification: string;
  license_number: string;
  estimated_capacity: number;
  status: string;
  submitted_at: string;
}

export default function AdminRequestsPage() {
  const [requests, setRequests] = useState<RegistrationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    loadRequests();
  }, []);

  const loadRequests = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await getPendingRequests();
      
      if (!result.success) {
        // Check if it's an authorization error
        if (result.error?.includes('Forbidden') || result.error?.includes('Admin access required')) {
          notFound(); // Trigger 404 for non-admin users
          return;
        }
        setError(result.error || 'Failed to load requests');
      } else {
        setRequests(result.requests);
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (requestId: string, businessName: string) => {
    if (!confirm(`Approve ${businessName} and send invitation email?`)) {
      return;
    }

    setProcessingId(requestId);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await approveRegistrationRequest(requestId);

      if (result.success) {
        setSuccessMessage(result.message || 'Request approved successfully');
        // Remove the approved request from the list
        setRequests(prev => prev.filter(req => req.id !== requestId));
      } else {
        setError(result.error || 'Failed to approve request');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setProcessingId(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const getFacilityTypeLabel = (type: string) => {
    return type === 'childcare' ? '🧸 Childcare' : '🏥 Healthcare';
  };

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
              <h1 className="text-4xl font-black tracking-tight">Inbound Lead Control Center</h1>
              <p className="text-slate-400 text-sm mt-1">Platform Access Request Management</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4 mt-6">
            <button
              onClick={loadRequests}
              disabled={loading}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {loading ? 'Refreshing...' : '🔄 Refresh'}
            </button>
            <div className="text-sm text-slate-400">
              <span className="font-bold text-blue-400">{requests.length}</span> pending request{requests.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        {/* Success Message */}
        {successMessage && (
          <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-emerald-400 font-medium text-sm">{successMessage}</p>
              <button
                onClick={() => setSuccessMessage(null)}
                className="ml-auto text-emerald-400 hover:text-emerald-300"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-rose-400 font-medium text-sm">{error}</p>
              <button
                onClick={() => setError(null)}
                className="ml-auto text-rose-400 hover:text-rose-300"
              >
                ✕
              </button>
            </div>
          </div>
        )}

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
                    {/* Header Row */}
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-xl font-bold text-white mb-1">{request.business_name}</h3>
                        <div className="flex items-center gap-3 text-sm">
                          <span className="text-slate-400">Submitted {formatDate(request.submitted_at)}</span>
                          <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded text-xs font-bold uppercase tracking-wider">
                            {getFacilityTypeLabel(request.facility_type)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Info Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Contact Person</p>
                        <p className="text-white font-medium">{request.contact_name}</p>
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
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">License Number</p>
                        <p className="text-white font-medium font-mono">{request.license_number}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Sub-Classification</p>
                        <p className="text-white font-medium text-sm">{request.sub_classification}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Estimated Capacity</p>
                        <p className="text-white font-medium">{request.estimated_capacity} {request.facility_type === 'childcare' ? 'children' : 'beds'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Action Button */}
                  <div className="lg:pl-6 lg:border-l lg:border-slate-800">
                    <button
                      onClick={() => handleApprove(request.id, request.business_name)}
                      disabled={processingId === request.id}
                      className={`w-full lg:w-auto px-6 py-4 rounded-xl font-bold text-sm uppercase tracking-wider transition-all ${
                        processingId === request.id
                          ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                          : 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white shadow-lg shadow-blue-900/30 hover:shadow-blue-900/50'
                      }`}
                    >
                      {processingId === request.id ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                          Processing...
                        </span>
                      ) : (
                        <span className="flex items-center justify-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Approve & Invite Provider
                        </span>
                      )}
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
