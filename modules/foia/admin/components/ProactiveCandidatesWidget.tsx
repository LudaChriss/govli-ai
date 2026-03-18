/**
 * AI-11: Proactive Disclosure Candidates Widget
 * Admin dashboard widget showing top 5 pending proactive candidates
 */

import React, { useEffect, useState } from 'react';
import { AlertCircle, TrendingUp, FileText, Calendar, CheckCircle } from 'lucide-react';

interface ProactiveCandidate {
  id: string;
  cluster_name: string;
  should_publish: boolean;
  frequency_score: number;
  estimated_request_deflection_pct: number | null;
  justification: string;
  scan_date: string;
  status: 'PENDING' | 'APPROVED' | 'DISMISSED' | 'PUBLISHED';
}

interface WidgetProps {
  tenantId: string;
  apiBaseUrl: string;
  authToken: string;
}

export const ProactiveCandidatesWidget: React.FC<WidgetProps> = ({
  tenantId,
  apiBaseUrl,
  authToken
}) => {
  const [candidates, setCandidates] = useState<ProactiveCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCandidates();
  }, [tenantId]);

  const fetchCandidates = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        `${apiBaseUrl}/ai/proactive/candidates?status=PENDING&should_publish_only=true`,
        {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch proactive candidates');
      }

      const data = await response.json();

      // Get top 5 by frequency score
      const topCandidates = (data.data || [])
        .sort((a: ProactiveCandidate, b: ProactiveCandidate) =>
          b.frequency_score - a.frequency_score
        )
        .slice(0, 5);

      setCandidates(topCandidates);
    } catch (err: any) {
      setError(err.message);
      console.error('[ProactiveCandidatesWidget] Error fetching candidates:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (candidateId: string) => {
    try {
      const response = await fetch(
        `${apiBaseUrl}/ai/proactive/candidates/${candidateId}/decision`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            decision: 'approve',
            notes: 'Approved from dashboard widget'
          })
        }
      );

      if (!response.ok) {
        throw new Error('Failed to approve candidate');
      }

      // Refresh candidates list
      await fetchCandidates();
    } catch (err: any) {
      console.error('[ProactiveCandidatesWidget] Error approving candidate:', err);
      alert(`Error approving candidate: ${err.message}`);
    }
  };

  const handleDismiss = async (candidateId: string) => {
    const reason = prompt('Reason for dismissal:');
    if (!reason) return;

    try {
      const response = await fetch(
        `${apiBaseUrl}/ai/proactive/candidates/${candidateId}/decision`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            decision: 'dismiss',
            dismissal_reason: reason
          })
        }
      );

      if (!response.ok) {
        throw new Error('Failed to dismiss candidate');
      }

      // Refresh candidates list
      await fetchCandidates();
    } catch (err: any) {
      console.error('[ProactiveCandidatesWidget] Error dismissing candidate:', err);
      alert(`Error dismissing candidate: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <FileText className="w-5 h-5 text-[#1e56b0]" />
          Proactive Disclosure Candidates
        </h3>
        <div className="flex justify-center items-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <FileText className="w-5 h-5 text-[#1e56b0]" />
          Proactive Disclosure Candidates
        </h3>
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-4 rounded">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (candidates.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <FileText className="w-5 h-5 text-[#1e56b0]" />
          Proactive Disclosure Candidates
        </h3>
        <p className="text-gray-500 text-center py-8">
          No pending proactive disclosure candidates
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <FileText className="w-5 h-5 text-[#1e56b0]" />
          Proactive Disclosure Candidates
        </h3>
        <a
          href="/admin/proactive-candidates"
          className="text-sm text-[#1e56b0] hover:text-white"
        >
          View All →
        </a>
      </div>

      <div className="space-y-4">
        {candidates.map((candidate) => (
          <div
            key={candidate.id}
            className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <h4 className="font-medium text-gray-900 mb-1">
                  {candidate.cluster_name}
                </h4>
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <div className="flex items-center gap-1">
                    <TrendingUp className="w-4 h-4" />
                    <span>{candidate.frequency_score} requests/12mo</span>
                  </div>
                  {candidate.estimated_request_deflection_pct && (
                    <div className="flex items-center gap-1">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <span>{candidate.estimated_request_deflection_pct}% deflection</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <p className="text-sm text-gray-700 mb-3 line-clamp-2">
              {candidate.justification}
            </p>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <Calendar className="w-3 h-3" />
                <span>
                  Scanned {new Date(candidate.scan_date).toLocaleDateString()}
                </span>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleDismiss(candidate.id)}
                  className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 text-gray-700"
                >
                  Dismiss
                </button>
                <button
                  onClick={() => handleApprove(candidate.id)}
                  className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Approve
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {candidates.length === 5 && (
        <div className="mt-4 text-center">
          <a
            href="/admin/proactive-candidates"
            className="text-sm text-[#1e56b0] hover:text-white font-medium"
          >
            View all pending candidates →
          </a>
        </div>
      )}
    </div>
  );
};

export default ProactiveCandidatesWidget;
