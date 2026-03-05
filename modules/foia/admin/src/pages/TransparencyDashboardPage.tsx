import React from 'react';
import { Card, Badge } from '@govli/foia-ui';

export default function TransparencyDashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Transparency Dashboard</h1>
        <p className="text-gray-600 mt-1">Public-facing transparency metrics and reporting</p>
      </div>

      <Card className="p-8">
        <div className="text-center space-y-4">
          <div className="text-6xl">👁️</div>
          <h2 className="text-2xl font-semibold text-gray-900">Agency Transparency Metrics</h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            This page will provide public transparency reporting and metrics:
          </p>
          <ul className="text-left max-w-xl mx-auto space-y-2 text-gray-700">
            <li>• Public-facing FOIA statistics dashboard</li>
            <li>• Annual report data compilation and visualization</li>
            <li>• Response time metrics by request type</li>
            <li>• Exemption usage statistics and trends</li>
            <li>• Backlog and pending request counts</li>
            <li>• Agency comparison benchmarking</li>
            <li>• Downloadable datasets and open data exports</li>
            <li>• Compliance with DOJ reporting requirements</li>
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
