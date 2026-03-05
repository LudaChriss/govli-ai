import React from 'react';
import { Card, Badge, Button } from '@govli/foia-ui';

export default function JurisdictionPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Jurisdiction Settings</h1>
          <p className="text-gray-600 mt-1">Configure federal, state, and local FOIA rules</p>
        </div>
        <Button>Configure Jurisdiction</Button>
      </div>

      <Card className="p-8">
        <div className="text-center space-y-4">
          <div className="text-6xl">🏛️</div>
          <h2 className="text-2xl font-semibold text-gray-900">Multi-Jurisdiction Configuration</h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            This page will configure jurisdiction-specific FOIA rules and regulations:
          </p>
          <ul className="text-left max-w-xl mx-auto space-y-2 text-gray-700">
            <li>• Federal vs. State vs. Local FOIA rule sets</li>
            <li>• Jurisdiction-specific exemptions and statutes</li>
            <li>• Response time requirements by jurisdiction</li>
            <li>• Fee schedules by jurisdiction</li>
            <li>• Required form fields and metadata</li>
            <li>• Compliance reporting requirements</li>
            <li>• Multi-jurisdiction agency support</li>
            <li>• AI training on jurisdiction-specific case law</li>
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
