'use client';

/**
 * Reading Room Client Component
 * Interactive search, filtering, and downloads (v2.0)
 */

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

interface ReadingRoomRecord {
  id: string;
  request_id: string;
  title: string;
  description: string;
  department: string;
  record_type: string;
  released_at: string;
  file_url: string;
  file_size_bytes: number;
  page_count: number;
  relevance_score?: number;
}

interface ReadingRoomClientProps {
  initialData: {
    success: boolean;
    data: {
      records: ReadingRoomRecord[];
      total: number;
      page: number;
      totalPages: number;
    };
  };
}

export default function ReadingRoomClient({ initialData }: ReadingRoomClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(searchParams.get('query') || '');
  const [department, setDepartment] = useState(searchParams.get('department') || '');
  const [recordType, setRecordType] = useState(searchParams.get('recordType') || '');
  const [fromDate, setFromDate] = useState(searchParams.get('from') || '');
  const [toDate, setToDate] = useState(searchParams.get('to') || '');
  // const [isSearching, setIsSearching] = useState(false);

  const { records, total, page, totalPages } = initialData.data;

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      applyFilters();
    }, 500);

    return () => clearTimeout(timer);
  }, [query, department, recordType, fromDate, toDate]);

  const applyFilters = () => {
    const params = new URLSearchParams();

    if (query) params.set('query', query);
    if (department) params.set('department', department);
    if (recordType) params.set('recordType', recordType);
    if (fromDate) params.set('from', fromDate);
    if (toDate) params.set('to', toDate);

    router.push(`/reading-room?${params.toString()}`);
  };

  const resetFilters = () => {
    setQuery('');
    setDepartment('');
    setRecordType('');
    setFromDate('');
    setToDate('');
    router.push('/reading-room');
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const handleDownload = (record: ReadingRoomRecord) => {
    // Track download
    if (typeof window !== 'undefined' && 'navigator' in window && 'sendBeacon' in navigator) {
      navigator.sendBeacon('/api/v1/foia/analytics/download', JSON.stringify({
        record_id: record.id,
        timestamp: new Date().toISOString()
      }));
    }

    // Trigger download
    window.open(record.file_url, '_blank');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Search and Filters */}
      <div className="mb-8 space-y-4">
        {/* Search Bar */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search released records..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full px-4 py-3 pr-12 text-lg border-2 border-gray-300 rounded-lg focus:border-brand-teal focus:ring-2 focus:ring-brand-teal focus:ring-opacity-50"
            aria-label="Search records"
          />
          <svg
            className="absolute right-4 top-1/2 transform -translate-y-1/2 h-6 w-6 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label htmlFor="department" className="block text-sm font-medium text-gray-700 mb-1">
              Department
            </label>
            <select
              id="department"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:border-brand-teal focus:ring-brand-teal"
            >
              <option value="">All Departments</option>
              <option value="police">Police Department</option>
              <option value="fire">Fire Department</option>
              <option value="public-works">Public Works</option>
              <option value="planning">Planning & Zoning</option>
              <option value="finance">Finance</option>
              <option value="hr">Human Resources</option>
            </select>
          </div>

          <div>
            <label htmlFor="recordType" className="block text-sm font-medium text-gray-700 mb-1">
              Record Type
            </label>
            <select
              id="recordType"
              value={recordType}
              onChange={(e) => setRecordType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:border-brand-teal focus:ring-brand-teal"
            >
              <option value="">All Types</option>
              <option value="email">Emails</option>
              <option value="report">Reports</option>
              <option value="contract">Contracts</option>
              <option value="memo">Memos</option>
              <option value="minutes">Meeting Minutes</option>
              <option value="budget">Budget Documents</option>
            </select>
          </div>

          <div>
            <label htmlFor="fromDate" className="block text-sm font-medium text-gray-700 mb-1">
              From Date
            </label>
            <input
              type="date"
              id="fromDate"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:border-brand-teal focus:ring-brand-teal"
            />
          </div>

          <div>
            <label htmlFor="toDate" className="block text-sm font-medium text-gray-700 mb-1">
              To Date
            </label>
            <input
              type="date"
              id="toDate"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:border-brand-teal focus:ring-brand-teal"
            />
          </div>
        </div>

        {/* Filter Actions */}
        {(query || department || recordType || fromDate || toDate) && (
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-600">
              Showing {records.length} of {total} records
            </p>
            <button
              onClick={resetFilters}
              className="text-sm text-brand-teal hover:text-brand-teal-dark font-medium"
            >
              Clear all filters
            </button>
          </div>
        )}
      </div>

      {/* Results */}
      {records.length === 0 ? (
        <div className="text-center py-12">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No records found</h3>
          <p className="mt-1 text-sm text-gray-500">
            Try adjusting your search or filters
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {records.map((record) => (
            <div
              key={record.id}
              className="bg-white rounded-lg shadow border border-gray-200 p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-brand-navy mb-2">
                    {record.title}
                  </h3>
                  <p className="text-gray-700 mb-3">
                    {record.description}
                  </p>
                  <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                    <span className="flex items-center">
                      <svg className="h-4 w-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                      </svg>
                      Released: {formatDate(record.released_at)}
                    </span>
                    <span className="flex items-center">
                      <svg className="h-4 w-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9 2a2 2 0 00-2 2v8a2 2 0 002 2h6a2 2 0 002-2V6.414A2 2 0 0016.414 5L14 2.586A2 2 0 0012.586 2H9z" />
                      </svg>
                      {formatFileSize(record.file_size_bytes)} • {record.page_count} pages
                    </span>
                    <span className="px-2 py-1 bg-gray-100 rounded text-xs font-medium">
                      {record.department}
                    </span>
                    <span className="px-2 py-1 bg-navy-800 text-blue-800 rounded text-xs font-medium">
                      {record.record_type}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => handleDownload(record)}
                  className="ml-4 flex-shrink-0 btn btn-primary flex items-center"
                >
                  <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download
                </button>
              </div>

              {record.relevance_score && record.relevance_score > 0.5 && (
                <div className="mt-2 text-xs text-green-600 font-medium">
                  {Math.round(record.relevance_score * 100)}% match
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-8 flex justify-center items-center space-x-2">
          {page > 1 && (
            <button
              onClick={() => {
                const params = new URLSearchParams(searchParams.toString());
                params.set('page', String(page - 1));
                router.push(`/reading-room?${params.toString()}`);
              }}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Previous
            </button>
          )}

          <span className="text-gray-700">
            Page {page} of {totalPages}
          </span>

          {page < totalPages && (
            <button
              onClick={() => {
                const params = new URLSearchParams(searchParams.toString());
                params.set('page', String(page + 1));
                router.push(`/reading-room?${params.toString()}`);
              }}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Next
            </button>
          )}
        </div>
      )}
    </div>
  );
}
