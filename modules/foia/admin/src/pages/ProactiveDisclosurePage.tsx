import React from 'react';
import { Card, Badge } from '@govli/foia-ui';

export default function ProactiveDisclosurePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Proactive Disclosure</h1>
        <p className="text-gray-600 mt-1">AI-powered proactive disclosure candidate identification</p>
      </div>

      <Card className="p-8">
        <div className="text-center space-y-4">
          <div className="text-6xl">🌐</div>
          <h2 className="text-2xl font-semibold text-gray-900">Proactive Disclosure Intelligence</h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            This page will identify candidates for proactive disclosure:
          </p>
          <ul className="text-left max-w-xl mx-auto space-y-2 text-gray-700">
            <li>• AI analysis of frequently requested document types</li>
            <li>• Public interest scoring for documents</li>
            <li>• Redaction feasibility assessment</li>
            <li>• Cost-benefit analysis of proactive release</li>
            <li>• Batch processing recommendations</li>
            <li>• Publishing workflow and queue management</li>
            <li>• Impact tracking on future request volume</li>
            <li>• Transparency score dashboard</li>
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
