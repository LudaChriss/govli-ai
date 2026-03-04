'use client';

/**
 * Agencies Directory Page
 * Searchable directory of agencies with contact information
 */

import { useState, useEffect } from 'react';
import { getAgencies } from '@/lib/api';
import { ListSkeleton } from '@/components/LoadingSkeleton';
import type { Agency } from '@/types';

export default function AgenciesPage() {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [filteredAgencies, setFilteredAgencies] = useState<Agency[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    loadAgencies();
  }, []);

  useEffect(() => {
    filterAgencies();
  }, [agencies, searchQuery]);

  const loadAgencies = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await getAgencies();

      if (result.success && result.data) {
        setAgencies(result.data);
      } else {
        setError(result.error?.message || 'Failed to load agencies');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const filterAgencies = () => {
    if (!searchQuery.trim()) {
      setFilteredAgencies(agencies);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = agencies.filter(
      (agency) =>
        agency.name.toLowerCase().includes(query) ||
        agency.description?.toLowerCase().includes(query) ||
        agency.contact_email.toLowerCase().includes(query)
    );

    setFilteredAgencies(filtered);
  };

  const copyToClipboard = async (text: string, id: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(`${id}-${type}`);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-brand-navy mb-2">
            Agency Directory
          </h1>
          <p className="text-gray-600">
            Find contact information for agencies to submit FOIA requests
          </p>
        </div>

        {/* Search Bar */}
        <div className="card p-4 mb-6">
          <label htmlFor="search" className="sr-only">
            Search agencies
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg
                className="h-5 w-5 text-gray-400"
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
            <input
              type="search"
              id="search"
              className="form-input pl-10"
              placeholder="Search by agency name, description, or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search agencies"
            />
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="alert alert-error mb-6" role="alert">
            <p className="font-medium">Error loading agencies</p>
            <p className="text-sm">{error}</p>
            <button onClick={loadAgencies} className="btn btn-outline mt-3">
              Try Again
            </button>
          </div>
        )}

        {/* Loading State */}
        {isLoading && <ListSkeleton count={6} />}

        {/* Results */}
        {!isLoading && !error && (
          <>
            {/* Results Count */}
            <div className="mb-4">
              <p className="text-sm text-gray-600">
                {searchQuery ? (
                  <>
                    Found {filteredAgencies.length} of {agencies.length} agencies
                  </>
                ) : (
                  <>Showing all {agencies.length} agencies</>
                )}
              </p>
            </div>

            {/* Agency Grid */}
            {filteredAgencies.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {filteredAgencies.map((agency) => (
                  <div key={agency.id} className="card p-6 hover:shadow-md transition-shadow">
                    {/* Agency Name */}
                    <h2 className="text-xl font-semibold text-brand-navy mb-3">
                      {agency.name}
                    </h2>

                    {/* Description */}
                    {agency.description && (
                      <p className="text-gray-700 text-sm mb-4 line-clamp-2">
                        {agency.description}
                      </p>
                    )}

                    {/* Contact Information */}
                    <div className="space-y-3">
                      {/* Email */}
                      <div className="flex items-start">
                        <svg
                          className="w-5 h-5 text-gray-400 mr-3 mt-0.5 flex-shrink-0"
                          fill="none"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
                        </svg>
                        <div className="flex-1 min-w-0">
                          <dt className="text-xs text-gray-600 mb-1">Email</dt>
                          <dd className="flex items-center gap-2">
                            <a
                              href={`mailto:${agency.contact_email}`}
                              className="text-brand-teal hover:underline text-sm truncate"
                            >
                              {agency.contact_email}
                            </a>
                            <button
                              onClick={() => copyToClipboard(agency.contact_email, agency.id, 'email')}
                              className="text-gray-400 hover:text-brand-teal flex-shrink-0"
                              aria-label="Copy email address"
                              title="Copy email address"
                            >
                              {copiedId === `${agency.id}-email` ? (
                                <svg
                                  className="w-4 h-4 text-green-600"
                                  fill="none"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="2"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path d="M5 13l4 4L19 7"></path>
                                </svg>
                              ) : (
                                <svg
                                  className="w-4 h-4"
                                  fill="none"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="2"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                                </svg>
                              )}
                            </button>
                          </dd>
                        </div>
                      </div>

                      {/* Phone */}
                      {agency.contact_phone && (
                        <div className="flex items-start">
                          <svg
                            className="w-5 h-5 text-gray-400 mr-3 mt-0.5 flex-shrink-0"
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path>
                          </svg>
                          <div className="flex-1 min-w-0">
                            <dt className="text-xs text-gray-600 mb-1">Phone</dt>
                            <dd className="flex items-center gap-2">
                              <a
                                href={`tel:${agency.contact_phone}`}
                                className="text-brand-teal hover:underline text-sm"
                              >
                                {agency.contact_phone}
                              </a>
                              <button
                                onClick={() => copyToClipboard(agency.contact_phone!, agency.id, 'phone')}
                                className="text-gray-400 hover:text-brand-teal flex-shrink-0"
                                aria-label="Copy phone number"
                                title="Copy phone number"
                              >
                                {copiedId === `${agency.id}-phone` ? (
                                  <svg
                                    className="w-4 h-4 text-green-600"
                                    fill="none"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path d="M5 13l4 4L19 7"></path>
                                  </svg>
                                ) : (
                                  <svg
                                    className="w-4 h-4"
                                    fill="none"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                                  </svg>
                                )}
                              </button>
                            </dd>
                          </div>
                        </div>
                      )}

                      {/* Address */}
                      {agency.contact_address && (
                        <div className="flex items-start">
                          <svg
                            className="w-5 h-5 text-gray-400 mr-3 mt-0.5 flex-shrink-0"
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
                            <path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
                          </svg>
                          <div className="flex-1 min-w-0">
                            <dt className="text-xs text-gray-600 mb-1">Address</dt>
                            <dd className="text-gray-700 text-sm whitespace-pre-wrap">
                              {agency.contact_address}
                            </dd>
                          </div>
                        </div>
                      )}

                      {/* Website */}
                      {agency.website && (
                        <div className="flex items-start">
                          <svg
                            className="w-5 h-5 text-gray-400 mr-3 mt-0.5 flex-shrink-0"
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"></path>
                          </svg>
                          <div className="flex-1 min-w-0">
                            <dt className="text-xs text-gray-600 mb-1">Website</dt>
                            <dd>
                              <a
                                href={agency.website}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-brand-teal hover:underline text-sm truncate block"
                              >
                                {agency.website}
                              </a>
                            </dd>
                          </div>
                        </div>
                      )}
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
                    <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-700 mb-2">
                  No Agencies Found
                </h3>
                <p className="text-gray-600 mb-6">
                  No agencies match your search. Try a different search term.
                </p>
                <button
                  onClick={() => setSearchQuery('')}
                  className="btn btn-outline"
                >
                  Clear Search
                </button>
              </div>
            )}
          </>
        )}

        {/* Help Section */}
        {!isLoading && !error && agencies.length > 0 && (
          <div className="mt-8 card p-6 bg-blue-50 border-blue-200">
            <h3 className="font-semibold mb-2">About Agency Contacts</h3>
            <p className="text-sm text-gray-700 mb-3">
              Each agency has its own FOIA office. Contact the agency directly if you have
              questions about their specific FOIA process or need assistance with your request.
            </p>
            <p className="text-sm text-gray-700">
              Click the copy icon next to contact information to quickly copy it to your clipboard.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
