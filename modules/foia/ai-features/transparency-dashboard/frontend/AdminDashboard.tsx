/**
 * AI-16: Transparency Admin Dashboard
 *
 * Internal admin view with peer comparison and settings
 */

import React, { useEffect, useState } from 'react';

interface TransparencyComponents {
  response_time: number;
  on_time_rate: number;
  proactive_disclosure: number;
  denial_rate: number;
  appeal_reversal: number;
}

interface OwnScore {
  score: number;
  components: TransparencyComponents;
  peer_percentile: number;
  calculated_at: string;
}

interface PeerScore {
  agency_name: string;
  score: number;
  peer_percentile: number;
}

interface PeerComparison {
  state: string;
  size_tier: string;
  state_average: number;
  national_average: number;
  peer_scores: PeerScore[];
}

interface AdminData {
  own_score: OwnScore;
  peer_comparison: PeerComparison;
}

interface Props {
  apiBaseUrl?: string;
  authToken?: string;
}

export const AdminDashboard: React.FC<Props> = ({
  apiBaseUrl = '',
  authToken
}) => {
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboardEnabled, setDashboardEnabled] = useState(false);
  const [publicEnabled, setPublicEnabled] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${apiBaseUrl}/api/v1/foia/transparency/admin`, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {}
      });

      if (!response.ok) {
        throw new Error('Failed to load dashboard');
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

  const updateSettings = async () => {
    try {
      setSaving(true);
      const response = await fetch(`${apiBaseUrl}/api/v1/foia/transparency/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify({
          transparency_dashboard_enabled: dashboardEnabled,
          transparency_public: publicEnabled
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update settings');
      }

      alert('Settings updated successfully');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  const triggerCalculation = async () => {
    if (!confirm('Manually trigger transparency score calculation?')) return;

    try {
      const response = await fetch(`${apiBaseUrl}/ai/transparency/calculate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        }
      });

      if (!response.ok) {
        throw new Error('Failed to calculate score');
      }

      alert('Score calculated successfully. Refreshing...');
      fetchDashboard();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to calculate score');
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
          {error || 'Failed to load transparency dashboard.'}
        </p>
        <button
          onClick={triggerCalculation}
          className="mt-4 px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
        >
          Calculate Initial Score
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Transparency Dashboard</h1>
          <p className="text-gray-600 mt-1">Monitor your agency's transparency performance</p>
        </div>
        <button
          onClick={triggerCalculation}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
        >
          Recalculate Score
        </button>
      </div>

      {/* Score Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <div className="text-4xl font-bold text-purple-600 mb-2">
            {data.own_score.score}
          </div>
          <div className="text-gray-600">Your Score</div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 text-center">
          <div className="text-4xl font-bold text-[#1e56b0] mb-2">
            {data.own_score.peer_percentile}th
          </div>
          <div className="text-gray-600">Peer Percentile</div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 text-center">
          <div className="text-4xl font-bold text-green-600 mb-2">
            {data.peer_comparison.state_average}
          </div>
          <div className="text-gray-600">State Average</div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 text-center">
          <div className="text-4xl font-bold text-orange-600 mb-2">
            {data.peer_comparison.national_average}
          </div>
          <div className="text-gray-600">National Average</div>
        </div>
      </div>

      {/* Component Breakdown */}
      <div className="bg-white rounded-lg shadow p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">Score Components</h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <ComponentCard
            label="Response Time"
            score={data.own_score.components.response_time}
            max={25}
          />
          <ComponentCard
            label="On-Time Rate"
            score={data.own_score.components.on_time_rate}
            max={25}
          />
          <ComponentCard
            label="Proactive Disclosure"
            score={data.own_score.components.proactive_disclosure}
            max={20}
          />
          <ComponentCard
            label="Low Denial Rate"
            score={data.own_score.components.denial_rate}
            max={15}
          />
          <ComponentCard
            label="Low Appeal Reversal"
            score={data.own_score.components.appeal_reversal}
            max={15}
          />
        </div>
      </div>

      {/* Peer Comparison */}
      <div className="bg-white rounded-lg shadow p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">
          Peer Comparison ({data.peer_comparison.state} - {data.peer_comparison.size_tier})
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Rank</th>
                <th className="text-left py-2">Agency</th>
                <th className="text-right py-2">Score</th>
                <th className="text-right py-2">Percentile</th>
              </tr>
            </thead>
            <tbody>
              {data.peer_comparison.peer_scores.map((peer, idx) => (
                <tr key={idx} className="border-b last:border-0">
                  <td className="py-2">#{idx + 1}</td>
                  <td className="py-2">{peer.agency_name}</td>
                  <td className="text-right font-semibold">{peer.score}</td>
                  <td className="text-right text-gray-600">{peer.peer_percentile}th</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Settings */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Public Dashboard Settings</h2>
        <div className="space-y-4">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={dashboardEnabled}
              onChange={(e) => setDashboardEnabled(e.target.checked)}
              className="mr-3 h-5 w-5"
            />
            <div>
              <div className="font-medium">Enable Transparency Dashboard</div>
              <div className="text-sm text-gray-600">
                Calculate transparency scores daily
              </div>
            </div>
          </label>

          <label className="flex items-center">
            <input
              type="checkbox"
              checked={publicEnabled}
              onChange={(e) => setPublicEnabled(e.target.checked)}
              className="mr-3 h-5 w-5"
            />
            <div>
              <div className="font-medium">Make Dashboard Public</div>
              <div className="text-sm text-gray-600">
                Allow citizens to view your transparency score
              </div>
            </div>
          </label>

          <button
            onClick={updateSettings}
            disabled={saving}
            className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>

        <div className="mt-6 p-4 bg-gray-50 rounded">
          <p className="text-sm text-gray-600">
            Last calculated: {new Date(data.own_score.calculated_at).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
};

/**
 * Component Card
 */
const ComponentCard: React.FC<{ label: string; score: number; max: number }> = ({
  label,
  score,
  max
}) => {
  const percentage = (score / max) * 100;

  return (
    <div className="text-center p-4 bg-gray-50 rounded-lg">
      <div className="text-3xl font-bold mb-1">{score}</div>
      <div className="text-xs text-gray-500 mb-2">/ {max} points</div>
      <div className="text-sm font-medium text-gray-700">{label}</div>
      <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
        <div
          className={`h-2 rounded-full ${getProgressColor(percentage)}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

function getProgressColor(percentage: number): string {
  if (percentage >= 80) return 'bg-green-500';
  if (percentage >= 60) return 'bg-yellow-500';
  if (percentage >= 40) return 'bg-orange-500';
  return 'bg-red-500';
}
