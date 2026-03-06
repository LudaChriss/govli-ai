'use client';

/**
 * My Requests Page
 * Shows authenticated user's FOIA requests with filtering and sorting
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getMyRequests } from '@/lib/api';
import { formatDate, getStatusDisplay } from '@/lib/utils';
import { ListSkeleton } from '@/components/LoadingSkeleton';
import type { FOIARequest } from '@/types';

type SortField = 'received_at' | 'subject' | 'status';
type SortOrder = 'asc' | 'desc';

export default function MyRequestsPage() {
  const [requests, setRequests] = useState<FOIARequest[]>([]);
  const [filteredRequests, setFilteredRequests] = useState<FOIARequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [sortField, setSortField] = useState<SortField>('received_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  useEffect(() => {
    loadRequests();
  }, []);

  useEffect(() => {
    filterAndSortRequests();
  }, [requests, statusFilter, sortField, sortOrder]);

  const loadRequests = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await getMyRequests();

      if (result.success && result.data) {
        setRequests(result.data);
      } else {
        setError(result.error?.message || 'Failed to load requests');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const filterAndSortRequests = () => {
    let filtered = [...requests];

    // Apply status filter
    if (statusFilter !== 'ALL') {
      filtered = filtered.filter((req) => req.status === statusFilter);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let compareA: number | string;
      let compareB: number | string;

      switch (sortField) {
        case 'received_at':
          compareA = new Date(a.received_at).getTime();
          compareB = new Date(b.received_at).getTime();
          break;
        case 'subject':
          compareA = a.subject.toLowerCase();
          compareB = b.subject.toLowerCase();
          break;
        case 'status':
          compareA = a.status;
          compareB = b.status;
          break;
        default:
          return 0;
      }

      if (compareA < compareB) return sortOrder === 'asc' ? -1 : 1;
      if (compareA > compareB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    setFilteredRequests(filtered);
  };


  const getStatusCount = (status: string): number => {
    if (status === 'ALL') return requests.length;
    return requests.filter((req) => req.status === status).length;
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-brand-navy mb-2">My Requests</h1>
          <p className="text-gray-600">
            View and track all your FOIA requests
          </p>
        </div>

        {/* Error State */}
        {error && (
          <div className="alert alert-error mb-6" role="alert">
            <p className="font-medium">Error loading requests</p>
            <p className="text-sm">{error}</p>
            <button
              onClick={loadRequests}
              className="btn btn-outline mt-3"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Loading State */}
        {isLoading && <ListSkeleton count={5} />}

        {/* Content */}
        {!isLoading && !error && (
          <>
            {/* Filters and Controls */}
            <div className="card p-4 mb-6">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                {/* Status Filter */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-700">Filter:</span>
                  {['ALL', 'PENDING', 'ACKNOWLEDGED', 'IN_PROGRESS', 'FULFILLED', 'DENIED'].map((status) => (
                    <button
                      key={status}
                      onClick={() => setStatusFilter(status)}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        statusFilter === status
                          ? 'bg-brand-navy text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                      aria-pressed={statusFilter === status}
                    >
                      {status === 'ALL' ? 'All' : getStatusDisplay(status).label}
                      <span className="ml-1.5 text-xs opacity-75">
                        ({getStatusCount(status)})
                      </span>
                    </button>
                  ))}
                </div>

                {/* Sort Controls */}
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-700">Sort by:</span>
                  <select
                    className="form-input py-1.5 text-sm"
                    value={`${sortField}-${sortOrder}`}
                    onChange={(e) => {
                      const [field, order] = e.target.value.split('-');
                      setSortField(field as SortField);
                      setSortOrder(order as SortOrder);
                    }}
                    aria-label="Sort requests"
                  >
                    <option value="received_at-desc">Newest First</option>
                    <option value="received_at-asc">Oldest First</option>
                    <option value="subject-asc">Subject A-Z</option>
                    <option value="subject-desc">Subject Z-A</option>
                    <option value="status-asc">Status A-Z</option>
                    <option value="status-desc">Status Z-A</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Results Count */}
            <div className="mb-4">
              <p className="text-sm text-gray-600">
                Showing {filteredRequests.length} of {requests.length} requests
              </p>
            </div>

            {/* Request Cards */}
            {filteredRequests.length > 0 ? (
              <div className="space-y-4">
                {filteredRequests.map((request) => (
                  <div key={request.id} className="card p-6 hover:shadow-md transition-shadow">
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                      {/* Request Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-3 mb-3">
                          <div className="flex-1 min-w-0">
                            <h3 className="text-lg font-semibold text-brand-navy mb-1 truncate">
                              {request.subject}
                            </h3>
                            <p className="text-sm text-gray-600">
                              Confirmation: <span className="font-mono font-medium">{request.confirmation_number}</span>
                            </p>
                          </div>
                          <span
                            className={`badge ${getStatusDisplay(request.status).color} text-white flex-shrink-0`}
                          >
                            {getStatusDisplay(request.status).label}
                          </span>
                        </div>

                        <p className="text-gray-700 mb-3 line-clamp-2">
                          {request.description}
                        </p>

                        <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                          <div>
                            <span className="font-medium">Submitted:</span>{' '}
                            {formatDate(request.received_at)}
                          </div>
                          {request.acknowledged_at && (
                            <div>
                              <span className="font-medium">Acknowledged:</span>{' '}
                              {formatDate(request.acknowledged_at)}
                            </div>
                          )}
                          {request.due_date && (
                            <div>
                              <span className="font-medium">Due:</span>{' '}
                              {formatDate(request.due_date)}
                            </div>
                          )}
                          {request.urgency === 'EXPEDITED' && (
                            <div>
                              <span className="badge bg-gold-500 text-white text-xs">
                                Expedited
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-row lg:flex-col gap-2 lg:items-end flex-shrink-0">
                        <Link
                          href={`/status?confirmation=${request.confirmation_number}`}
                          className="btn btn-outline text-sm"
                        >
                          View Status
                        </Link>

                        {request.status === 'FULFILLED' && (
                          <Link
                            href={`/responses/${request.id}/download`}
                            className="btn btn-primary text-sm"
                          >
                            Download
                          </Link>
                        )}

                        {request.status === 'DENIED' && (
                          <Link
                            href={`/appeal?request=${request.id}`}
                            className="btn btn-secondary text-sm"
                          >
                            File Appeal
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* Empty State */
              <div className="card p-12 text-center">
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
                <h3 className="text-lg font-semibold text-gray-700 mb-2">
                  {statusFilter === 'ALL' ? 'No Requests Yet' : 'No Matching Requests'}
                </h3>
                <p className="text-gray-600 mb-6">
                  {statusFilter === 'ALL'
                    ? "You haven't submitted any FOIA requests yet."
                    : `You don't have any requests with status: ${getStatusDisplay(statusFilter).label}`}
                </p>
                {statusFilter === 'ALL' ? (
                  <Link href="/submit-request" className="btn btn-primary">
                    Submit Your First Request
                  </Link>
                ) : (
                  <button
                    onClick={() => setStatusFilter('ALL')}
                    className="btn btn-outline"
                  >
                    Show All Requests
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {/* Quick Actions */}
        {!isLoading && !error && requests.length > 0 && (
          <div className="mt-8 card p-6 bg-blue-50 border-blue-200">
            <h3 className="font-semibold mb-3">Quick Actions</h3>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link href="/submit-request" className="btn btn-primary">
                Submit New Request
              </Link>
              <Link href="/agencies" className="btn btn-outline">
                View Agencies
              </Link>
              <Link href="/faq" className="btn btn-outline">
                FOIA Help
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
