'use client';

import { useFacility } from 'src/context/FacilityContext';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getFacilityComplianceData, getPersonnelData, getDocumentsData, markEmployeeSeparated, handleDocumentUploadSuccess, getSeparatedPersonnelData, getAllFacilitiesOverview, getAvailableRoles, addPersonnel, updateEnrollment } from 'src/app/actions/compliance';
import { createClient } from 'src/app/utils/supabase/client';
import ComplianceDashboardClient from 'src/components/ComplianceDashboardClient';

// Type definitions for personnel and documents
interface PersonnelRecord {
  id: string;
  name: string;
  role: string;
  clearance_status: string;
  hire_date: string;
  created_at: string;
  status?: string;
  separation_date?: string;
}

interface DocumentRecord {
  id: string;
  name: string;
  document_type: string;
  status: string;
  file_url: string;
  metadata: any;
  created_at: string;
}

export default function ExecutiveOverview() {
  const router = useRouter();
  const supabase = createClient();
  const { selectedFacilityId, setSelectedFacilityId, currentView, setCurrentView } = useFacility();
  const [data, setData] = useState<any>(null);
  const [personnelData, setPersonnelData] = useState<PersonnelRecord[]>([]);
  const [separatedPersonnelData, setSeparatedPersonnelData] = useState<PersonnelRecord[]>([]);
  const [showArchiveView, setShowArchiveView] = useState(false);
  const [documentsData, setDocumentsData] = useState<DocumentRecord[]>([]);
  const [facilitiesData, setFacilitiesData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [separatingId, setSeparatingId] = useState<string | null>(null);
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [uploadFeedback, setUploadFeedback] = useState<{
    status: string;
    message: string;
  } | null>(null);
  const [selectedAuditReport, setSelectedAuditReport] = useState<DocumentRecord | null>(null);
  
  // Personnel form state
  const [showAddPersonnelForm, setShowAddPersonnelForm] = useState(false);
  const [availableRoles, setAvailableRoles] = useState<string[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [addingPersonnel, setAddingPersonnel] = useState(false);
  const [personnelFormData, setPersonnelFormData] = useState({
    name: '',
    role: '',
    hire_date: new Date().toISOString().split('T')[0],
    attestation_frequency: 'annual' as 'annual' | 'biannual' | 'quarterly' | 'monthly'
  });
  
  // Enrollment state
  const [enrollmentInput, setEnrollmentInput] = useState<string>('');
  const [updatingEnrollment, setUpdatingEnrollment] = useState(false);

  // Load available roles when form is opened
  useEffect(() => {
    if (showAddPersonnelForm && selectedFacilityId && selectedFacilityId !== 'all') {
      loadAvailableRoles();
    }
  }, [showAddPersonnelForm, selectedFacilityId]);

  const loadAvailableRoles = async () => {
    if (!selectedFacilityId || selectedFacilityId === 'all') return;
    
    setLoadingRoles(true);
    try {
      const result = await getAvailableRoles(selectedFacilityId);
      if (result.success) {
        setAvailableRoles(result.roles);
      } else {
        alert(`Failed to load roles: ${result.error}`);
      }
    } catch (error) {
      console.error('Error loading roles:', error);
    } finally {
      setLoadingRoles(false);
    }
  };

  const handleAddPersonnel = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedFacilityId || selectedFacilityId === 'all') {
      alert('Please select a specific facility first');
      return;
    }
    
    if (!personnelFormData.name || !personnelFormData.role) {
      alert('Please fill in all required fields');
      return;
    }
    
    setAddingPersonnel(true);
    try {
      const result = await addPersonnel(selectedFacilityId, personnelFormData);
      
      if (result.success) {
        alert(`✅ Successfully added ${personnelFormData.name} to the roster!`);
        
        // Reset form and close
        setPersonnelFormData({
          name: '',
          role: '',
          hire_date: new Date().toISOString().split('T')[0],
          attestation_frequency: 'annual'
        });
        setShowAddPersonnelForm(false);
        
        // Reload personnel data
        const personnel = await getPersonnelData(selectedFacilityId);
        setPersonnelData(personnel);
      } else {
        alert(`❌ Failed to add personnel: ${result.error}`);
      }
    } catch (error) {
      console.error('Error adding personnel:', error);
      alert('❌ An unexpected error occurred');
    } finally {
      setAddingPersonnel(false);
    }
  };

  // Handle employee separation with confirmation
  const handleUpdateEnrollment = async () => {
    if (!selectedFacilityId || selectedFacilityId === 'all') {
      alert('Please select a specific facility first');
      return;
    }
    
    const enrollment = parseInt(enrollmentInput);
    if (isNaN(enrollment) || enrollment < 0) {
      alert('Please enter a valid enrollment number (0 or greater)');
      return;
    }
    
    setUpdatingEnrollment(true);
    try {
      const result = await updateEnrollment(selectedFacilityId, enrollment);
      
      if (result.success) {
        alert(`✅ Successfully updated enrollment to ${enrollment}`);
        setEnrollmentInput('');
        
        // Refresh the compliance data to recalculate staffing ratios
        const updatedData = await getFacilityComplianceData(selectedFacilityId);
        setData(updatedData);
        router.refresh();
      } else {
        alert(`❌ Failed to update enrollment: ${result.error}`);
      }
    } catch (error) {
      console.error('Error updating enrollment:', error);
      alert('❌ An unexpected error occurred');
    } finally {
      setUpdatingEnrollment(false);
    }
  };

  const handleSeparateEmployee = async (personnelId: string, employeeName: string) => {
    const confirmed = window.confirm(
      `Are you sure you want to mark ${employeeName} as separated?\n\nThis will:\n• Remove them from the active roster\n• Set their status to 'separated'\n• Record the separation date\n• Preserve all historical records\n\nThis action can be reversed by updating the database directly.`
    );

    if (!confirmed) return;

    setSeparatingId(personnelId);
    try {
      const result = await markEmployeeSeparated(personnelId);
      
      if (result.success) {
        // Remove from local state immediately for instant UI feedback
        setPersonnelData(prev => prev.filter(p => p.id !== personnelId));
        alert(`✅ ${employeeName} has been marked as separated and removed from the active roster.`);
      } else {
        alert(`❌ Failed to mark employee as separated: ${result.error}`);
      }
    } catch (error: any) {
      console.error('Error separating employee:', error);
      alert(`❌ Error: ${error.message}`);
    } finally {
      setSeparatingId(null);
    }
  };

  // Handle document upload with AI processing
  const handleDocumentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!selectedFacilityId || selectedFacilityId === 'all') {
      alert('⚠️ Please select a specific facility before uploading documents.');
      return;
    }

    try {
      setUploadingDocument(true);
      setUploadFeedback(null);
      console.log(`🎬 Document upload triggered for facility: ${selectedFacilityId}`);

      // 1. Generate a standardized unique ID for the document record
      const documentId = crypto.randomUUID();
      const fileExtension = file.name.split('.').pop()?.toLowerCase() || 'pdf';
      const storagePath = `${selectedFacilityId}/${documentId}.${fileExtension}`;

      // 2. Stream the raw file directly to the storage bucket
      const { error: storageError } = await supabase.storage
        .from('facility-documents')
        .upload(storagePath, file);

      if (storageError) throw storageError;

      // 3. Insert the tracking row into facility_documents
      const { error: insertError } = await supabase
        .from('facility_documents')
        .insert({
          id: documentId,
          facility_id: selectedFacilityId,
          document_type: 'general_compliance_upload', // Default type for Document Center uploads
          status: 'pending',
          file_url: storagePath,
          name: file.name,
          metadata: {
            original_upload_method: 'documents_view',
            uploaded_at: new Date().toISOString()
          }
        });

      if (insertError) throw insertError;

      console.log(`🧠 Invoking real-time AI compliance verification...`);
      
      // 4. Trigger the Server Action loop for AI processing
      const response = await handleDocumentUploadSuccess(selectedFacilityId, documentId);

      if (response.success && response.report) {
        const report = response.report;
        
        // Build feedback message with personnel matching status
        let feedbackMessage = `Document processed: ${report.compliance_status}. ${report.corrective_action || 'No action required.'}`;
        
        if (response.personnelName && !response.personnelMatched) {
          feedbackMessage += ` ⚠️ Document accepted but could not be linked: Personnel '${response.personnelName}' is not registered in this facility's vault.`;
        } else if (response.personnelMatched) {
          feedbackMessage += ` ✅ Automatically linked to personnel record: ${response.personnelName}.`;
        }
        
        setUploadFeedback({
          status: report.compliance_status,
          message: feedbackMessage
        });

        // Refresh the documents list to show the new upload
        const updatedDocs = await getDocumentsData(selectedFacilityId);
        setDocumentsData(updatedDocs);
        
        // Also refresh the router to sync all views
        router.refresh();
      } else {
        setUploadFeedback({
          status: 'warning',
          message: 'Document uploaded but AI processing encountered issues. Check system logs.'
        });
        
        // Still refresh to show the document
        const updatedDocs = await getDocumentsData(selectedFacilityId);
        setDocumentsData(updatedDocs);
      }

    } catch (error: any) {
      console.error("❌ Document Upload Exception:", error);
      setUploadFeedback({
        status: 'error',
        message: `Upload failed: ${error.message || 'Unknown error'}`
      });
    } finally {
      setUploadingDocument(false);
      // Clear the file input
      e.target.value = '';
    }
  };

  useEffect(() => {
    async function loadStats() {
      if (!selectedFacilityId || selectedFacilityId === 'all') {
        setData(null);
        setPersonnelData([]);
        setSeparatedPersonnelData([]);
        setDocumentsData([]);
        
        // Load all facilities for master view
        if (selectedFacilityId === 'all') {
          setLoading(true);
          try {
            const facilities = await getAllFacilitiesOverview();
            setFacilitiesData(facilities);
          } catch (error) {
            console.error('Error loading facilities:', error);
            setFacilitiesData([]);
          }
        }
        
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        // Fetch all data in parallel for better performance
        const [stats, personnel, separatedPersonnel, documents] = await Promise.all([
          getFacilityComplianceData(selectedFacilityId),
          getPersonnelData(selectedFacilityId),
          getSeparatedPersonnelData(selectedFacilityId),
          getDocumentsData(selectedFacilityId)
        ]);
        
        setData(stats);
        setPersonnelData(personnel);
        setSeparatedPersonnelData(separatedPersonnel);
        setDocumentsData(documents);
      } catch (error) {
        console.error("Dashboard Load Error:", error);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, [selectedFacilityId]);

  if (loading) {
    return (
      <div className="p-12 min-h-screen bg-slate-50 flex items-center justify-center animate-pulse">
        <p className="text-blue-500 font-black tracking-[0.3em] uppercase text-xs">
          Synchronizing DHS Brain...
        </p>
      </div>
    );
  }

  if (selectedFacilityId === 'all' || !selectedFacilityId) {
    return (
      <div className="p-8 md:p-12 min-h-screen bg-slate-50 animate-in fade-in duration-700">
        <header className="mb-8">
          <p className="text-blue-500 font-black text-xs uppercase tracking-widest mb-2">DHS Regulatory Engine</p>
          <h1 className="text-5xl font-bold tracking-tight text-slate-900 mb-2">Executive Fleet Overview</h1>
          <p className="text-slate-600 text-lg">Real-time compliance monitoring across all facilities</p>
        </header>

        {facilitiesData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="p-8 border border-dashed border-slate-300 rounded-2xl bg-white max-w-md shadow-sm text-center">
              <p className="text-slate-500 italic">
                No facilities found. Add facilities to begin monitoring compliance across your organization.
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
                {/* Facility Header */}
                <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-6 py-4">
                  <h3 className="text-white font-bold text-lg mb-1">{facility.name}</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-white/20 text-white px-2 py-0.5 rounded-full font-medium">
                      {facility.facility_type === 'childcare' ? 'Childcare' : 'Nursing Home'}
                    </span>
                    {facility.sub_classification && (
                      <span className="text-xs text-slate-300">
                        {facility.sub_classification}
                      </span>
                    )}
                  </div>
                </div>

                {/* Compliance Score Dial */}
                <div className="p-6 flex items-center justify-center border-b border-slate-100">
                  <div className="relative">
                    <div className={`w-32 h-32 rounded-full border-8 flex flex-col items-center justify-center ${
                      facility.complianceScore >= 80
                        ? 'border-emerald-500 bg-emerald-50'
                        : facility.complianceScore >= 50
                        ? 'border-amber-500 bg-amber-50'
                        : 'border-rose-500 bg-rose-50'
                    }`}>
                      <span className={`text-3xl font-black ${
                        facility.complianceScore >= 80
                          ? 'text-emerald-600'
                          : facility.complianceScore >= 50
                          ? 'text-amber-600'
                          : 'text-rose-600'
                      }`}>
                        {facility.complianceScore}%
                      </span>
                      <span className="text-xs text-slate-500 font-medium mt-1">Compliance</span>
                    </div>
                  </div>
                </div>

                {/* Facility Stats */}
                <div className="p-6 space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 font-medium">Capacity:</span>
                    <span className="text-slate-900 font-bold">{facility.capacity || 'N/A'}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 font-medium">Active Staff:</span>
                    <span className="text-slate-900 font-bold">{facility.totalPersonnel}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 font-medium">Open Gaps:</span>
                    <span className={`font-bold ${
                      facility.gapsCount === 0
                        ? 'text-emerald-600'
                        : facility.gapsCount <= 3
                        ? 'text-amber-600'
                        : 'text-rose-600'
                    }`}>
                      {facility.gapsCount}
                    </span>
                  </div>
                </div>

                {/* View Details Button */}
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

        {/* Fleet Summary Footer */}
        {facilitiesData.length > 0 && (
          <div className="mt-8 bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Fleet Summary</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="text-center">
                <p className="text-3xl font-black text-slate-900">{facilitiesData.length}</p>
                <p className="text-sm text-slate-600 mt-1">Total Facilities</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-black text-emerald-600">
                  {facilitiesData.filter(f => f.complianceScore >= 80).length}
                </p>
                <p className="text-sm text-slate-600 mt-1">Compliant (≥80%)</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-black text-slate-900">
                  {facilitiesData.reduce((sum, f) => sum + f.totalPersonnel, 0)}
                </p>
                <p className="text-sm text-slate-600 mt-1">Total Active Staff</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-black text-rose-600">
                  {facilitiesData.reduce((sum, f) => sum + f.gapsCount, 0)}
                </p>
                <p className="text-sm text-slate-600 mt-1">Total Open Gaps</p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-12 min-h-screen bg-slate-50 text-slate-500 italic flex items-center justify-center">
        ⚠️ Failed to pull compliance schema configurations.
      </div>
    );
  }

  return (
    <div className="p-8 md:p-12 min-h-screen bg-slate-50 animate-in fade-in duration-700 space-y-8">
      {/* Dynamic Main Header Titles */}
      <header>
        <p className="text-blue-500 font-black text-xs uppercase tracking-widest mb-2">DHS Regulatory Engine</p>
        <h1 className="text-5xl font-bold tracking-tight text-slate-900">
          {currentView === 'overview' && 'Executive Overview'}
          {currentView === 'personnel' && 'Personnel Vault'}
          {currentView === 'documents' && 'Document Center'}
        </h1>
      </header>

      {/* Dynamic Workspace Tab Content Panels */}
      {currentView === 'overview' && (
        <>
          {/* Active Enrollment Input */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm max-w-6xl mx-auto">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label htmlFor="enrollment-input" className="block text-sm font-bold text-slate-800 mb-2">
                  Update Active Enrollment/Attendance
                </label>
                <p className="text-xs text-slate-500 mb-3">
                  Enter the current number of children/residents actively enrolled. This affects staffing ratio calculations.
                </p>
                <div className="flex items-center gap-3">
                  <input
                    id="enrollment-input"
                    type="number"
                    min="0"
                    value={enrollmentInput}
                    onChange={(e) => setEnrollmentInput(e.target.value)}
                    placeholder="e.g., 45"
                    className="px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-32"
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
                    {updatingEnrollment ? (
                      <span className="flex items-center gap-2">
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                        Updating...
                      </span>
                    ) : (
                      'Update Enrollment'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <ComplianceDashboardClient
            key={selectedFacilityId}
            facilityId={selectedFacilityId}
            initialScore={data.score}
            initialGaps={data.gaps}
          />
        </>
      )}

      {currentView === 'personnel' && (
        <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm max-w-6xl mx-auto text-slate-800">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold mb-2">
                {showArchiveView ? 'Archived Employee Roster' : 'Active Employee Clearance Rosters'}
              </h2>
              <p className="text-xs text-slate-400">
                Tracking employee background clearance codes against facility ID: <span className="font-mono text-slate-600 bg-slate-100 px-1 rounded">{selectedFacilityId}</span>
              </p>
            </div>
            
            {/* Action Buttons */}
            <div className="flex items-center gap-3">
              {!showArchiveView && (
                <button
                  onClick={() => setShowAddPersonnelForm(!showAddPersonnelForm)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all bg-blue-600 text-white hover:bg-blue-700"
                >
                  ➕ Add Employee
                </button>
              )}
              
              <button
                onClick={() => setShowArchiveView(!showArchiveView)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border"
              style={{
                backgroundColor: showArchiveView ? '#f1f5f9' : '#ffffff',
                borderColor: showArchiveView ? '#94a3b8' : '#e2e8f0',
                color: showArchiveView ? '#475569' : '#64748b'
              }}
            >
              📦 {showArchiveView ? 'Show Active Roster' : 'Show Archived Roster'}
              {showArchiveView && separatedPersonnelData.length > 0 && (
                <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full text-xs font-bold">
                  {separatedPersonnelData.length}
                </span>
              )}
            </button>
            </div>
          </div>
          
          {/* Add Personnel Form */}
          {showAddPersonnelForm && !showArchiveView && (
            <div className="mb-6 p-6 bg-blue-50 border border-blue-200 rounded-xl">
              <h3 className="text-md font-bold text-slate-800 mb-4">Add New Employee</h3>
              <form onSubmit={handleAddPersonnel} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Name Field */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Full Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={personnelFormData.name}
                      onChange={(e) => setPersonnelFormData({ ...personnelFormData, name: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="John Doe"
                      required
                    />
                  </div>
                  
                  {/* Role Field - Dynamic from Database */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Role <span className="text-red-500">*</span>
                    </label>
                    {loadingRoles ? (
                      <div className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-400">
                        Loading roles...
                      </div>
                    ) : availableRoles.length === 0 ? (
                      <div className="w-full px-3 py-2 border border-amber-300 rounded-lg bg-amber-50 text-amber-700 text-sm">
                        ⚠️ No roles found. Run role discovery first.
                      </div>
                    ) : (
                      <select
                        value={personnelFormData.role}
                        onChange={(e) => setPersonnelFormData({ ...personnelFormData, role: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      >
                        <option value="">Select a role...</option>
                        {availableRoles.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  
                  {/* Hire Date Field */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Hire Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={personnelFormData.hire_date}
                      onChange={(e) => setPersonnelFormData({ ...personnelFormData, hire_date: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  
                  {/* Attestation Frequency Field */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Attestation Frequency <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={personnelFormData.attestation_frequency}
                      onChange={(e) => setPersonnelFormData({ ...personnelFormData, attestation_frequency: e.target.value as any })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      <option value="monthly">Monthly</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="biannual">Biannual (Every 6 months)</option>
                      <option value="annual">Annual (Yearly)</option>
                    </select>
                  </div>
                </div>
                
                {/* Form Actions */}
                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={addingPersonnel || availableRoles.length === 0}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
                  >
                    {addingPersonnel ? 'Adding...' : 'Add Employee'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddPersonnelForm(false)}
                    className="px-6 py-2 bg-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-300 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}
          
          {(showArchiveView ? separatedPersonnelData.length === 0 : personnelData.length === 0) ? (
            <div className="border border-dashed border-slate-200 rounded-xl p-12 text-center italic text-slate-400 text-xs bg-slate-50">
              {showArchiveView
                ? 'No archived personnel records found for this facility.'
                : 'No personnel records found for this facility. Add employees to begin tracking clearance status.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-left py-3 px-4 font-semibold text-slate-700">Name</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-700">Role</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-700">Clearance Status</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-700">Hire Date</th>
                    <th className="text-right py-3 px-4 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(showArchiveView ? separatedPersonnelData : personnelData).map((person) => (
                    <tr
                      key={person.id}
                      className={`transition-colors ${
                        showArchiveView
                          ? 'bg-slate-50/50 opacity-75'
                          : 'hover:bg-slate-50/50'
                      }`}
                    >
                      <td className={`py-3 px-4 font-medium ${showArchiveView ? 'text-slate-500' : 'text-slate-800'}`}>
                        {person.name}
                      </td>
                      <td className={`py-3 px-4 ${showArchiveView ? 'text-slate-400' : 'text-slate-600'}`}>
                        {person.role}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          showArchiveView
                            ? 'bg-slate-100 text-slate-500'
                            : person.clearance_status === 'approved' || person.clearance_status === 'cleared'
                            ? 'bg-emerald-100 text-emerald-800'
                            : person.clearance_status === 'pending'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}>
                          {person.clearance_status}
                        </span>
                      </td>
                      <td className={`py-3 px-4 text-xs ${showArchiveView ? 'text-slate-400' : 'text-slate-600'}`}>
                        {new Date(person.hire_date).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {showArchiveView ? (
                          // Show separation date badge for archived employees
                          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-md">
                            <span className="text-xs font-medium text-slate-600">Separated:</span>
                            <span className="text-xs text-slate-500">
                              {person.separation_date
                                ? new Date(person.separation_date).toLocaleDateString('en-US', {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric'
                                  })
                                : 'N/A'}
                            </span>
                          </div>
                        ) : (
                          // Show archive button for active employees
                          <button
                            onClick={() => handleSeparateEmployee(person.id, person.name)}
                            disabled={separatingId === person.id}
                            className={`text-xs font-medium px-3 py-1.5 rounded-md transition-all ${
                              separatingId === person.id
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                : 'bg-slate-100 text-slate-700 hover:bg-rose-100 hover:text-rose-700 hover:border-rose-300 border border-slate-200'
                            }`}
                            title="Mark employee as separated (soft delete - preserves records)"
                          >
                            {separatingId === person.id ? (
                              <span className="flex items-center gap-1.5">
                                <span className="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></span>
                                Processing...
                              </span>
                            ) : (
                              '📦 Archive / Mark Separated'
                            )}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-4 text-xs text-slate-400 text-right">
                {showArchiveView
                  ? `Total Archived: ${separatedPersonnelData.length}`
                  : `Total Active Personnel: ${personnelData.length}`}
              </div>
            </div>
          )}
        </div>
      )}

      {currentView === 'documents' && (
        <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm max-w-6xl mx-auto text-slate-800">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold mb-2">Audit-Trail Vault</h2>
              <p className="text-xs text-slate-400">Historical database record outputs for facility documents.</p>
            </div>
            
            {/* Upload Document Button */}
            <div className="flex flex-col items-end gap-2">
              <label className={`cursor-pointer px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                uploadingDocument
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm hover:shadow-md'
              }`}>
                {uploadingDocument ? (
                  <>
                    <span className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></span>
                    Processing...
                  </>
                ) : (
                  <>
                    📤 Upload Document
                  </>
                )}
                <input
                  type="file"
                  accept=".txt,.pdf,.png,.jpg,.jpeg"
                  className="hidden"
                  onChange={handleDocumentUpload}
                  disabled={uploadingDocument}
                />
              </label>
              <p className="text-[10px] text-slate-400 italic">Accepts: PDF, TXT, PNG, JPG</p>
            </div>
          </div>

          {/* Upload Feedback Banner */}
          {uploadFeedback && (
            <div className={`mb-6 p-4 rounded-lg border text-sm ${
              uploadFeedback.status === 'Compliant'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : uploadFeedback.status === 'error'
                ? 'bg-rose-50 border-rose-200 text-rose-900'
                : 'bg-amber-50 border-amber-200 text-amber-900'
            }`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold mb-1">
                    {uploadFeedback.status === 'Compliant' ? '✅ Upload Successful' :
                     uploadFeedback.status === 'error' ? '❌ Upload Failed' :
                     '⚠️ Upload Warning'}
                  </p>
                  <p className="text-xs">{uploadFeedback.message}</p>
                </div>
                <button
                  onClick={() => setUploadFeedback(null)}
                  className="text-slate-400 hover:text-slate-600 text-lg leading-none"
                >
                  ×
                </button>
              </div>
            </div>
          )}
          
          {documentsData.length === 0 ? (
            <div className="border border-dashed border-slate-200 rounded-xl p-12 text-center italic text-slate-400 text-xs bg-slate-50">
              No documents found for this facility. Upload compliance documents to begin tracking.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-left py-3 px-4 font-semibold text-slate-700">Document Name</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-700">Type</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-700">Status</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-700">Upload Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {documentsData.map((doc) => (
                    <tr key={doc.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 px-4 font-medium text-slate-800">
                        <div className="flex items-center gap-2">
                          <span>{doc.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-1 rounded">
                          {doc.document_type}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            doc.status === 'approved'
                              ? 'bg-emerald-100 text-emerald-800'
                              : doc.status === 'pending'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}>
                            {doc.status}
                          </span>
                          {doc.metadata && (doc.status === 'approved' || doc.status === 'flagged') && (
                            <button
                              onClick={() => setSelectedAuditReport(doc)}
                              className="text-slate-400 hover:text-indigo-600 transition-colors"
                              title="View Compliance Audit Report"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-600 text-xs">
                        {new Date(doc.created_at).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-4 text-xs text-slate-400 text-right">
                Total Documents: {documentsData.length}
              </div>
            </div>
          )}

          {/* Compliance Audit Report Modal */}
          {selectedAuditReport && (
            <div
              className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
              onClick={() => setSelectedAuditReport(null)}
            >
              <div
                className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Modal Header */}
                <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Compliance Audit Report</h3>
                    <p className="text-xs text-slate-500 mt-1">{selectedAuditReport.name}</p>
                  </div>
                  <button
                    onClick={() => setSelectedAuditReport(null)}
                    className="text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Modal Body */}
                <div className="p-6 space-y-6">
                  {/* Pre-Validation Badge */}
                  {selectedAuditReport.metadata?.ai_processing_skipped && (
                    <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                      <div className="flex items-center gap-2">
                        <span className="text-indigo-600 font-bold text-sm">⚡ Pre-Validation Filtered</span>
                        <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-xs font-medium">
                          Token Saved
                        </span>
                      </div>
                      <p className="text-xs text-indigo-700 mt-2">
                        Document was flagged by automated keyword scan before AI processing to optimize costs.
                      </p>
                    </div>
                  )}

                  {/* Compliance Status */}
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Compliance Status
                    </label>
                    <div className="mt-2">
                      <span className={`inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium ${
                        selectedAuditReport.metadata?.compliance_status === 'Compliant' ||
                        selectedAuditReport.metadata?.ai_compliance_status === 'Compliant'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-rose-100 text-rose-800 border border-rose-200'
                      }`}>
                        {selectedAuditReport.metadata?.compliance_status ||
                         selectedAuditReport.metadata?.ai_compliance_status ||
                         'Unknown'}
                      </span>
                    </div>
                  </div>

                  {/* Regulatory Code Violated */}
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Regulatory Code Violated
                    </label>
                    <div className="mt-2 p-4 bg-slate-50 rounded-lg border border-slate-200">
                      <p className="text-sm text-slate-700 font-mono">
                        {selectedAuditReport.metadata?.regulatory_code_violated ||
                         selectedAuditReport.metadata?.ai_regulatory_code ||
                         'None'}
                      </p>
                    </div>
                  </div>

                  {/* Corrective Action */}
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Corrective Action Required
                    </label>
                    <div className="mt-2 p-4 bg-slate-50 rounded-lg border border-slate-200">
                      <p className="text-sm text-slate-700 leading-relaxed">
                        {selectedAuditReport.metadata?.corrective_action ||
                         selectedAuditReport.metadata?.ai_corrective_action ||
                         selectedAuditReport.metadata?.notes ||
                         'No action required'}
                      </p>
                    </div>
                  </div>

                  {/* Keywords Detected (if pre-validation) */}
                  {selectedAuditReport.metadata?.keywords_detected &&
                   selectedAuditReport.metadata.keywords_detected.length > 0 && (
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Keywords Detected
                      </label>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {selectedAuditReport.metadata.keywords_detected.map((keyword: string, idx: number) => (
                          <span
                            key={idx}
                            className="bg-rose-100 text-rose-700 px-2.5 py-1 rounded-md text-xs font-medium border border-rose-200"
                          >
                            {keyword}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Audit Timestamp */}
                  <div className="pt-4 border-t border-slate-200">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span className="font-medium">Audit Completed:</span>
                      <span className="font-mono">
                        {selectedAuditReport.metadata?.auditedAt || selectedAuditReport.metadata?.audit_run_at
                          ? new Date(selectedAuditReport.metadata.auditedAt || selectedAuditReport.metadata.audit_run_at).toLocaleString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit'
                            })
                          : 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="sticky bottom-0 bg-slate-50 border-t border-slate-200 px-6 py-4">
                  <button
                    onClick={() => setSelectedAuditReport(null)}
                    className="w-full bg-slate-800 hover:bg-slate-900 text-white font-medium py-2.5 px-4 rounded-lg transition-colors"
                  >
                    Close Report
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}