import { Suspense } from 'react';
import ReadingRoomClient from './ReadingRoomClient';
import type { Metadata } from 'next';

/**
 * Reading Room - Server-rendered for SEO
 * Full-text search, filters, and download capabilities
 */

export const metadata: Metadata = {
  title: 'Reading Room - FOIA Portal',
  description: 'Browse and download previously released FOIA records. Search through thousands of public records available for immediate download.',
  keywords: ['FOIA Reading Room', 'Public Records', 'Released Documents', 'Government Records'],
};

// Server-side data fetching
async function getReleasedRecords(searchParams: {
  query?: string;
  department?: string;
  recordType?: string;
  from?: string;
  to?: string;
  page?: string;
}) {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

  try {
    const params = new URLSearchParams();
    if (searchParams.query) params.set('query', searchParams.query);
    if (searchParams.department) params.set('department', searchParams.department);
    if (searchParams.recordType) params.set('recordType', searchParams.recordType);
    if (searchParams.from) params.set('from', searchParams.from);
    if (searchParams.to) params.set('to', searchParams.to);
    params.set('page', searchParams.page || '1');
    params.set('limit', '20');

    const response = await fetch(`${API_URL}/api/v1/foia/reading-room?${params.toString()}`, {
      cache: 'no-store', // Always fetch fresh data for SEO
    });

    if (!response.ok) {
      throw new Error('Failed to fetch records');
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching reading room records:', error);
    return {
      success: false,
      data: {
        records: [],
        total: 0,
        page: 1,
        totalPages: 0
      }
    };
  }
}

export default async function ReadingRoomPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  // Extract query parameters
  const query = typeof searchParams.query === 'string' ? searchParams.query : undefined;
  const department = typeof searchParams.department === 'string' ? searchParams.department : undefined;
  const recordType = typeof searchParams.recordType === 'string' ? searchParams.recordType : undefined;
  const from = typeof searchParams.from === 'string' ? searchParams.from : undefined;
  const to = typeof searchParams.to === 'string' ? searchParams.to : undefined;
  const page = typeof searchParams.page === 'string' ? searchParams.page : '1';

  // Fetch data on server
  const result = await getReleasedRecords({ query, department, recordType, from, to, page });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* SEO-optimized heading */}
      <div className="bg-brand-navy text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold mb-4">
            FOIA Reading Room
          </h1>
          <p className="text-xl text-gray-200 max-w-3xl">
            Browse and download previously released public records. All documents have been reviewed
            and released under the Freedom of Information Act.
          </p>
        </div>
      </div>

      <Suspense fallback={<LoadingSkeleton />}>
        <ReadingRoomClient initialData={result} />
      </Suspense>
    </div>
  );
}

// Loading skeleton for suspense
function LoadingSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="animate-pulse space-y-6">
        <div className="h-12 bg-gray-200 rounded w-full"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="h-10 bg-gray-200 rounded"></div>
          <div className="h-10 bg-gray-200 rounded"></div>
          <div className="h-10 bg-gray-200 rounded"></div>
        </div>
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-32 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
    </div>
  );
}
