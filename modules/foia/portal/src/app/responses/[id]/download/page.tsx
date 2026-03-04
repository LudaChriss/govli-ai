'use client';

/**
 * Response Download Page
 * Shows response letter and documents available for download
 */

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getResponse, getResponseDocuments, getDocumentDownloadUrl } from '@/lib/api';
import { formatFileSize, formatDate } from '@/lib/utils';
import { PageSkeleton, Spinner } from '@/components/LoadingSkeleton';
import type { FOIAResponse, FOIADocument } from '@/types';

const RESPONSE_TYPE_LABELS: Record<string, string> = {
  FULL_GRANT: 'Full Grant',
  PARTIAL_GRANT: 'Partial Grant',
  FULL_DENIAL: 'Full Denial',
  NO_RECORDS: 'No Records Found',
  REFERRAL: 'Referral to Another Agency',
};

export default function ResponseDownloadPage() {
  const params = useParams();
  const responseId = params.id as string;

  const [response, setResponse] = useState<FOIAResponse | null>(null);
  const [documents, setDocuments] = useState<FOIADocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);

  useEffect(() => {
    loadResponseData();
  }, [responseId]);

  const loadResponseData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [responseResult, documentsResult] = await Promise.all([
        getResponse(responseId),
        getResponseDocuments(responseId),
      ]);

      if (responseResult.success && responseResult.data) {
        setResponse(responseResult.data);
      } else {
        setError(responseResult.error?.message || 'Failed to load response');
        return;
      }

      if (documentsResult.success && documentsResult.data) {
        setDocuments(documentsResult.data);
      } else {
        // Documents might be optional, so don't fail completely
        console.error('Failed to load documents:', documentsResult.error);
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadAll = async () => {
    setDownloadingAll(true);

    try {
      // Download all documents sequentially
      for (const doc of documents) {
        const url = getDocumentDownloadUrl(doc.id);
        const link = document.createElement('a');
        link.href = url;
        link.download = doc.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Small delay between downloads to prevent browser blocking
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (err) {
      console.error('Error downloading documents:', err);
    } finally {
      setDownloadingAll(false);
    }
  };

  const handleDownloadDocument = (doc: FOIADocument) => {
    const url = getDocumentDownloadUrl(doc.id);
    const link = document.createElement('a');
    link.href = url;
    link.download = doc.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <PageSkeleton />
        </div>
      </div>
    );
  }

  if (error || !response) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="alert alert-error" role="alert">
            <p className="font-medium">Error Loading Response</p>
            <p className="text-sm">{error || 'Response not found'}</p>
            <Link href="/my-requests" className="btn btn-outline mt-4">
              Back to My Requests
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const totalSize = documents.reduce((sum, doc) => sum + doc.file_size, 0);
  const redactedCount = documents.filter(doc => doc.redacted).length;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/my-requests"
            className="inline-flex items-center text-brand-teal hover:underline mb-4"
          >
            <svg
              className="w-4 h-4 mr-2"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path d="M15 19l-7-7 7-7"></path>
            </svg>
            Back to My Requests
          </Link>
          <h1 className="text-3xl font-bold text-brand-navy mb-2">
            Response Documents
          </h1>
          <p className="text-gray-600">
            Your FOIA request has been processed
          </p>
        </div>

        {/* Response Summary Card */}
        <div className="card p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold mb-1">Response Summary</h2>
              <p className="text-sm text-gray-600">
                Response Date: {formatDate(response.response_date)}
              </p>
            </div>
            <span className="badge bg-brand-teal text-white px-4 py-2">
              {RESPONSE_TYPE_LABELS[response.response_type] || response.response_type}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div className="bg-gray-50 p-4 rounded-md">
              <div className="text-2xl font-bold text-brand-navy">
                {response.documents_released || 0}
              </div>
              <div className="text-sm text-gray-600">Documents Released</div>
            </div>
            <div className="bg-gray-50 p-4 rounded-md">
              <div className="text-2xl font-bold text-brand-navy">
                {response.documents_withheld || 0}
              </div>
              <div className="text-sm text-gray-600">Documents Withheld</div>
            </div>
            <div className="bg-gray-50 p-4 rounded-md">
              <div className="text-2xl font-bold text-brand-navy">
                ${response.fees_assessed?.toFixed(2) || '0.00'}
              </div>
              <div className="text-sm text-gray-600">Fees Assessed</div>
            </div>
          </div>

          {response.exemptions_applied && response.exemptions_applied.length > 0 && (
            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
              <h3 className="font-semibold text-sm mb-2">Exemptions Applied</h3>
              <div className="flex flex-wrap gap-2">
                {response.exemptions_applied.map((exemption) => (
                  <span
                    key={exemption}
                    className="badge bg-yellow-600 text-white text-xs"
                  >
                    {exemption}
                  </span>
                ))}
              </div>
              <p className="text-xs text-gray-700 mt-2">
                Some information has been redacted or withheld under these FOIA exemptions.
              </p>
            </div>
          )}
        </div>

        {/* Response Letter */}
        {response.response_letter && (
          <div className="card p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Response Letter</h2>
            <div className="prose max-w-none">
              <div className="bg-gray-50 p-6 rounded-md border border-gray-200 whitespace-pre-wrap text-sm">
                {response.response_letter}
              </div>
            </div>
          </div>
        )}

        {/* Documents Section */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold">
                Released Documents ({documents.length})
              </h2>
              <p className="text-sm text-gray-600">
                Total size: {formatFileSize(totalSize)}
                {redactedCount > 0 && ` • ${redactedCount} redacted`}
              </p>
            </div>
            {documents.length > 1 && (
              <button
                onClick={handleDownloadAll}
                disabled={downloadingAll}
                className="btn btn-primary"
              >
                {downloadingAll ? (
                  <>
                    <Spinner size="sm" />
                    <span className="ml-2">Downloading...</span>
                  </>
                ) : (
                  'Download All'
                )}
              </button>
            )}
          </div>

          {documents.length > 0 ? (
            <div className="space-y-3">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-md hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center flex-1 min-w-0">
                    {/* File Icon */}
                    <div className="flex-shrink-0 mr-4">
                      <svg
                        className="w-10 h-10 text-gray-400"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path>
                      </svg>
                    </div>

                    {/* Document Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-gray-900 truncate">
                        {doc.filename}
                      </h3>
                      <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-gray-600">
                        <span>{formatFileSize(doc.file_size)}</span>
                        <span className="hidden sm:inline text-gray-400">•</span>
                        <span className="hidden sm:inline">
                          {doc.mime_type}
                        </span>
                        {doc.redacted && (
                          <>
                            <span className="text-gray-400">•</span>
                            <span className="badge bg-yellow-600 text-white text-xs">
                              Redacted
                            </span>
                          </>
                        )}
                      </div>
                      {doc.exemptions_applied && doc.exemptions_applied.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {doc.exemptions_applied.map((exemption) => (
                            <span
                              key={exemption}
                              className="text-xs text-gray-600"
                            >
                              {exemption}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Download Button */}
                  <button
                    onClick={() => handleDownloadDocument(doc)}
                    className="btn btn-outline ml-4 flex-shrink-0"
                    aria-label={`Download ${doc.filename}`}
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                    </svg>
                    <span className="ml-2 hidden sm:inline">Download</span>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <svg
                className="w-16 h-16 mx-auto mb-4 text-gray-400"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
              </svg>
              <p>No documents available for download</p>
            </div>
          )}
        </div>

        {/* Help Section */}
        <div className="mt-6 card p-6 bg-blue-50 border-blue-200">
          <h3 className="font-semibold mb-2">About Your Response</h3>
          <div className="text-sm text-gray-700 space-y-2">
            <p>
              These documents are available for download for 90 days from the response date.
              Please save them to your computer.
            </p>
            {response.response_type === 'PARTIAL_GRANT' && (
              <p>
                Your request was partially granted. Some documents or portions of documents
                may have been withheld or redacted under FOIA exemptions.
              </p>
            )}
            {response.response_type === 'FULL_DENIAL' && (
              <p className="font-medium">
                Your request was denied. You have the right to appeal this decision within 30 days.
              </p>
            )}
            {(response.response_type === 'PARTIAL_GRANT' || response.response_type === 'FULL_DENIAL') && (
              <div className="mt-4">
                <Link href="/appeal" className="btn btn-primary">
                  File an Appeal
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
