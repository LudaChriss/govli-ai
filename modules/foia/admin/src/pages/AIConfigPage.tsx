import React, { useState } from 'react';
import { Card, Button, Badge } from '@govli/foia-ui';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, subDays } from 'date-fns';

// Mock historical cost data
const historicalCostData = Array.from({ length: 30 }, (_, i) => ({
  date: format(subDays(new Date(), 29 - i), 'MM/dd'),
  cost: Math.floor(Math.random() * 30) + 10,
}));

// Mock feature accuracy data
const accuracyMetrics = [
  { feature: 'AI Scoping', accuracy: 94, overrideRate: 6, totalRuns: 245 },
  { feature: 'Redaction Suggestions', accuracy: 88, overrideRate: 12, totalRuns: 189 },
  { feature: 'Response Drafting', accuracy: 91, overrideRate: 9, totalRuns: 156 },
  { feature: 'Routing Recommendations', accuracy: 96, overrideRate: 4, totalRuns: 312 },
  { feature: 'Consistency Checks', accuracy: 92, overrideRate: 8, totalRuns: 203 },
];

interface AIFeature {
  id: string;
  name: string;
  enabled: boolean;
  description: string;
}

interface ModelConfig {
  tier: string;
  model: string;
}

export default function AIConfigPage() {
  const [monthlyBudget, setMonthlyBudget] = useState(500);
  const currentSpend = 267;
  const utilizationPercent = (currentSpend / monthlyBudget) * 100;

  const [modelConfigs, setModelConfigs] = useState<ModelConfig[]>([
    { tier: 'Simple', model: 'claude-3-haiku-20240307' },
    { tier: 'Complex', model: 'claude-3-sonnet-20240229' },
    { tier: 'Expedited', model: 'claude-3-opus-20240229' },
  ]);

  const [features, setFeatures] = useState<AIFeature[]>([
    { id: 'scoping', name: 'AI Scoping', enabled: true, description: 'Automatically analyze and scope incoming requests' },
    { id: 'redaction', name: 'Redaction Suggestions', enabled: true, description: 'AI-powered redaction recommendations' },
    { id: 'drafting', name: 'Response Drafting', enabled: true, description: 'Generate draft responses automatically' },
    { id: 'routing', name: 'Smart Routing', enabled: true, description: 'Intelligent request routing to departments' },
    { id: 'consistency', name: 'Consistency Checks', enabled: true, description: 'Ensure consistency across responses' },
    { id: 'vaughn', name: 'Vaughn Index Generation', enabled: false, description: 'Auto-generate Vaughn indices' },
    { id: 'proactive', name: 'Proactive Disclosure', enabled: false, description: 'Identify candidates for proactive disclosure' },
  ]);

  const toggleFeature = (id: string) => {
    setFeatures((prev) =>
      prev.map((feature) =>
        feature.id === id ? { ...feature, enabled: !feature.enabled } : feature
      )
    );
  };

  const updateModel = (tier: string, newModel: string) => {
    setModelConfigs((prev) =>
      prev.map((config) => (config.tier === tier ? { ...config, model: newModel } : config))
    );
  };

  const availableModels = [
    { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku (Fastest, Low Cost)' },
    { value: 'claude-3-sonnet-20240229', label: 'Claude 3 Sonnet (Balanced)' },
    { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus (Most Capable)' },
    { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet (Latest)' },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">AI Configuration</h1>
        <p className="text-gray-600 mt-1">Manage AI features, models, and budget settings</p>
      </div>

      {/* Token Budget Section */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Token Budget & Spend</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Monthly Budget ($)
                </label>
                <input
                  type="number"
                  value={monthlyBudget}
                  onChange={(e) => setMonthlyBudget(Number(e.target.value))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Current Spend</p>
                  <p className="text-2xl font-bold text-gray-900">${currentSpend}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Remaining</p>
                  <p className="text-2xl font-bold text-green-600">${monthlyBudget - currentSpend}</p>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">Utilization</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {utilizationPercent.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full ${
                      utilizationPercent > 90
                        ? 'bg-red-600'
                        : utilizationPercent > 75
                        ? 'bg-yellow-500'
                        : 'bg-green-500'
                    }`}
                    style={{ width: `${Math.min(utilizationPercent, 100)}%` }}
                  ></div>
                </div>
              </div>
              {utilizationPercent > 90 && (
                <Badge variant="error">Warning: Approaching budget limit</Badge>
              )}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Daily Spend (Last 7 Days)</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={historicalCostData.slice(-7)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="cost" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Card>

      {/* Model Routing Configuration */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Model Routing by Complexity</h2>
        <p className="text-sm text-gray-600 mb-4">
          Configure which AI model to use for different request complexity tiers
        </p>
        <div className="space-y-4">
          {modelConfigs.map((config) => (
            <div key={config.tier} className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
              <div className="flex-shrink-0 w-32">
                <Badge
                  variant={
                    config.tier === 'Expedited'
                      ? 'error'
                      : config.tier === 'Complex'
                      ? 'warning'
                      : 'info'
                  }
                >
                  {config.tier}
                </Badge>
              </div>
              <div className="flex-1">
                <select
                  value={config.model}
                  onChange={(e) => updateModel(config.tier, e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {availableModels.map((model) => (
                    <option key={model.value} value={model.value}>
                      {model.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="text-sm text-gray-600 w-24">
                {config.tier === 'Simple' && '$0.25/1K'}
                {config.tier === 'Complex' && '$3/1K'}
                {config.tier === 'Expedited' && '$15/1K'}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <Button>Save Model Configuration</Button>
        </div>
      </Card>

      {/* Feature Toggles */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">AI Feature Toggles</h2>
        <p className="text-sm text-gray-600 mb-4">
          Enable or disable individual AI features across the platform
        </p>
        <div className="space-y-3">
          {features.map((feature) => (
            <div
              key={feature.id}
              className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h3 className="font-semibold text-gray-900">{feature.name}</h3>
                  <Badge variant={feature.enabled ? 'success' : 'default'}>
                    {feature.enabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>
                <p className="text-sm text-gray-600 mt-1">{feature.description}</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={feature.enabled}
                  onChange={() => toggleFeature(feature.id)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          ))}
        </div>
      </Card>

      {/* Accuracy Metrics */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">AI Accuracy Metrics</h2>
        <p className="text-sm text-gray-600 mb-4">
          Performance metrics showing AI accuracy and human override rates
        </p>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Feature
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Accuracy
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Override Rate
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Total Runs
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {accuracyMetrics.map((metric, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                    {metric.feature}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${
                            metric.accuracy >= 90
                              ? 'bg-green-500'
                              : metric.accuracy >= 80
                              ? 'bg-yellow-500'
                              : 'bg-red-500'
                          }`}
                          style={{ width: `${metric.accuracy}%` }}
                        ></div>
                      </div>
                      <span className="text-sm font-semibold text-gray-900">
                        {metric.accuracy}%
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                    {metric.overrideRate}%
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                    {metric.totalRuns}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Badge
                      variant={
                        metric.accuracy >= 90
                          ? 'success'
                          : metric.accuracy >= 80
                          ? 'warning'
                          : 'error'
                      }
                    >
                      {metric.accuracy >= 90 ? 'Excellent' : metric.accuracy >= 80 ? 'Good' : 'Needs Review'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Cost History Chart */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">30-Day Cost History</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={historicalCostData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Line type="monotone" dataKey="cost" stroke="#3b82f6" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
        <div className="mt-4 grid grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-gray-600">Avg Daily</p>
            <p className="text-lg font-bold text-gray-900">$18.50</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Peak Day</p>
            <p className="text-lg font-bold text-gray-900">$39.00</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Lowest Day</p>
            <p className="text-lg font-bold text-gray-900">$11.00</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Trend</p>
            <p className="text-lg font-bold text-green-600">↓ 8.3%</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
