'use client';

import { useState } from 'react';
import { submitRegistrationRequest } from 'src/app/actions/registration';
import Link from 'next/link';

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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Check Your Email</h2>
          <p className="text-slate-600 mb-2">
            Your account has been created. We&apos;ve sent an invitation link to:
          </p>
          <p className="text-blue-700 font-semibold mb-6 break-all">{submittedEmail}</p>
          <p className="text-slate-500 text-sm mb-6">
            Click the link in the email to set your password and begin onboarding your facilities. Check your spam folder if you don&apos;t see it within a few minutes.
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
                  Creating Your Account...
                </span>
              ) : (
                'Create Account & Get Started'
              )}
            </button>

            <p className="text-xs text-slate-500 text-center">
              By submitting this form you agree to be contacted by our team regarding platform access.
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
