'use client';

/**
 * Appeal Submission Page
 * Allows users to submit an appeal for a denied or partially granted FOIA request
 */

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { submitAppeal, getRequestById, getRequestByConfirmation } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import type { FOIARequest } from '@/types';

const APPEAL_REASONS = [
  { value: 'IMPROPER_EXEMPTION', label: 'Improper application of exemption' },
  { value: 'INADEQUATE_SEARCH', label: 'Inadequate or incomplete search' },
  { value: 'UNREASONABLE_FEES', label: 'Unreasonable fees assessed' },
  { value: 'PROCEDURAL_ERROR', label: 'Procedural error in processing' },
  { value: 'EXCESSIVE_REDACTION', label: 'Excessive or improper redaction' },
  { value: 'DELAY', label: 'Unreasonable delay in response' },
  { value: 'OTHER', label: 'Other (please explain)' },
];

export default function AppealPage() {
  const searchParams = useSearchParams();
  const requestIdFromUrl = searchParams.get('request');

  const [step, setStep] = useState<'lookup' | 'form'>('lookup');
  const [confirmationNumber, setConfirmationNumber] = useState('');
  const [request, setRequest] = useState<FOIARequest | null>(null);
  const [isLoadingRequest, setIsLoadingRequest] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const [appealReason, setAppealReason] = useState('');
  const [appealDetails, setAppealDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Auto-load request if ID is in URL
  useEffect(() => {
    if (requestIdFromUrl) {
      loadRequestById(requestIdFromUrl);
    }
  }, [requestIdFromUrl]);

  const loadRequestById = async (id: string) => {
    setIsLoadingRequest(true);
    setLookupError(null);

    try {
      const result = await getRequestById(id);

      if (result.success && result.data) {
        setRequest(result.data);
        setStep('form');
      } else {
        setLookupError(result.error?.message || 'Request not found');
      }
    } catch (err) {
      setLookupError('An unexpected error occurred');
    } finally {
      setIsLoadingRequest(false);
    }
  };

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!confirmationNumber.trim()) {
      setLookupError('Please enter a confirmation number');
      return;
    }

    setIsLoadingRequest(true);
    setLookupError(null);

    try {
      const result = await getRequestByConfirmation(confirmationNumber.trim());

      if (result.success && result.data) {
        setRequest(result.data);
        setStep('form');
      } else {
        setLookupError(result.error?.message || 'Request not found. Please check your confirmation number.');
      }
    } catch (err) {
      setLookupError('An unexpected error occurred');
    } finally {
      setIsLoadingRequest(false);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!appealReason) {
      newErrors.appealReason = 'Please select a reason for your appeal';
    }

    if (!appealDetails.trim()) {
      newErrors.appealDetails = 'Please provide details for your appeal';
    } else if (appealDetails.trim().length < 50) {
      newErrors.appealDetails = 'Please provide at least 50 characters explaining your appeal';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm() || !request) return;

    setIsSubmitting(true);
    setErrors({});

    try {
      const result = await submitAppeal(request.id, {
        appeal_reason: appealReason,
        appeal_details: appealDetails,
      });

      if (result.success && result.data) {
        setSuccessMessage(
          `Your appeal has been submitted successfully. Appeal ID: ${result.data.id}`
        );
        // Clear form
        setAppealReason('');
        setAppealDetails('');
      } else {
        setErrors({ submit: result.error?.message || 'Failed to submit appeal' });
      }
    } catch (err) {
      setErrors({ submit: 'An unexpected error occurred' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartOver = () => {
    setStep('lookup');
    setRequest(null);
    setConfirmationNumber('');
    setAppealReason('');
    setAppealDetails('');
    setErrors({});
    setLookupError(null);
    setSuccessMessage(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-brand-navy mb-2">
            File an Appeal
          </h1>
          <p className="text-gray-600">
            Appeal a denied or partially granted FOIA request
          </p>
        </div>

        {/* Success Message */}
        {successMessage && (
          <div className="alert alert-success mb-6" role="alert">
            <div className="flex items-start">
              <svg
                className="w-6 h-6 mr-3 flex-shrink-0"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              <div className="flex-1">
                <p className="font-medium mb-1">Appeal Submitted Successfully</p>
                <p className="text-sm">{successMessage}</p>
                <div className="mt-4 flex gap-3">
                  <Link href="/my-requests" className="btn btn-primary">
                    View My Requests
                  </Link>
                  <button onClick={handleStartOver} className="btn btn-outline">
                    Submit Another Appeal
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 1: Request Lookup */}
        {step === 'lookup' && !successMessage && (
          <div className="card p-6">
            <h2 className="text-xl font-semibold mb-4">
              Step 1: Find Your Request
            </h2>
            <p className="text-gray-600 mb-6">
              Enter your confirmation number to locate the request you want to appeal.
            </p>

            <form onSubmit={handleLookup}>
              <div className="mb-4">
                <label htmlFor="confirmation_number" className="form-label">
                  Confirmation Number
                </label>
                <input
                  type="text"
                  id="confirmation_number"
                  className="form-input"
                  placeholder="e.g., FOIA-2024-00123"
                  value={confirmationNumber}
                  onChange={(e) => setConfirmationNumber(e.target.value)}
                  aria-invalid={!!lookupError}
                  aria-describedby={lookupError ? 'lookup_error' : undefined}
                />
                {lookupError && (
                  <p id="lookup_error" className="form-error" role="alert">
                    {lookupError}
                  </p>
                )}
              </div>

              <button
                type="submit"
                className="btn btn-primary w-full sm:w-auto"
                disabled={isLoadingRequest}
              >
                {isLoadingRequest ? 'Searching...' : 'Find Request'}
              </button>
            </form>

            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
              <h3 className="font-semibold text-sm mb-2">Appeal Eligibility</h3>
              <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside">
                <li>You can appeal denied or partially granted requests</li>
                <li>Appeals must be filed within 30 days of receiving the response</li>
                <li>Provide specific reasons why you believe the decision should be reconsidered</li>
              </ul>
            </div>
          </div>
        )}

        {/* Step 2: Appeal Form */}
        {step === 'form' && request && !successMessage && (
          <>
            {/* Request Summary */}
            <div className="card p-6 mb-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-xl font-semibold mb-1">Request Details</h2>
                  <p className="text-sm text-gray-600">
                    Confirmation: {request.confirmation_number}
                  </p>
                </div>
                <button
                  onClick={handleStartOver}
                  className="btn btn-outline text-sm"
                >
                  Change Request
                </button>
              </div>

              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-gray-600">Subject:</dt>
                  <dd className="font-medium">{request.subject}</dd>
                </div>
                <div>
                  <dt className="text-gray-600">Status:</dt>
                  <dd className="font-medium">{request.status}</dd>
                </div>
                <div>
                  <dt className="text-gray-600">Submitted:</dt>
                  <dd className="font-medium">{formatDate(request.received_at)}</dd>
                </div>
              </dl>

              {(request.status !== 'DENIED' && request.status !== 'FULFILLED') && (
                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                  <p className="text-sm text-yellow-800">
                    <strong>Note:</strong> This request has not been completed yet.
                    Appeals are typically filed after receiving a response.
                  </p>
                </div>
              )}
            </div>

            {/* Appeal Form */}
            <div className="card p-6">
              <h2 className="text-xl font-semibold mb-4">
                Step 2: Explain Your Appeal
              </h2>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label htmlFor="appeal_reason" className="form-label">
                    Reason for Appeal <span className="text-red-600" aria-label="required">*</span>
                  </label>
                  <select
                    id="appeal_reason"
                    className="form-input"
                    value={appealReason}
                    onChange={(e) => {
                      setAppealReason(e.target.value);
                      if (errors.appealReason) {
                        setErrors((prev) => {
                          const newErrors = { ...prev };
                          delete newErrors.appealReason;
                          return newErrors;
                        });
                      }
                    }}
                    aria-required="true"
                    aria-invalid={!!errors.appealReason}
                    aria-describedby={errors.appealReason ? 'appeal_reason_error' : undefined}
                  >
                    <option value="">Select a reason</option>
                    {APPEAL_REASONS.map((reason) => (
                      <option key={reason.value} value={reason.value}>
                        {reason.label}
                      </option>
                    ))}
                  </select>
                  {errors.appealReason && (
                    <p id="appeal_reason_error" className="form-error" role="alert">
                      {errors.appealReason}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="appeal_details" className="form-label">
                    Detailed Explanation <span className="text-red-600" aria-label="required">*</span>
                  </label>
                  <textarea
                    id="appeal_details"
                    className="form-input"
                    rows={8}
                    placeholder="Provide a detailed explanation of why you believe the decision should be reconsidered. Include specific facts, legal arguments, or additional context that supports your appeal."
                    value={appealDetails}
                    onChange={(e) => {
                      setAppealDetails(e.target.value);
                      if (errors.appealDetails) {
                        setErrors((prev) => {
                          const newErrors = { ...prev };
                          delete newErrors.appealDetails;
                          return newErrors;
                        });
                      }
                    }}
                    aria-required="true"
                    aria-invalid={!!errors.appealDetails}
                    aria-describedby={errors.appealDetails ? 'appeal_details_error appeal_details_help' : 'appeal_details_help'}
                  />
                  <p id="appeal_details_help" className="form-help">
                    Be specific and provide as much detail as possible. Character count: {appealDetails.length}
                  </p>
                  {errors.appealDetails && (
                    <p id="appeal_details_error" className="form-error" role="alert">
                      {errors.appealDetails}
                    </p>
                  )}
                </div>

                {errors.submit && (
                  <div className="alert alert-error" role="alert">
                    {errors.submit}
                  </div>
                )}

                <div className="alert alert-info">
                  <p className="text-sm">
                    <strong>What happens next:</strong> Your appeal will be reviewed by a separate
                    authority within the agency. You will receive a response typically within 20-30
                    business days. The appeal decision is final.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-4">
                  <button
                    type="submit"
                    className="btn btn-primary flex-1"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Submitting Appeal...' : 'Submit Appeal'}
                  </button>
                  <button
                    type="button"
                    onClick={handleStartOver}
                    className="btn btn-outline flex-1"
                    disabled={isSubmitting}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </>
        )}

        {/* Help Section */}
        {!successMessage && (
          <div className="mt-6 card p-6 bg-blue-50 border-blue-200">
            <h3 className="font-semibold mb-2">Need Help with Your Appeal?</h3>
            <p className="text-sm text-gray-700 mb-3">
              If you have questions about the appeals process or need assistance preparing your appeal,
              please contact us.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 text-sm">
              <a href="mailto:foia@agency.gov" className="text-brand-teal hover:underline font-medium">
                foia@agency.gov
              </a>
              <span className="hidden sm:inline text-gray-400">|</span>
              <a href="tel:1-800-555-0100" className="text-brand-teal hover:underline font-medium">
                1-800-555-0100
              </a>
              <span className="hidden sm:inline text-gray-400">|</span>
              <Link href="/faq" className="text-brand-teal hover:underline font-medium">
                View FAQ
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
