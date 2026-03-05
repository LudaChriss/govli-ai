import React from 'react';
import { Card, Badge, Button } from '@govli/foia-ui';

export default function FeeSchedulePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Fee Schedule Management</h1>
          <p className="text-gray-600 mt-1">Configure FOIA processing fees and fee categories</p>
        </div>
        <Button>Add Fee Category</Button>
      </div>

      <Card className="p-8">
        <div className="text-center space-y-4">
          <div className="text-6xl">💰</div>
          <h2 className="text-2xl font-semibold text-gray-900">FOIA Fee Configuration</h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            This page will manage fee schedules and automated fee calculation:
          </p>
          <ul className="text-left max-w-xl mx-auto space-y-2 text-gray-700">
            <li>• Configure fee schedules by requester category (commercial, media, etc.)</li>
            <li>• Set hourly rates for search, review, and duplication</li>
            <li>• Define fee waiver criteria and thresholds</li>
            <li>• Automated fee calculation based on request complexity</li>
            <li>• Fee waiver request workflow and approval</li>
            <li>• Payment tracking and invoicing</li>
            <li>• Fee reduction tracking and audit trail</li>
            <li>• Jurisdiction-specific fee rules</li>
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
