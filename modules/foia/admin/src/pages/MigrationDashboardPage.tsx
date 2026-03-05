import React from 'react';
import { Card, Badge, Button } from '@govli/foia-ui';

export default function MigrationDashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Migration Dashboard</h1>
          <p className="text-gray-600 mt-1">Legacy system data migration and import tools</p>
        </div>
        <Button>Start New Migration</Button>
      </div>

      <Card className="p-8">
        <div className="text-center space-y-4">
          <div className="text-6xl">🔄</div>
          <h2 className="text-2xl font-semibold text-gray-900">Data Migration Tools</h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            This page will provide tools for migrating from legacy FOIA systems:
          </p>
          <ul className="text-left max-w-xl mx-auto space-y-2 text-gray-700">
            <li>• Import wizard for common FOIA systems (FOIAXpress, AccessFOIA, etc.)</li>
            <li>• CSV and Excel bulk import with field mapping</li>
            <li>• Data validation and error checking</li>
            <li>• Document attachment migration</li>
            <li>• Historical data preservation</li>
            <li>• Progress tracking and rollback capability</li>
            <li>• Data quality reports and cleanup tools</li>
            <li>• Test migration sandbox environment</li>
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
