'use client';

import { useState } from 'react';
import { submitRegistrationRequest } from 'src/app/actions/registration';
import Link from 'next/link';

export default function RequestAccessPage() {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    business_name: '',
    contact_name: '',
    email: '',
    phone: '',
    facility_type: 'childcare' as 'childcare' | 'nursing_home',
    sub_classification: 'Licensed Child Care Center (CCC)',
    license_number: '',
    estimated_capacity: ''
  });

  // Sub-classification options based on facility type
  const getSubClassificationOptions = () => {
    if (formData.facility_type === 'childcare') {
      return [
        'Licensed Child Care Center (CCC)',
        'Licensed Family Child Care Home (FCCH)'
      ];
    } else {
      return [
        'Skilled Nursing Facility (SNF)',
        'Assisted Living Facility (Tier I/II)'
      ];
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const result = await submitRegistrationRequest({
        ...formData,
        estimated_capacity: parseInt(formData.estimated_capacity) || 0
      });

      if (result.success) {
        setSubmitted(true);
      } else {
        setError(result.error || 'Failed to submit request');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    // When facility_type changes, reset sub_classification and set default
    if (name === 'facility_type') {
      const newFacilityType = value as 'childcare' | 'nursing_home';
      const defaultSubClass = newFacilityType === 'childcare'
        ? 'Licensed Child Care Center (CCC)'
        : 'Skilled Nursing Facility (SNF)';
      
      setFormData(prev => ({
        ...prev,
        facility_type: newFacilityType,
        sub_classification: defaultSubClass
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Request Submitted!</h2>
          <p className="text-slate-600 mb-6">
            Thank you for your interest in AR Compliance Guard. Our team will review your request and contact you within 1-2 business days.
          </p>
          <Link
            href="/"
            className="inline-block bg-slate-900 hover:bg-slate-800 text-white font-medium py-3 px-6 rounded-lg transition-colors"
          >
            Return to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-block mb-6 text-blue-400 hover:text-blue-300 transition-colors text-sm font-medium">
            ← Back to Home
          </Link>
          <h1 className="text-4xl font-bold text-white mb-3">Request Platform Access</h1>
          <p className="text-blue-200 text-lg">
            Join Arkansas&apos;s premier compliance management system
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-slate-900">Facility Information</h2>
            </div>
            <p className="text-sm text-slate-500">
              Complete the form below to request access to the AR Compliance Guard platform.
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-lg">
              <p className="text-sm text-rose-800 font-medium">❌ {error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Business Name */}
            <div>
              <label htmlFor="business_name" className="block text-sm font-semibold text-slate-700 mb-2">
                Business Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                id="business_name"
                name="business_name"
                required
                value={formData.business_name}
                onChange={handleChange}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                placeholder="Little Stars Daycare Center"
              />
            </div>

            {/* Contact Name */}
            <div>
              <label htmlFor="contact_name" className="block text-sm font-semibold text-slate-700 mb-2">
                Contact Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                id="contact_name"
                name="contact_name"
                required
                value={formData.contact_name}
                onChange={handleChange}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                placeholder="Jane Smith"
              />
            </div>

            {/* Email & Phone Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-slate-700 mb-2">
                  Email Address <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  placeholder="jane@littlestars.com"
                />
              </div>

              <div>
                <label htmlFor="phone" className="block text-sm font-semibold text-slate-700 mb-2">
                  Phone Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  required
                  value={formData.phone}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  placeholder="(501) 555-0123"
                />
              </div>
            </div>

            {/* Facility Type */}
            <div>
              <label htmlFor="facility_type" className="block text-sm font-semibold text-slate-700 mb-2">
                Facility Type <span className="text-rose-500">*</span>
              </label>
              <select
                id="facility_type"
                name="facility_type"
                required
                value={formData.facility_type}
                onChange={handleChange}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-white"
              >
                <option value="childcare">Childcare Facility</option>
                <option value="nursing_home">Nursing Home</option>
              </select>
            </div>

            {/* Conditional Sub-Classification Dropdown */}
            <div className="animate-in fade-in slide-in-from-top-2 duration-300">
              <label htmlFor="sub_classification" className="block text-sm font-semibold text-slate-700 mb-2">
                Specific Licensing Sub-Classification <span className="text-rose-500">*</span>
              </label>
              <select
                id="sub_classification"
                name="sub_classification"
                required
                value={formData.sub_classification}
                onChange={handleChange}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-white"
              >
                {getSubClassificationOptions().map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500 mt-2">
                {formData.facility_type === 'childcare'
                  ? 'Select your DCCECE licensing classification'
                  : 'Select your OLTC licensing classification'}
              </p>
            </div>

            {/* License Number & Capacity Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="license_number" className="block text-sm font-semibold text-slate-700 mb-2">
                  License Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  id="license_number"
                  name="license_number"
                  required
                  value={formData.license_number}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  placeholder="AR-DC-12345"
                />
              </div>

              <div>
                <label htmlFor="estimated_capacity" className="block text-sm font-semibold text-slate-700 mb-2">
                  Estimated Capacity <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  id="estimated_capacity"
                  name="estimated_capacity"
                  required
                  min="1"
                  value={formData.estimated_capacity}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  placeholder="50"
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting}
              className={`w-full py-4 px-6 rounded-lg font-bold text-white transition-all ${
                submitting
                  ? 'bg-slate-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 shadow-lg hover:shadow-xl'
              }`}
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  Submitting Request...
                </span>
              ) : (
                'Submit Access Request'
              )}
            </button>

            <p className="text-xs text-slate-500 text-center mt-4">
              By submitting this form, you agree to be contacted by our team regarding platform access.
            </p>
          </form>
        </div>

        {/* Footer */}
        <div className="text-center mt-8">
          <p className="text-blue-200 text-sm">
            Questions? Contact us at{' '}
            <a href="mailto:support@arcomplianceguard.com" className="text-blue-400 hover:text-blue-300 font-medium">
              support@arcomplianceguard.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
