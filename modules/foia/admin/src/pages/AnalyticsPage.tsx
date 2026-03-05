import React from 'react';
import { Card, Badge } from '@govli/foia-ui';

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Analytics Overview</h1>
        <p className="text-gray-600 mt-1">Comprehensive FOIA analytics and insights</p>
      </div>

      <Card className="p-8">
        <div className="text-center space-y-4">
          <div className="text-6xl">📈</div>
          <h2 className="text-2xl font-semibold text-gray-900">Analytics Dashboard</h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            This page will provide comprehensive analytics and reporting:
          </p>
          <ul className="text-left max-w-xl mx-auto space-y-2 text-gray-700">
            <li>• Request volume trends and forecasts</li>
            <li>• Processing time analysis by department</li>
            <li>• SLA compliance metrics</li>
            <li>• AI performance and accuracy tracking</li>
            <li>• Cost analysis and budget tracking</li>
            <li>• Officer workload distribution</li>
            <li>• Custom report builder</li>
            <li>• Export to PDF, Excel, and CSV</li>
          </ul>
          <div className="pt-4 flex gap-3 justify-center">
            <Badge variant="info">Coming Soon</Badge>
            <Badge variant="default">Phase 2</Badge>
          </div>
        </div>
      </Card>
    </div>
  );
}
