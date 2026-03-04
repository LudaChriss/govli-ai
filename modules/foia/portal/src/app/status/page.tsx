'use client';

/**
 * Request Status Lookup Page
 * Allows users to check the status of their FOIA request using confirmation number
 */

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getRequestByConfirmation } from '@/lib/api';
import { formatDate, formatDateTime, getStatusDisplay } from '@/lib/utils';
import { Spinner } from '@/components/LoadingSkeleton';
import type { FOIARequest } from '@/types';

const STATUS_TIMELINE_STEPS = [
  { status: 'PENDING', label: 'Received', description: 'Request received and awaiting review' },
  { status: 'ACKNOWLEDGED', label: 'Acknowledged', description: 'Request acknowledged and assigned' },
  { status: 'IN_PROGRESS', label: 'Processing', description: 'Searching for and reviewing records' },
  { status: 'FULFILLED', label: 'Completed', description: 'Response ready for download' },
];

export default function StatusPage() {
  const searchParams = useSearchParams();
  const confirmationFromUrl = searchParams.get('confirmation');

  const [confirmationNumber, setConfirmationNumber] = useState(confirmationFromUrl || '');
  const [request, setRequest] = useState<FOIARequest | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Auto-search if confirmation number is in URL
  useEffect(() => {
    if (confirmationFromUrl) {
      handleSearch(confirmationFromUrl);
    }
  }, [confirmationFromUrl]);

  const handleSearch = async (confNumber?: string) => {
    const searchNumber = confNumber || confirmationNumber;

    if (!searchNumber.trim()) {
      setError('Please enter a confirmation number');
      return;
    }

    setIsLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const result = await getRequestByConfirmation(searchNumber.trim());

      if (result.success && result.data) {
        setRequest(result.data);
      } else {
        setError(result.error?.message || 'Request not found. Please check your confirmation number.');
        setRequest(null);
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
      setRequest(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch();
  };

  const getCurrentStepIndex = (status: string): number => {
    const statusOrder = ['PENDING', 'ACKNOWLEDGED', 'IN_PROGRESS', 'FULFILLED', 'DENIED'];
    return statusOrder.indexOf(status);
  };

  const getEstimatedCompletion = (request: FOIARequest): string => {
    if (request.due_date) {
      return formatDate(request.due_date);
    }
    if (request.urgency === 'EXPEDITED') {
      return 'Within 10 business days';
    }
    return '20-30 business days from acknowledgment';
  };

  const getNextSteps = (status: string): string[] => {
    switch (status) {
      case 'PENDING':
        return [
          'Your request will be reviewed and acknowledged within 3 business days',
          'You will receive an email confirmation with your tracking number',
        ];
      case 'ACKNOWLEDGED':
        return [
          'Records are being located and reviewed',
          'You will be notified if any issues arise',
          'You may be contacted if clarification is needed',
        ];
      case 'IN_PROGRESS':
        return [
          'Records are being processed and reviewed for release',
          'Redactions may be applied as required by law',
          'You will be notified when the response is ready',
        ];
      case 'FULFILLED':
        return [
          'Your response is ready for download',
          'Check your email for download instructions',
          'Documents are available for 90 days',
        ];
      case 'DENIED':
        return [
          'You have the right to appeal this decision',
          'Appeals must be filed within 30 days',
          'Review the denial letter for specific reasons',
        ];
      default:
        return ['Please contact us if you have questions'];
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-brand-navy mb-2">
            Check Request Status
          </h1>
          <p className="text-gray-600">
            Track your FOIA request using your confirmation number
          </p>
        </div>

        {/* Search Form */}
        <div className="card p-6 mb-8">
          <form onSubmit={handleSubmit}>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <label htmlFor="confirmation_number" className="sr-only">
                  Confirmation Number
                </label>
                <input
                  type="text"
                  id="confirmation_number"
                  className="form-input"
                  placeholder="Enter your confirmation number (e.g., FOIA-2024-00123)"
                  value={confirmationNumber}
                  onChange={(e) => setConfirmationNumber(e.target.value)}
                  aria-label="Confirmation number"
                  aria-describedby={error ? 'search_error' : undefined}
                />
              </div>
              <button
                type="submit"
                className="btn btn-primary sm:w-auto"
                disabled={isLoading}
              >
                {isLoading ? 'Searching...' : 'Check Status'}
              </button>
            </div>
            {error && !isLoading && (
              <p id="search_error" className="form-error mt-2" role="alert">
                {error}
              </p>
            )}
          </form>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="card p-8">
            <Spinner size="lg" />
            <p className="text-center text-gray-600 mt-4">Looking up your request...</p>
          </div>
        )}

        {/* Request Details */}
        {!isLoading && request && (
          <div className="space-y-6">
            {/* Status Overview Card */}
            <div className="card p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-brand-navy mb-1">
                    {request.subject}
                  </h2>
                  <p className="text-sm text-gray-600">
                    Confirmation: <span className="font-mono font-semibold">{request.confirmation_number}</span>
                  </p>
                </div>
                <div className="mt-4 sm:mt-0">
                  <span
                    className={`badge ${getStatusDisplay(request.status).color} text-white px-4 py-2 text-sm`}
                  >
                    {getStatusDisplay(request.status).label}
                  </span>
                </div>
              </div>

              {/* Timeline */}
              <div className="mb-6">
                <h3 className="font-semibold mb-4">Processing Timeline</h3>
                <div className="relative">
                  {STATUS_TIMELINE_STEPS.map((step, index) => {
                    const currentIndex = getCurrentStepIndex(request.status);
                    const stepIndex = getCurrentStepIndex(step.status);
                    const isComplete = stepIndex <= currentIndex;
                    const isCurrent = stepIndex === currentIndex;

                    return (
                      <div key={step.status} className="flex items-start mb-6 last:mb-0">
                        {/* Timeline Line */}
                        {index < STATUS_TIMELINE_STEPS.length - 1 && (
                          <div
                            className={`absolute left-4 top-10 w-0.5 h-12 ${
                              isComplete ? 'bg-brand-teal' : 'bg-gray-300'
                            }`}
                            style={{ marginTop: `${index * 96}px` }}
                          />
                        )}

                        {/* Status Indicator */}
                        <div className="relative z-10 flex-shrink-0">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                              isComplete
                                ? 'bg-brand-teal border-brand-teal'
                                : 'bg-white border-gray-300'
                            }`}
                          >
                            {isComplete && (
                              <svg
                                className="w-5 h-5 text-white"
                                fill="none"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path d="M5 13l4 4L19 7"></path>
                              </svg>
                            )}
                          </div>
                        </div>

                        {/* Status Content */}
                        <div className="ml-4 flex-1">
                          <h4
                            className={`font-semibold ${
                              isCurrent ? 'text-brand-teal' : isComplete ? 'text-gray-900' : 'text-gray-500'
                            }`}
                          >
                            {step.label}
                          </h4>
                          <p className="text-sm text-gray-600">{step.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Request Details */}
              <div className="border-t pt-6">
                <h3 className="font-semibold mb-3">Request Details</h3>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <dt className="text-gray-600">Submitted</dt>
                    <dd className="font-medium">{formatDate(request.received_at)}</dd>
                  </div>
                  {request.acknowledged_at && (
                    <div>
                      <dt className="text-gray-600">Acknowledged</dt>
                      <dd className="font-medium">{formatDate(request.acknowledged_at)}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-gray-600">Estimated Completion</dt>
                    <dd className="font-medium">{getEstimatedCompletion(request)}</dd>
                  </div>
                  {request.urgency === 'EXPEDITED' && (
                    <div>
                      <dt className="text-gray-600">Processing Type</dt>
                      <dd className="font-medium">
                        <span className="badge bg-gold-500 text-white">Expedited</span>
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            </div>

            {/* Next Steps Card */}
            <div className="card p-6">
              <h3 className="font-semibold text-lg mb-4">What Happens Next</h3>
              <ul className="space-y-3">
                {getNextSteps(request.status).map((step, index) => (
                  <li key={index} className="flex items-start">
                    <svg
                      className="w-5 h-5 text-brand-teal mr-3 mt-0.5 flex-shrink-0"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path d="M9 5l7 7-7 7"></path>
                    </svg>
                    <span className="text-gray-700">{step}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-4">
              {request.status === 'FULFILLED' && (
                <Link href={`/responses/${request.id}/download`} className="btn btn-primary flex-1">
                  Download Response
                </Link>
              )}
              {request.status === 'DENIED' && (
                <Link href="/appeal" className="btn btn-primary flex-1">
                  File an Appeal
                </Link>
              )}
              <Link href="/submit-request" className="btn btn-outline flex-1">
                Submit New Request
              </Link>
            </div>

            {/* Help Card */}
            <div className="card p-6 bg-blue-50 border-blue-200">
              <h3 className="font-semibold mb-2">Need Help?</h3>
              <p className="text-sm text-gray-700 mb-3">
                If you have questions about your request or need assistance, please contact us.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 text-sm">
                <a href="mailto:foia@agency.gov" className="text-brand-teal hover:underline font-medium">
                  foia@agency.gov
                </a>
                <span className="hidden sm:inline text-gray-400">|</span>
                <a href="tel:1-800-555-0100" className="text-brand-teal hover:underline font-medium">
                  1-800-555-0100
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !request && hasSearched && !error && (
          <div className="card p-8 text-center">
            <div className="text-gray-400 mb-4">
              <svg
                className="w-16 h-16 mx-auto"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-700 mb-2">No Request Found</h3>
            <p className="text-gray-600">
              We couldn't find a request with that confirmation number.
              Please check the number and try again.
            </p>
          </div>
        )}

        {/* Initial State - No Search */}
        {!isLoading && !request && !hasSearched && (
          <div className="card p-8">
            <div className="text-center">
              <div className="text-gray-400 mb-4">
                <svg
                  className="w-16 h-16 mx-auto"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-700 mb-2">Track Your Request</h3>
              <p className="text-gray-600 mb-6">
                Enter your confirmation number above to check the status of your FOIA request.
                You should have received this number via email when you submitted your request.
              </p>
              <Link href="/submit-request" className="btn btn-primary">
                Submit a New Request
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
