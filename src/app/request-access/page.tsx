'use client';

import { useState } from 'react';
import { submitRegistrationRequest } from 'src/app/actions/registration';
import { LEGAL_CONTACT_EMAIL } from '@/lib/legal';
import Link from 'next/link';
import BrandLogo from '@/components/BrandLogo';

export default function RequestAccessPage() {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    business_name: '',
    number_of_locations: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const result = await submitRegistrationRequest({
        first_name: formData.first_name.trim(),
        last_name: formData.last_name.trim(),
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone.trim(),
        business_name: formData.business_name.trim(),
        number_of_locations: parseInt(formData.number_of_locations, 10) || 1,
      });

      if (result.success) {
        setSubmittedEmail(formData.email.trim().toLowerCase());
        setSubmitted(true);
      } else {
        setError(result.error || 'Failed to submit request. Please try again.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Request Received</h2>
          <p className="text-slate-600 mb-2">
            Your access request for
          </p>
          <p className="text-blue-700 font-semibold mb-2 break-all">{submittedEmail}</p>
          <p className="text-slate-600 mb-6">
            is under review. Once approved, you will receive an invitation email with a link to set your password and begin onboarding.
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
          <div className="flex justify-center mb-6">
            <BrandLogo size="lg" showWordmark showTagline wordmarkClassName="text-white text-xl" />
          </div>
          <Link href="/" className="inline-block mb-6 text-blue-400 hover:text-blue-300 transition-colors text-sm font-medium">
            ← Back to Home
          </Link>
          <h1 className="text-4xl font-bold text-white mb-3">Request Platform Access</h1>
          <p className="text-blue-200 text-lg">
            Join the compliance platform built for regulated care facilities
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-slate-900">Owner Registration</h2>
            </div>
            <p className="text-sm text-slate-500">
              Create your account to start managing compliance across your facilities.
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-lg">
              <p className="text-sm text-rose-800 font-medium">❌ {error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* First Name + Last Name */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label htmlFor="first_name" className="block text-sm font-semibold text-slate-700 mb-2">
                  First Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  id="first_name"
                  name="first_name"
                  required
                  autoComplete="given-name"
                  value={formData.first_name}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  placeholder="Jane"
                />
              </div>
              <div>
                <label htmlFor="last_name" className="block text-sm font-semibold text-slate-700 mb-2">
                  Last Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  id="last_name"
                  name="last_name"
                  required
                  autoComplete="family-name"
                  value={formData.last_name}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  placeholder="Smith"
                />
              </div>
            </div>

            {/* Work Email + Phone */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-slate-700 mb-2">
                  Work Email <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  required
                  autoComplete="email"
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  placeholder="jane@yourcompany.com"
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
                  autoComplete="tel"
                  value={formData.phone}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  placeholder="(501) 555-0123"
                />
              </div>
            </div>

            {/* Business / Organization Name */}
            <div>
              <label htmlFor="business_name" className="block text-sm font-semibold text-slate-700 mb-2">
                Business / Organization Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                id="business_name"
                name="business_name"
                required
                autoComplete="organization"
                value={formData.business_name}
                onChange={handleChange}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                placeholder="Mid-South Care Management Group"
              />
            </div>

            {/* Number of Locations */}
            <div>
              <label htmlFor="number_of_locations" className="block text-sm font-semibold text-slate-700 mb-2">
                Number of Locations <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                id="number_of_locations"
                name="number_of_locations"
                required
                min="1"
                value={formData.number_of_locations}
                onChange={handleChange}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                placeholder="e.g. 3"
              />
              <p className="text-xs text-slate-500 mt-1.5">
                How many facilities will you be managing on the platform?
              </p>
            </div>

            {/* Submit */}
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
                  <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Submitting Request...
                </span>
              ) : (
                'Request Platform Access'
              )}
            </button>

            <p className="text-xs text-slate-500 text-center">
              By submitting this form you agree to be contacted by our team regarding platform
              access, and to our{' '}
              <Link href="/terms" className="underline hover:text-slate-700">Terms of Service</Link>{' '}
              and{' '}
              <Link href="/privacy" className="underline hover:text-slate-700">Privacy Policy</Link>.
            </p>
          </form>
        </div>

        {/* Footer */}
        <div className="text-center mt-8">
          <p className="text-blue-200 text-sm">
            Questions? Contact us at{' '}
            <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-blue-400 hover:text-blue-300 font-medium">
              {LEGAL_CONTACT_EMAIL}
            </a>
          </p>
          <div className="mt-3 flex items-center justify-center gap-4 text-xs text-blue-300">
            <Link href="/terms" className="hover:text-white">Terms</Link>
            <span aria-hidden="true">·</span>
            <Link href="/privacy" className="hover:text-white">Privacy</Link>
            <span aria-hidden="true">·</span>
            <Link href="/disclaimer" className="hover:text-white">Disclaimer</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
