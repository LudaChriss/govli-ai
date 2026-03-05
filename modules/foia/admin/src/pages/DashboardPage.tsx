import React from 'react';
import { Card, Badge, Spinner } from '@govli/foia-ui';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, addDays } from 'date-fns';

// Mock data for workload forecast
const workloadData = Array.from({ length: 30 }, (_, i) => ({
  date: format(addDays(new Date(), i), 'MM/dd'),
  requests: Math.floor(Math.random() * 20) + 10,
}));

// Mock data for AI cost tracking
const costData = Array.from({ length: 7 }, (_, i) => ({
  day: format(addDays(new Date(), -6 + i), 'EEE'),
  cost: Math.floor(Math.random() * 50) + 30,
}));

// Mock activity feed
const activityFeed = [
  { id: '1', type: 'new', message: 'New FOIA request #2045 from John Smith', time: '2 min ago', icon: '📨' },
  { id: '2', type: 'ai', message: 'AI completed scoping for request #2044', time: '5 min ago', icon: '🤖' },
  { id: '3', type: 'assigned', message: 'Request #2043 assigned to Jane Doe', time: '12 min ago', icon: '👤' },
  { id: '4', type: 'completed', message: 'Request #2042 completed and sent', time: '25 min ago', icon: '✅' },
  { id: '5', type: 'warning', message: 'Request #2041 approaching deadline', time: '1 hour ago', icon: '⚠️' },
  { id: '6', type: 'ai', message: 'AI suggested redactions for request #2040', time: '2 hours ago', icon: '🖍️' },
  { id: '7', type: 'new', message: 'New FOIA request #2039 from Mary Johnson', time: '3 hours ago', icon: '📨' },
  { id: '8', type: 'completed', message: 'Request #2038 completed and sent', time: '4 hours ago', icon: '✅' },
];

// Mock SLA summary data
const slaSummary = [
  { urgency: 'OVERDUE', count: 3, color: 'bg-red-500' },
  { urgency: 'CRITICAL', count: 8, color: 'bg-orange-500' },
  { urgency: 'AT_RISK', count: 15, color: 'bg-yellow-500' },
  { urgency: 'ON_TRACK', count: 82, color: 'bg-green-500' },
];

export default function DashboardPage() {
  const kpis = [
    {
      label: 'Open Requests',
      value: '108',
      change: '+12',
      trend: 'up' as const,
      icon: '📋',
      color: 'blue',
    },
    {
      label: 'Avg Response Time',
      value: '14.2 days',
      change: '-2.1',
      trend: 'down' as const,
      icon: '⏱️',
      color: 'green',
    },
    {
      label: 'On-Time Rate',
      value: '87.5%',
      change: '+3.2%',
      trend: 'up' as const,
      icon: '✅',
      color: 'green',
    },
    {
      label: 'AI Actions Today',
      value: '42',
      change: '+8',
      trend: 'up' as const,
      icon: '🤖',
      color: 'purple',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-1">Welcome back! Here's what's happening today.</p>
      </div>

      {/* KPI Cards - Top Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpis.map((kpi, index) => (
          <Card key={index} className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">{kpi.label}</p>
                <p className="text-3xl font-bold text-gray-900">{kpi.value}</p>
                <div className="flex items-center gap-1 mt-2">
                  <span
                    className={`text-sm font-semibold ${
                      kpi.trend === 'up'
                        ? kpi.label.includes('Response Time')
                          ? 'text-red-600'
                          : 'text-green-600'
                        : 'text-green-600'
                    }`}
                  >
                    {kpi.change}
                  </span>
                  <span className="text-xs text-gray-500">vs last week</span>
                </div>
              </div>
              <div className="text-4xl">{kpi.icon}</div>
            </div>
          </Card>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity Feed - Left Column */}
        <div className="lg:col-span-2">
          <Card className="p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Activity Feed</h2>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {activityFeed.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <span className="text-2xl">{activity.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900">{activity.message}</p>
                    <p className="text-xs text-gray-500 mt-1">{activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* SLA Summary - Right Column */}
        <div>
          <Card className="p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">SLA Summary</h2>
            <div className="space-y-4">
              {slaSummary.map((item, index) => (
                <div key={index}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">{item.urgency}</span>
                    <span className="text-lg font-bold text-gray-900">{item.count}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`${item.color} h-2 rounded-full transition-all duration-300`}
                      style={{ width: `${(item.count / 108) * 100}%` }}
                    ></div>
                  </div>
                </div>
              ))}
              <div className="pt-4 border-t border-gray-200">
                <p className="text-xs text-gray-600">
                  Total: <span className="font-semibold">108 active requests</span>
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Workload Forecast */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Workload Forecast (Next 30 Days)
          </h2>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={workloadData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Line type="monotone" dataKey="requests" stroke="#3b82f6" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-4 flex items-center gap-2">
            <Badge variant="info">Predicted Peak: Day 15</Badge>
            <Badge variant="warning">High Load Period Ahead</Badge>
          </div>
        </Card>

        {/* AI Cost Tracker */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">AI Cost Tracker</h2>
          <div className="mb-4">
            <div className="flex items-baseline justify-between">
              <div>
                <p className="text-3xl font-bold text-gray-900">$267</p>
                <p className="text-sm text-gray-600">Month-to-date spend</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-semibold text-gray-700">$500</p>
                <p className="text-xs text-gray-500">Monthly budget</p>
              </div>
            </div>
            <div className="mt-3 w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-gradient-to-r from-blue-500 to-purple-600 h-3 rounded-full"
                style={{ width: '53.4%' }}
              ></div>
            </div>
            <p className="text-xs text-gray-600 mt-2">53.4% of monthly budget used</p>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={costData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="cost" fill="#8b5cf6" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}
