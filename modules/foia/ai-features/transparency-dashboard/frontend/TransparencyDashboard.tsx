/**
 * AI-16: Public Transparency Dashboard - Portal Component
 *
 * Public-facing transparency dashboard for citizen portal
 */

import React, { useEffect, useState } from 'react';

interface TransparencyComponents {
  response_time: number;
  on_time_rate: number;
  proactive_disclosure: number;
  denial_rate: number;
  appeal_reversal: number;
}

interface MonthlyStats {
  month: string;
  requests_received: number;
  median_response_days: number;
  on_time_pct: number;
  denials: number;
  proactive_disclosures: number;
}

interface TopExemption {
  code: string;
  count: number;
  description: string;
}

interface DashboardData {
  agency_name: string;
  score: number;
  components: TransparencyComponents;
  peer_percentile: number;
  monthly_stats: MonthlyStats[];
  top_exemptions: TopExemption[];
  reading_room_count: number;
  last_updated: string;
}

interface Props {
  agencySlug: string;
  apiBaseUrl?: string;
}

export const TransparencyDashboard: React.FC<Props> = ({
  agencySlug,
  apiBaseUrl = ''
}) => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboard();
  }, [agencySlug]);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${apiBaseUrl}/public/transparency/${agencySlug}`);

      if (!response.ok) {
        throw new Error('Dashboard not available');
      }

      const result = await response.json();
      setData(result.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <p className="text-red-800">
          {error || 'Transparency dashboard is not available for this agency.'}
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg p-8 text-white mb-8">
        <h1 className="text-3xl font-bold mb-2">{data.agency_name}</h1>
        <p className="text-purple-100">Public Records Transparency Dashboard</p>
      </div>

      {/* Score Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="md:col-span-1">
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <div
              className={`w-40 h-40 mx-auto rounded-full flex items-center justify-center text-5xl font-bold text-white mb-4 ${getScoreColorClass(data.score)}`}
            >
              {data.score}
            </div>
            <h2 className="text-xl font-semibold mb-2">Transparency Score</h2>
            <p className="text-gray-600">
              {data.peer_percentile}th percentile among peers
            </p>
            <p className="text-sm text-gray-500 mt-4">
              Last updated: {new Date(data.last_updated).toLocaleDateString()}
            </p>
          </div>
        </div>

        {/* Component Scores */}
        <div className="md:col-span-2">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Score Breakdown</h3>
            <div className="space-y-4">
              <ScoreBar
                label="Response Time"
                score={data.components.response_time}
                max={25}
              />
              <ScoreBar
                label="On-Time Rate"
                score={data.components.on_time_rate}
                max={25}
              />
              <ScoreBar
                label="Proactive Disclosure"
                score={data.components.proactive_disclosure}
                max={20}
              />
              <ScoreBar
                label="Low Denial Rate"
                score={data.components.denial_rate}
                max={15}
              />
              <ScoreBar
                label="Low Appeal Reversal"
                score={data.components.appeal_reversal}
                max={15}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Monthly Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Monthly Performance Trends</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Month</th>
                  <th className="text-right py-2">Requests</th>
                  <th className="text-right py-2">Median Days</th>
                  <th className="text-right py-2">On-Time %</th>
                </tr>
              </thead>
              <tbody>
                {data.monthly_stats.slice(0, 6).map((stat, idx) => (
                  <tr key={idx} className="border-b last:border-0">
                    <td className="py-2">{formatMonth(stat.month)}</td>
                    <td className="text-right">{stat.requests_received}</td>
                    <td className="text-right">{stat.median_response_days.toFixed(1)}</td>
                    <td className="text-right">{stat.on_time_pct.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Top Exemptions Used</h3>
          <div className="space-y-3">
            {data.top_exemptions.slice(0, 5).map((exemption, idx) => (
              <div key={idx} className="flex justify-between items-start">
                <div className="flex-1">
                  <p className="font-medium text-sm">{exemption.code}</p>
                  <p className="text-xs text-gray-600">{exemption.description}</p>
                </div>
                <span className="ml-4 px-3 py-1 bg-gray-100 rounded-full text-sm font-semibold">
                  {exemption.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Reading Room */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Reading Room Documents</h3>
            <p className="text-gray-600 mt-1">
              Proactively disclosed public records available for review
            </p>
          </div>
          <div className="text-4xl font-bold text-purple-600">
            {data.reading_room_count}
          </div>
        </div>
      </div>

      {/* Embed Code */}
      <div className="mt-8 bg-gray-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-2">Embed This Dashboard</h3>
        <p className="text-gray-600 mb-4">
          Copy and paste this code to embed this dashboard on your website:
        </p>
        <code className="block bg-white p-4 rounded border text-sm overflow-x-auto">
          {`<iframe src="${apiBaseUrl}/public/transparency/${agencySlug}/embed" width="100%" height="800" frameborder="0"></iframe>`}
        </code>
      </div>
    </div>
  );
};

/**
 * Score Bar Component
 */
const ScoreBar: React.FC<{ label: string; score: number; max: number }> = ({
  label,
  score,
  max
}) => {
  const percentage = (score / max) * 100;

  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-sm text-gray-600">{score}/{max}</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-3">
        <div
          className={`h-3 rounded-full transition-all ${getProgressColorClass(percentage)}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

/**
 * Helper: Get score color class
 */
function getScoreColorClass(score: number): string {
  if (score >= 80) return 'bg-green-500';
  if (score >= 60) return 'bg-yellow-500';
  if (score >= 40) return 'bg-orange-500';
  return 'bg-red-500';
}

/**
 * Helper: Get progress bar color class
 */
function getProgressColorClass(percentage: number): string {
  if (percentage >= 80) return 'bg-green-500';
  if (percentage >= 60) return 'bg-yellow-500';
  if (percentage >= 40) return 'bg-orange-500';
  return 'bg-red-500';
}

/**
 * Helper: Format month string
 */
function formatMonth(monthStr: string): string {
  const [year, month] = monthStr.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}
